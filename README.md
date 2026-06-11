# Open Margins

**Open Margins** is a suite of AI-assisted tools for open educational resource (OER) pedagogy, developed at [TRU Open Press](https://openpress.trubox.ca). Each tool pairs a different reading or design practice with Claude AI, running entirely in the browser with a lightweight local proxy server.

**Works with any OER content.** The TRU Open Press catalogue is the featured collection and loads directly from the built-in book browser, but every tool also accepts a **URL** (any open web page), a **PDF or .docx upload**, or **pasted text** — so you can bring any openly licensed material you're already working with.

---

## Tools

### 📖 Companion
An AI-assisted reading companion for OER texts. Browse the TRU Open Press catalogue, fetch any open URL, upload a PDF or .docx, or paste text directly — then select a passage and ask Claude to *illuminate*, *interrogate*, or *connect* it to other ideas. Annotations accumulate in the margin as you read. Includes a full **voice reader** (Web Speech API) with sentence-by-sentence highlighting, speed control, and voice selection.

### ⬡ Nova
An experimental concept-map explorer for OER texts. Browse the TRU Open Press catalogue, fetch a URL, upload a file, or paste text — and Nova generates an interactive concept map showing key ideas and their relationships. Designed for exploratory, non-linear engagement with any open content.

### 🌿 Rhizo
A rhizomatic learning activity builder grounded in [Dave Cormier's](https://davecormier.com) work on rhizomatic education and his book *The Rhizome and the Good Learning Life*. Generates activities around key concepts — Trust Audit, Abundance Check, Breadcrumb Trail — and surfaces rotating quotes from Cormier's writing.

### 🌲 Sylva
A lesson design tool grounded in [TRU's Open Learning Design Framework](https://designframework.trubox.ca) (Caring, Connected, Active, Open). Load any OER content via the TRU catalogue, a URL, file upload, or paste — then generate Bloom's-tagged learning objectives, timed lesson arcs with five segment types (Hook, Direct, Active, Community, Synthesis), and constructive alignment assessment suggestions.

### 🔧 Activity Builder
A standalone tool for generating H5P-style interactive activities from OER content. Paste a passage, upload a file, or pull from any open URL — and generate drag-and-drop, matching, or scenario-based activities ready for Moodle.

---

## Requirements

- A modern web browser (Chrome recommended for voice reader)
- [Node.js](https://nodejs.org) (v18 or higher)
- An [Anthropic API key](https://console.anthropic.com)

---

## Setup

**1. Clone the repository**
```bash
git clone https://github.com/blamb/open-margins.git
cd open-margins
```

**2. Install dependencies**
```bash
npm install
```

**3. Set your API key**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**4. Start the server**
```bash
node server.js
```

Then open `http://localhost:3000` in your browser.

Each tool also has its own server if you want to run them independently:

| Tool | Directory | Default port |
|------|-----------|--------------|
| Companion | `companion/` | 3001 |
| Nova | `nova/` | 3002 |
| Rhizo | `rhizo/` | 3003 |
| Sylva | `sylva/` | 3004 |

To run a tool individually:
```bash
cd companion
node server.js
```

---

## Configuration

All settings are environment variables. Only `ANTHROPIC_API_KEY` is required.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | — | Your Anthropic API key (required) |
| `CLAUDE_MODEL` | `claude-haiku-4-5` | Claude model used for all generation. Haiku is fast and roughly 5× cheaper than Opus; set this to a more capable model only if a task needs it. |
| `MAX_TOKENS_LIMIT` | `8192` | Upper bound on `max_tokens` per request |
| `ALLOWED_ORIGINS` | *(none)* | Comma-separated origins allowed to call the API cross-origin, e.g. `https://tools.example.ca`. A leading wildcard like `https://*.pressbooks.tru.ca` allows every subdomain as well as the bare domain — useful for Pressbooks networks, where each book lives on its own subdomain. Localhost is always allowed, and pages served by the proxy itself are unaffected. |
| `GENERATE_RATE_LIMIT` | `12` | AI generation requests allowed per IP per minute |
| `API_RATE_LIMIT` | `60` | Other API requests allowed per IP per minute |
| `PROXY_ACCESS_TOKEN` | *(none)* | If set, `/api/generate` on the root server requires a matching `x-proxy-token` request header. Leave unset for normal use — the bundled tools don't send this header, so enabling it is only useful if you've customized the front-ends or call the proxy from your own code. |

The model is decided by the server. Any `model` field sent by a browser is
ignored, so a deployed proxy can't be used to run requests on a more
expensive model than the one you configured.

### A note on public deployments

The proxy spends money from your Anthropic account on every generation
request. If you deploy it somewhere public (Railway, a campus server), at
minimum set `ALLOWED_ORIGINS` to your real domain and keep the default rate
limits. For anything beyond a small pilot, consider putting the deployment
behind your institution's single sign-on or a reverse proxy with
authentication.

---

## Project Structure

```
open-margins/
├── index.html                  # Project home page
├── about.html                  # About Open Margins
├── why.html                    # Why open pedagogy?
├── server.js                   # Root proxy server
├── tru-oer-activity-builder.html
├── companion/
│   ├── companion.html
│   └── server.js
├── nova/
│   ├── nova.html
│   ├── nova-guide.html
│   └── server.js
├── rhizo/
│   ├── rhizo.html
│   ├── rhizo-guide.html
│   └── server.js
├── sylva/
│   ├── sylva.html
│   ├── sylva-guide.html
│   └── server.js
└── expose/
    └── index.html
```

---

## Design Principles

Open Margins is built on the [TRU Open Learning Design Framework](https://designframework.trubox.ca):

- **Caring** — tools include accessibility prompts, wellbeing reminders, and low-stakes entry points
- **Connected** — community and belonging are first-class activity types
- **Active** — every tool centres doing over passive consumption
- **Open** — built on OER, openly licensed, transparent by design

---

## Credits

Developed at [TRU Open Press](https://openpress.trubox.ca), Thompson Rivers University.

Rhizo is informed by the work of [Dave Cormier](https://davecormier.com) and draws from *The Rhizome and the Good Learning Life*.

Sylva is grounded in the [TRU Open Learning Design Framework](https://designframework.trubox.ca).

AI responses are generated via the [Anthropic Claude API](https://anthropic.com).

---

## Licence

[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)

You are free to share and adapt this work for any purpose, provided appropriate credit is given.
