/**
 * Open Margins Suite — Shared Proxy Server
 *
 * Handles two jobs:
 *   1. Forwards AI generation prompts to the Claude API (keeps API key secure)
 *   2. Proxies Pressbooks REST API requests (works around CORS restrictions)
 *
 * SETUP:
 *   1. npm install
 *   2. export ANTHROPIC_API_KEY=sk-ant-...
 *   3. node server.js
 *
 * Endpoints:
 *   GET  /                          → health check
 *   POST /api/generate              → Claude API proxy
 *   GET  /api/books                 → List all TRU Open Press books
 *   GET  /api/toc?bookUrl=...       → Table of contents for a specific book
 *   GET  /api/chapter?bookUrl=...&chapterId=...  → Full text of a chapter
 *
 * Used by: Nova, Rhizo, Companion, Sylva, Activity Builder
 * Port: 3001 (shared across all tools — run only one instance)
 */

const express = require('express');
const cors    = require('cors');

const app     = express();
const PORT    = process.env.PORT || 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const PB_NETWORK = 'https://pressbooks.tru.ca';

if (!API_KEY) {
  console.error('\n  ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  console.error('  Export it before starting: export ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '4mb' }));

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Open Margins proxy is running.', port: PORT });
});

// ── GET /api/generate — friendly error for accidental browser visits ───────────
app.get('/api/generate', (req, res) => {
  res.status(405).json({ error: 'This endpoint only accepts POST requests.' });
});

// ── POST /api/generate — Claude API proxy ─────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  // Support both legacy { prompt } and modern { messages, system, model, max_tokens }
  let messages, system, model, max_tokens;

  if (req.body.prompt && typeof req.body.prompt === 'string') {
    // Legacy format (Activity Builder)
    const prompt = req.body.prompt;
    if (prompt.length > 50000) {
      return res.status(400).json({ error: 'Prompt exceeds maximum length.' });
    }
    messages   = [{ role: 'user', content: prompt }];
    system     = '';
    model      = 'claude-opus-4-5';
    max_tokens = 4096;
  } else {
    // Modern format (Nova, Rhizo, Companion, Sylva)
    ({ messages, system, model, max_tokens } = req.body);
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Request body must contain a messages array or a prompt string.' });
    }
    model      = model      || 'claude-opus-4-5';
    max_tokens = max_tokens || 2048;
    system     = system     || '';
  }

  console.log(`[${new Date().toISOString()}] Claude request — model: ${model}`);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });

    const body = await response.json();

    if (!response.ok) {
      console.error(`Claude API error ${response.status}:`, JSON.stringify(body));
      return res.status(response.status).json({
        error: body?.error?.message || `Claude API returned HTTP ${response.status}`,
      });
    }

    console.log(`[${new Date().toISOString()}] Claude responded (${body?.usage?.output_tokens ?? '?'} tokens)`);
    res.json(body);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
  if (JUNK_SLUG_KEYWORDS.some(k => slug.includes(k)))   return true;
  if (JUNK_TITLE_KEYWORDS.some(k => title.includes(k))) return true;
  return false;
}

// ── GET /api/books — list all TRU Open Press books ────────────────────────────
app.get('/api/books', async (req, res) => {
  const showAll = req.query.all === '1';
  console.log(`[${new Date().toISOString()}] Fetching book list${showAll ? ' (unfiltered)' : ''}`);

  const allBooks = [];
  let page = 1;
  let totalPages = 1;

  try {
    while (page <= totalPages) {
      const url = `${PB_NETWORK}/wp-json/pressbooks/v2/books?per_page=10&page=${page}`;
      const r   = await fetch(url, { headers: { Accept: 'application/json' } });

      if (!r.ok) throw new Error(`Pressbooks returned HTTP ${r.status} on page ${page}`);

      if (page === 1) {
        totalPages = parseInt(r.headers.get('X-WP-TotalPages') || '1', 10);
      }

      const books = await r.json();
      if (!Array.isArray(books) || books.length === 0) break;

      for (const b of books) {
        if (!showAll && isJunkBook(b)) continue;

        const meta      = b.metadata || {};
        const title     = meta.name || b.title || 'Untitled';
        const authorArr = Array.isArray(meta.author) ? meta.author : [];
        const author    = authorArr.map(a => a.name).filter(Boolean).join(', ');
        const license   = meta.license?.code || meta.license?.name || '';
        const aboutArr  = Array.isArray(meta.about) ? meta.about : [];
        const subject   = aboutArr.map(a => a.name).filter(Boolean).join(', ');

        allBooks.push({
          id:          b.id,
          title:       title.trim(),
          link:        (b.link || '').replace(/\/$/, ''),
          author,
          license,
          subject,
          inCatalog:   meta.inCatalog === true,
          wordCount:   meta.wordCount || 0,
          lastUpdated: meta.lastUpdated || '',
        });
      }
      page++;
    }

    allBooks.sort((a, b) => a.title.localeCompare(b.title));
    console.log(`[${new Date().toISOString()}] Returned ${allBooks.length} books`);
    res.json(allBooks);

  } catch (err) {
    console.error('Error fetching books:', err.message);
    res.status(502).json({ error: `Could not fetch book list: ${err.message}` });
  }
});

// ── GET /api/toc — table of contents for a book ───────────────────────────────
app.get('/api/toc', async (req, res) => {
  const { bookUrl } = req.query;
  if (!bookUrl) return res.status(400).json({ error: 'bookUrl query parameter is required.' });

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
    const r = await fetch(tocUrl, { headers: { Accept: 'application/json' } });
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

// ── GET /api/chapter — fetch a single chapter's plain text ────────────────────
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
    const r = await fetch(chapterUrl, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const chapter     = await r.json();
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

// ── HTML → plain text ─────────────────────────────────────────────────────────
function htmlToPlainText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(p|div|h[1-6]|li|blockquote|tr|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#039;/g,  "'")
    .replace(/&nbsp;/g,  ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/\n{3,}/g,  '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '–').trim();
}

// ── GET /api/fetch-url — fetch and extract text from an arbitrary URL ─────────
const FETCH_URL_BLOCKLIST = [
  /^localhost/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./
];
const FETCH_URL_TIMEOUT_MS = 12000;

app.get('/api/fetch-url', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url query parameter is required.' });

  let parsed;
  try { parsed = new URL(url); }
  catch { return res.status(400).json({ error: 'Invalid URL.' }); }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http and https URLs are supported.' });
  }
  if (FETCH_URL_BLOCKLIST.some(re => re.test(parsed.hostname))) {
    return res.status(400).json({ error: 'That host is not allowed.' });
  }

  console.log(`[${new Date().toISOString()}] Fetching URL: ${url}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_URL_TIMEOUT_MS);

    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SylvaBot/1.0; +https://openpress.tru.ca)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timer);

    if (!r.ok) throw new Error(`Remote server returned HTTP ${r.status}`);

    const contentType = r.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      return res.status(415).json({ error: `Unsupported content type: ${contentType.split(';')[0]}` });
    }

    const html  = await r.text();
    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : parsed.hostname;
    // Extract plain text
    const text  = htmlToPlainText(html);

    if (text.length < 20) {
      return res.status(422).json({ error: 'No readable text found at that URL.' });
    }

    console.log(`[${new Date().toISOString()}] Fetched "${title}" — ${text.split(/\s+/).length} words`);
    res.json({ title, text, wordCount: text.split(/\s+/).filter(Boolean).length });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out — the URL took too long to respond.' });
    }
    console.error('Error fetching URL:', err.message);
    res.status(502).json({ error: `Could not fetch URL: ${err.message}` });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ⟡ Open Margins Proxy — running at http://localhost:${PORT}`);
  console.log(`     POST /api/generate           →  Claude API`);
  console.log(`     GET  /api/books              →  TRU Open Press catalogue`);
  console.log(`     GET  /api/toc?bookUrl=...    →  Book table of contents`);
  console.log(`     GET  /api/chapter?...        →  Chapter plain text`);
  console.log(`     GET  /api/fetch-url?url=...  →  Fetch & extract URL text`);
  console.log(`     API key: ${API_KEY.slice(0, 12)}…\n`);
});
