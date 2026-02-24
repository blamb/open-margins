/**
 * TRU OER Activity Builder — Proxy Server
 *
 * Handles two jobs:
 *   1. Forwards AI generation prompts to the Claude API (keeps API key secure)
 *   2. Proxies Pressbooks REST API requests (works around CORS restrictions)
 *
 * SETUP:
 *   1. npm install express cors
 *   2. Set your API key:
 *        export ANTHROPIC_API_KEY=sk-ant-...
 *   3. node server.js
 *
 * Endpoints:
 *   POST /api/generate          → Claude API proxy
 *   GET  /api/books             → List all TRU Open Press books (paginated internally)
 *   GET  /api/toc?bookUrl=...   → Table of contents for a specific book
 *   GET  /api/chapter?url=...   → Full text of a specific chapter
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const PB_NETWORK = 'https://pressbooks.tru.ca';

if (!API_KEY) {
  console.error('\n  ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  console.error('  Run: export ANTHROPIC_API_KEY=sk-ant-your-key-here\n');
  process.exit(1);
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'TRU OER Proxy is running.' });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'TRU OER Proxy is running.' });
});

// ── Claude API proxy ──────────────────────────────────────────────────────────
// Accepts both legacy { prompt } and modern { messages, system, model, max_tokens }
app.post('/api/generate', async (req, res) => {
  let messages, system, model, max_tokens;

  if (req.body.prompt && typeof req.body.prompt === 'string') {
    // Legacy format (Activity Builder)
    const prompt = req.body.prompt;
    if (prompt.length > 50000) {
      return res.status(400).json({ error: 'Prompt exceeds maximum length. Shorten your OER content.' });
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

  let claudeResponse;
  try {
    claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
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
// Excludes obvious sandbox, personal dev, workshop, and test books.
// Tip for TRU staff: marking a book as inCatalog=true in the Pressbooks
// Network Manager will cause it to always appear regardless of this heuristic.
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
  // Always keep books explicitly marked inCatalog by Pressbooks staff
  if (meta.inCatalog === true) return false;
  const link  = (b.link || '').toLowerCase();
  const slug  = link.replace('https://', '').replace('.pressbooks.tru.ca/', '').replace('/', '');
  const title = (meta.name || '').toLowerCase();
  if (JUNK_SLUG_KEYWORDS.some(k => slug.includes(k)))  return true;
  if (JUNK_TITLE_KEYWORDS.some(k => title.includes(k))) return true;
  return false;
}

// ── List all TRU Open Press books ─────────────────────────────────────────────
// Fetches all pages from the Pressbooks network /books endpoint and returns
// the complete list in one response, sorted alphabetically by title.
// Query param: ?all=1  — skip the junk filter and return every book
app.get('/api/books', async (req, res) => {
  const showAll = req.query.all === '1';
  console.log(`[${new Date().toISOString()}] Fetching book list from Pressbooks${showAll ? ' (unfiltered)' : ''}`);

  const allBooks = [];
  let page = 1;
  let totalPages = 1;

  try {
    while (page <= totalPages) {
      const url = `${PB_NETWORK}/wp-json/pressbooks/v2/books?per_page=10&page=${page}`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });

      if (!r.ok) {
        throw new Error(`Pressbooks returned HTTP ${r.status} on page ${page}`);
      }

      // Read total pages from the header (only available on page 1)
      if (page === 1) {
        totalPages = parseInt(r.headers.get('X-WP-TotalPages') || '1', 10);
      }

      const books = await r.json();
      if (!Array.isArray(books) || books.length === 0) break;

      for (const b of books) {
        // Skip obvious junk unless caller requested unfiltered list
        if (!showAll && isJunkBook(b)) continue;

        const meta = b.metadata || {};
        // Title: metadata.name
        const title = meta.name || b.title || 'Untitled';
        // Author: metadata.author is an array of {name} objects
        const authorArr = Array.isArray(meta.author) ? meta.author : [];
        const author = authorArr.map(a => a.name).filter(Boolean).join(', ');
        // License: metadata.license.code
        const license = meta.license?.code || meta.license?.name || '';
        // Subject: metadata.about is an array of {name} objects
        const aboutArr = Array.isArray(meta.about) ? meta.about : [];
        const subject = aboutArr.map(a => a.name).filter(Boolean).join(', ');

        allBooks.push({
          id: b.id,
          title: title.trim(),
          link: (b.link || '').replace(/\/$/, ''),
          author,
          license,
          subject,
          inCatalog: meta.inCatalog === true,
          wordCount: meta.wordCount || 0,
          lastUpdated: meta.lastUpdated || '',
        });
      }

      page++;
    }

    // Sort alphabetically by title
    allBooks.sort((a, b) => a.title.localeCompare(b.title));

    console.log(`[${new Date().toISOString()}] Returned ${allBooks.length} books (of ${allBooks.length + (showAll ? 0 : 0)} fetched)`);
    res.json(allBooks);

  } catch (err) {
    console.error('Error fetching books:', err.message);
    res.status(502).json({ error: `Could not fetch book list: ${err.message}` });
  }
});

// ── Table of contents for a book ──────────────────────────────────────────────
// Query param: bookUrl — the book's base URL, e.g. https://humanbiology.pressbooks.tru.ca
// Returns a simplified TOC: array of parts, each with array of chapters.
app.get('/api/toc', async (req, res) => {
  const { bookUrl } = req.query;

  if (!bookUrl) {
    return res.status(400).json({ error: 'bookUrl query parameter is required.' });
  }

  // Security: only allow requests to pressbooks.tru.ca subdomains
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

    // Simplify the TOC to just what the app needs
    const parts = (toc.parts || [])
      .filter(p => Array.isArray(p.chapters) && p.chapters.length > 0)
      .map(p => ({
        id: p.id,
        title: p.title || 'Untitled Part',
        chapters: p.chapters
          .filter(c => c.status === 'publish' && c.has_post_content)
          .map(c => ({
            id: c.id,
            title: c.title || 'Untitled Chapter',
            slug: c.slug,
            link: c.link,
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

// ── Fetch a single chapter's text ─────────────────────────────────────────────
// Query params:
//   bookUrl   — book base URL
//   chapterId — numeric chapter ID
// Returns: { title, link, wordCount, text } where text is plain text (HTML stripped)
app.get('/api/chapter', async (req, res) => {
  const { bookUrl, chapterId } = req.query;

  if (!bookUrl || !chapterId) {
    return res.status(400).json({ error: 'bookUrl and chapterId query parameters are required.' });
  }

  // Security: only allow pressbooks.tru.ca
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
    const title = chapter?.title?.rendered || 'Untitled Chapter';
    const link = chapter?.link || '';

    // Strip HTML tags to get plain text for Claude
    const plainText = htmlToPlainText(htmlContent);

    res.json({
      id: chapter.id,
      title: stripHtml(title),
      link,
      wordCount: plainText.split(/\s+/).filter(Boolean).length,
      text: plainText,
    });

  } catch (err) {
    console.error('Error fetching chapter:', err.message);
    res.status(502).json({ error: `Could not fetch chapter: ${err.message}` });
  }
});

// ── HTML → plain text helper ──────────────────────────────────────────────────
function htmlToPlainText(html) {
  return html
    // Remove script and style blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Convert block elements to newlines for readability
    .replace(/<\/?(p|div|h[1-6]|li|blockquote|tr|br)[^>]*>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    // Collapse excessive whitespace/newlines
    .replace(/\n{3,}/g, '\n\n')
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
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : parsed.hostname;
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
  console.log(`\n  TRU OER Activity Builder — Proxy Server`);
  console.log(`  Listening at http://localhost:${PORT}`);
  console.log(`  Claude endpoint:      POST http://localhost:${PORT}/api/generate`);
  console.log(`  Books endpoint:       GET  http://localhost:${PORT}/api/books`);
  console.log(`  TOC endpoint:         GET  http://localhost:${PORT}/api/toc?bookUrl=...`);
  console.log(`  Chapter endpoint:     GET  http://localhost:${PORT}/api/chapter?bookUrl=...&chapterId=...`);
  console.log(`  Fetch URL endpoint:   GET  http://localhost:${PORT}/api/fetch-url?url=...`);
  console.log(`  API key: ${API_KEY.slice(0, 12)}…\n`);
});
