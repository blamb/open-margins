# Rhizo — Learning in Abundance

A pedagogical activity generator inspired by Dave Cormier's rhizomatic learning philosophy.
Built on top of the TRU Open Press Pressbooks library and the Claude AI API.

---

## What you need before starting

1. **Node.js** (version 18 or higher)
   Download from: https://nodejs.org — click the "LTS" button and install it.

2. **An Anthropic API key**
   Sign up at: https://console.anthropic.com
   Go to "API Keys" and create a new key. It starts with `sk-ant-...`
   Note: API usage costs a small amount per request (~$0.01–0.05 per activity generated).

---

## Setup (one time only)

1. Unzip this folder somewhere on your computer (e.g. your Desktop).

2. Open **Terminal** (Mac) or **Command Prompt** (Windows).

3. Navigate to the rhizo folder. For example, if you put it on your Desktop:
   ```
   cd ~/Desktop/rhizo
   ```

4. Install dependencies:
   ```
   npm install
   ```
   This downloads the two small libraries the server needs. Takes about 30 seconds.

---

## Running Rhizo

Every time you want to use Rhizo, do this:

1. Open **Terminal** and navigate to the rhizo folder:
   ```
   cd ~/Desktop/rhizo
   ```

2. Start the server with your API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here node server.js
   ```
   Replace `sk-ant-your-key-here` with your actual key.

   **Windows users**, use this format instead:
   ```
   set ANTHROPIC_API_KEY=sk-ant-your-key-here && node server.js
   ```

3. You will see:
   ```
     Rhizo — Learning in Abundance
     Open in your browser → http://localhost:3001
   ```
   The terminal will appear "frozen" — that is normal. It means the server is running.
   **Leave the Terminal window open** while you use Rhizo.

4. Open your browser and go to:
   **http://localhost:3001**

5. The app will connect automatically and load the list of TRU Open Press books.

---

## Using Rhizo

1. **Select a book** from the list on the left (you can search by title or subject).
2. **Select a part and chapter** from the dropdowns that appear.
3. Click **Load Chapter**.
4. **Choose an activity** from the five tiles on the right.
5. Click **Grow** to generate the activity.

### The five activities

- 🌿 **Weed the Garden** — Surfaces what the text silenced, assumed, or couldn't know.
- 🌫 **Uncertainty Map** — Extracts the genuinely unanswerable questions from the text.
- 🗣 **Wicked Council** — Five voices debate a wicked problem drawn from the text.
- 🧭 **Nomad's Entry Points** — Five different doors into the same content.
- 📜 **Community Contract** — Students articulate their personal learning commitment.

---

## Stopping Rhizo

Press **Ctrl+C** in the Terminal window. You can close Terminal after that.

---

## Troubleshooting

**"ANTHROPIC_API_KEY is not set" error**
You forgot to include the API key in the start command. Make sure the whole command is on one line with your real key.

**Page shows "Can't reach proxy"**
The server isn't running. Go back to Terminal and start it again with the command above.

**Books don't load**
The first load fetches all books from TRU Open Press and takes about 3 seconds. If it takes longer than 30 seconds, check your internet connection.

**"npm: command not found"**
Node.js isn't installed. Go to https://nodejs.org and install it first.
