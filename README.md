# Open Margins

**Open Margins** is a suite of AI-assisted tools for open educational resource (OER) pedagogy, built for [TRU Open Press](https://openpress.trubox.ca). Each tool pairs a different reading or design practice with Claude AI, running entirely in the browser with a lightweight local proxy server.

---

## Tools

### 📖 Companion
An AI-assisted reading companion for OER texts. Load any chapter from TRU Open Press (or paste your own text), select a passage, and ask Claude to *illuminate*, *interrogate*, or *connect* it to other ideas. Annotations accumulate in the margin as you read. Includes a full **voice reader** (Web Speech API) with sentence-by-sentence highlighting, speed control, and voice selection.

### ⬡ Nova
An experimental concept-map explorer for TRU Open Press books. Load a chapter and Nova generates an interactive concept map showing key ideas and their relationships. Designed for exploratory, non-linear engagement with OER content.

### 🌿 Rhizo
A rhizomatic learning activity builder grounded in [Dave Cormier's](https://davecormier.com) work on rhizomatic education and his book *The Rhizome and the Good Learning Life*. Generates activities around key concepts — Trust Audit, Abundance Check, Breadcrumb Trail — and surfaces rotating quotes from Cormier's writing.

### 🌲 Sylva
A lesson design tool grounded in [TRU's Open Learning Design Framework](https://designframework.trubox.ca) (Caring, Connected, Active, Open). Generates Bloom's-tagged learning objectives, timed lesson arcs with five segment types (Hook, Direct, Active, Community, Synthesis), and constructive alignment assessment suggestions.

### 🔧 Activity Builder
A standalone tool for generating H5P-style interactive activities from OER content. Paste a passage and generate drag-and-drop, matching, or scenario-based activities ready for Moodle.

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
