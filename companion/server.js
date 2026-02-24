/**
 * Companion — Reading in the Margins
 * Proxy Server
 *
 * Handles two jobs:
 *   1. Forwards AI annotation requests to the Claude API (keeps API key secure)
 *   2. Proxies Pressbooks REST API requests (works around CORS restrictions)
 *
 * SETUP:
 *   1. npm install
 *   2. export ANTHROPIC_API_KEY=sk-ant-...
 *   3. node server.js
 *
 * Endpoints:
 *   POST /api/generate          → Claude API proxy
 *   GET  /api/health            → Health check
 *   GET  /api/books             → List all TRU Open Press books
 *   GET  /api/toc?bookUrl=...   → Table of contents for a specific book
 *   GET  /api/chapter?bookUrl=...&chapterId=...  → Full text of a chapter
 */

const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3002;  // 3002 to avoid clash with Nova (3001) and Rhizo (3001)
const API_KEY   = process.env.ANTHROPIC_API_KEY;
const PB_NETWORK = 'https://pressbooks.tru.ca';

if (!API_KEY) {
  console.error('\n  ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  console.error('  Run: export ANTHROPIC_API_KEY=sk-ant-your-key-here\n');
  process.exit(1);
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// ── Root → serve the app ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/companion.html');
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Companion proxy is running.' });
});

// ── Claude API proxy ──────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Request body must contain a "prompt" string.' });
  }

  if (prompt.length > 60000) {
    return res.status(400).json({ error: 'Prompt exceeds maximum length. Use a shorter passage or chapter.' });
  }

  console.log(`[${new Date().toISOString()}] Claude request (${prompt.length} chars)`);

  let claudeResponse;
  try {
    claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (fetchErr) {
    console.error('Network error reaching Claude API:', fetchErr.message);
    return res.status(502).json({ error: `Could not reach Claude API: ${fetchErr.message}` });
  }

  const body = await claudeResponse.json();

  if (!claudeResponse.ok) {
    console.error('Claude API error:', claudeResponse.status, JSON.stringify(body));
    return res.status(claudeResponse.status).json({
      error: body?.error?.message || `Claude API returned HTTP ${claudeResponse.status}`,
    });
  }

  console.log(`[${new Date().toISOString()}] Claude responded (${body?.usage?.output_tokens ?? '?'} tokens)`);
  res.json(body);
});

// ── Book quality filter ────────────────────────────────────────────────────────
const JUNK_SLUG_KEYWORDS = [
  'sandbox', 'sample', 'test', 'demo', 'h5p', 'hypothesis',
  'import', 'workshop', 'template', 'training', 'trial',
  'temp', '-dev', 'devsite', 'dev2',
];
const JUNK_TITLE_KEYWORDS = [
  'sandbox', 'sample', 'testbook', 'test book', 'demo book',
  'workshop', 'template', 'dev site', 'dev 2',
];

function isJunkBook(b) {
  const meta = b.metadata || {};
  if (meta.inCatalog === true) return false;
  const link  = (b.link || '').toLowerCase();
  const slug  = link.replace('https://', '').replace('.pressbooks.tru.ca/', '').replace('/', '');
  const title = (meta.name || '').toLowerCase();
  if (JUNK_SLUG_KEYWORDS.some(k => slug.includes(k)))  return true;
  if (JUNK_TITLE_KEYWORDS.some(k => title.includes(k))) return true;
  return false;
}

// ── Book list cache ────────────────────────────────────────────────────────────
let booksCache    = null;
let booksCacheTime = 0;
const BOOKS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function parseBook(b) {
  const meta = b.metadata || {};
  const title     = meta.name || b.title || 'Untitled';
  const authorArr = Array.isArray(meta.author) ? meta.author : [];
  const author    = authorArr.map(a => a.name).filter(Boolean).join(', ');
  const license   = meta.license?.code || meta.license?.name || '';
  const aboutArr  = Array.isArray(meta.about) ? meta.about : [];
  const subject   = aboutArr.map(a => a.name).filter(Boolean).join(', ');
  return {
    id:          b.id,
    title:       title.trim(),
    link:        (b.link || '').replace(/\/$/, ''),
    author,
    license,
    subject,
    inCatalog:   meta.inCatalog === true,
    wordCount:   meta.wordCount || 0,
    lastUpdated: meta.lastUpdated || '',
  };
}

// ── List all TRU Open Press books ─────────────────────────────────────────────
app.get('/api/books', async (req, res) => {
  const showAll = req.query.all === '1';

  if (!showAll && booksCache && (Date.now() - booksCacheTime) < BOOKS_CACHE_TTL) {
    console.log(`[${new Date().toISOString()}] Serving ${booksCache.length} books from cache`);
    return res.json(booksCache);
  }

  console.log(`[${new Date().toISOString()}] Fetching book list from Pressbooks`);

  try {
    const page1url = `${PB_NETWORK}/wp-json/pressbooks/v2/books?per_page=10&page=1`;
    const r1 = await fetch(page1url, { headers: { 'Accept': 'application/json' } });
    if (!r1.ok) throw new Error(`Pressbooks returned HTTP ${r1.status} on page 1`);

    const totalPages  = parseInt(r1.headers.get('X-WP-TotalPages') || '1', 10);
    const page1books  = await r1.json();

    const remainingFetches = [];
    for (let p = 2; p <= totalPages; p++) {
      const url = `${PB_NETWORK}/wp-json/pressbooks/v2/books?per_page=10&page=${p}`;
      remainingFetches.push(
        fetch(url, { headers: { 'Accept': 'application/json' } })
          .then(r => {
            if (!r.ok) throw new Error(`Pressbooks returned HTTP ${r.status} on page ${p}`);
            return r.json();
          })
      );
    }
    const remainingResults = await Promise.all(remainingFetches);

    const rawBooks = [page1books, ...remainingResults].flat();
    const allBooks = rawBooks
      .filter(b => showAll || !isJunkBook(b))
      .map(parseBook);

    allBooks.sort((a, b) => a.title.localeCompare(b.title));

    if (!showAll) {
      booksCache     = allBooks;
      booksCacheTime = Date.now();
    }

    console.log(`[${new Date().toISOString()}] Returned ${allBooks.length} books`);
    res.json(allBooks);

  } catch (err) {
    console.error('Error fetching books:', err.message);
    res.status(502).json({ error: `Could not fetch book list: ${err.message}` });
  }
});

// ── Table of contents ──────────────────────────────────────────────────────────
app.get('/api/toc', async (req, res) => {
  const { bookUrl } = req.query;

  if (!bookUrl) {
    return res.status(400).json({ error: 'bookUrl query parameter is required.' });
  }

  try {
    const parsed = new URL(bookUrl);
    if (!parsed.hostname.endsWith('.pressbooks.tru.ca') && parsed.hostname !== 'pressbooks.tru.ca') {
      return res.status(400).json({ error: 'bookUrl must be a pressbooks.tru.ca subdomain.' });
    }
  } catch {
    return res.status(400).json({ error: 'bookUrl is not a valid URL.' });
  }

  const tocUrl = `${bookUrl}/wp-json/pressbooks/v2/toc`;
  console.log(`[${new Date().toISOString()}] Fetching TOC: ${tocUrl}`);

  try {
    const r = await fetch(tocUrl, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const toc = await r.json();

    const parts = (toc.parts || [])
      .filter(p => Array.isArray(p.chapters) && p.chapters.length > 0)
      .map(p => ({
        id:       p.id,
        title:    p.title || 'Untitled Part',
        chapters: p.chapters
          .filter(c => c.status === 'publish' && c.has_post_content)
          .map(c => ({
            id:        c.id,
            title:     c.title || 'Untitled Chapter',
            slug:      c.slug,
            link:      c.link,
            wordCount: c.word_count || 0,
          })),
      }))
      .filter(p => p.chapters.length > 0);

    res.json(parts);

  } catch (err) {
    console.error('Error fetching TOC:', err.message);
    res.status(502).json({ error: `Could not fetch table of contents: ${err.message}` });
  }
});

// ── Fetch a single chapter ─────────────────────────────────────────────────────
app.get('/api/chapter', async (req, res) => {
  const { bookUrl, chapterId } = req.query;

  if (!bookUrl || !chapterId) {
    return res.status(400).json({ error: 'bookUrl and chapterId query parameters are required.' });
  }

  try {
    const parsed = new URL(bookUrl);
    if (!parsed.hostname.endsWith('.pressbooks.tru.ca') && parsed.hostname !== 'pressbooks.tru.ca') {
      return res.status(400).json({ error: 'bookUrl must be a pressbooks.tru.ca subdomain.' });
    }
  } catch {
    return res.status(400).json({ error: 'bookUrl is not a valid URL.' });
  }

  const chapterUrl = `${bookUrl}/wp-json/pressbooks/v2/chapters/${chapterId}`;
  console.log(`[${new Date().toISOString()}] Fetching chapter: ${chapterUrl}`);

  try {
    const r = await fetch(chapterUrl, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const chapter = await r.json();

    const htmlContent = chapter?.content?.rendered || '';
    const title       = chapter?.title?.rendered   || 'Untitled Chapter';
    const link        = chapter?.link || '';
    const plainText   = htmlToPlainText(htmlContent);

    res.json({
      id:        chapter.id,
      title:     stripHtml(title),
      link,
      wordCount: plainText.split(/\s+/).filter(Boolean).length,
      text:      plainText,
    });

  } catch (err) {
    console.error('Error fetching chapter:', err.message);
    res.status(502).json({ error: `Could not fetch chapter: ${err.message}` });
  }
});

// ── HTML → plain text ──────────────────────────────────────────────────────────
function htmlToPlainText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(p|div|h[1-6]|li|blockquote|tr|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '–').trim();
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Companion — Reading in the Margins`);
  console.log(`  Open in your browser → http://localhost:${PORT}`);
  console.log(`  API key: ${API_KEY.slice(0, 12)}…\n`);
});
