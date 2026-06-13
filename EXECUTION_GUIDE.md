# Job Copilot Backend — Complete Execution Guide

## What you're building
A Node.js backend that:
- Scrapes 10+ job platforms every 30 mins
- Stores jobs in SQLite (no DB server needed)
- Serves your frontend via REST API
- Sends Telegram alerts for new India/Remote jobs
- Runs free on Railway or Render

---

## PHASE 1 — Local Setup (Day 1, ~1 hour)

### Step 1: Prerequisites
```bash
# Check Node.js version (need 18+)
node --version

# If below 18, install from: https://nodejs.org
# Or use nvm:
nvm install 18
nvm use 18
```

### Step 2: Set up project
```bash
# Create project folder
mkdir job-copilot-backend
cd job-copilot-backend

# Copy all the files from this package into this folder
# Then install dependencies:
npm install

# Install Playwright browser (Chromium)
npx playwright install chromium
```

### Step 3: Configure environment
```bash
# Copy example env file
cp .env.example .env

# Open .env and fill in your values:
nano .env   # or use VS Code
```

**Minimum required `.env` values to get started:**
```
PORT=3001
DB_PATH=./data/jobs.db
NODE_ENV=development
PLAYWRIGHT_HEADLESS=true
FRONTEND_URL=http://localhost:3000
ADMIN_API_KEY=any-random-secret-string
```

**Optional (add later for more jobs):**
```
ADZUNA_APP_ID=    # from developer.adzuna.com
ADZUNA_APP_KEY=   # same
SERPAPI_KEY=      # from serpapi.com (100 free/month)
TELEGRAM_BOT_TOKEN=   # from @BotFather on Telegram
TELEGRAM_CHAT_ID=     # your Telegram chat ID
```

### Step 4: Initialize database
```bash
node src/db/schema.js
# Output: ✓ Database schema initialized at ./data/jobs.db
```

### Step 5: Test a single scraper
```bash
# Test Greenhouse scraper alone (fast, no browser)
node -e "
require('dotenv').config();
const { scrapeGreenhouse } = require('./src/scrapers/apiScrapers');
scrapeGreenhouse().then(j => console.log('Jobs found:', j.length));
"
```

### Step 6: Run full scrape manually
```bash
node src/services/scrapeOrchestrator.js
# Watch the logs — should show jobs being discovered
# Check: ls data/  → jobs.db should be growing
```

### Step 7: Start the server
```bash
npm run dev    # development mode with auto-restart
# OR
npm start      # production mode

# Server starts on http://localhost:3001
```

### Step 8: Test the API
```bash
# Health check
curl http://localhost:3001/health

# All jobs
curl "http://localhost:3001/api/jobs"

# India jobs only
curl "http://localhost:3001/api/jobs?geo=india"

# Remote jobs, last 24h
curl "http://localhost:3001/api/jobs?geo=remote&time=24h"

# Search
curl "http://localhost:3001/api/jobs?q=datadog&geo=india"

# Stats
curl "http://localhost:3001/api/jobs/stats/summary"
```

You should see JSON with job listings. If you do, the backend is working.

---

## PHASE 2 — Connect Frontend (Day 1-2)

### Step 9: Update your index.html
Open your existing `index.html` and:

1. Add this at the bottom of your `<script>` section (before closing `</script>`):
```html
<script src="frontend-integration.js"></script>
```

2. Set the backend URL in `frontend-integration.js`:
```javascript
const BACKEND_URL = 'http://localhost:3001';  // for local dev
// Change to Railway URL after deployment
```

3. Replace your existing `fetchAll()` function call — the new one is already in `frontend-integration.js`

4. Test locally:
   - Open `index.html` in browser (from VS Code Live Server or similar)
   - Click ⟳ Fetch Jobs
   - Jobs should load from your backend

---

## PHASE 3 — Deploy to Railway (Day 2, ~30 min)

Railway gives you: free hosting + persistent disk + auto-deploys from GitHub

### Step 10: Push to GitHub
```bash
# Initialize git
git init
git add .
git commit -m "Initial job copilot backend"

# Create new repo on github.com → copy the remote URL
git remote add origin https://github.com/YOUR-USERNAME/job-copilot-backend.git
git push -u origin main
```

### Step 11: Deploy on Railway
1. Go to **railway.app** → Sign up with GitHub (free)
2. Click **New Project → Deploy from GitHub repo**
3. Select your `job-copilot-backend` repo
4. Railway auto-detects Node.js and deploys

### Step 12: Add environment variables on Railway
In Railway dashboard → your service → **Variables** tab:

```
NODE_ENV=production
PORT=3001
DB_PATH=./data/jobs.db
PLAYWRIGHT_HEADLESS=true
FRONTEND_URL=https://YOUR-USERNAME.github.io
ADMIN_API_KEY=your-secret-key-here
ADZUNA_APP_ID=your-id
ADZUNA_APP_KEY=your-key
SERPAPI_KEY=your-key
TELEGRAM_BOT_TOKEN=your-token
TELEGRAM_CHAT_ID=your-chat-id
```

### Step 13: Install Playwright on Railway
Railway needs Playwright's Chromium browser. Add this to your `package.json` scripts:
```json
"postinstall": "npx playwright install chromium --with-deps"
```

Then push again:
```bash
git add package.json
git commit -m "Add playwright postinstall"
git push
```

### Step 14: Get your Railway URL
Railway gives you a URL like: `https://job-copilot-backend-production.up.railway.app`

Test it:
```bash
curl https://your-railway-url.railway.app/health
curl https://your-railway-url.railway.app/api/jobs?geo=india&limit=5
```

### Step 15: Update frontend to use Railway URL
In `frontend-integration.js`:
```javascript
const BACKEND_URL = 'https://your-railway-url.railway.app';
```

Commit and push the updated `index.html` to your GitHub Pages repo.

---

## PHASE 4 — Telegram Alerts Setup (Day 2, ~20 min)

### Step 16: Create Telegram Bot
1. Open Telegram → search `@BotFather`
2. Send: `/newbot`
3. Choose a name: `Shashi Job Alerts`
4. Choose a username: `shashi_jobs_bot`
5. BotFather gives you a **token** — copy it

### Step 17: Get your Chat ID
1. Start a chat with your new bot (search by username)
2. Send it any message (e.g. "hello")
3. Open this URL in browser (replace TOKEN):
   `https://api.telegram.org/botYOUR_TOKEN/getUpdates`
4. Look for `"chat":{"id":XXXXXXXXX}` — that number is your Chat ID

### Step 18: Add to Railway env variables
```
TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
TELEGRAM_CHAT_ID=987654321
TELEGRAM_GEO_FILTER=india,remote
TELEGRAM_MIN_SCORE=60
```

Railway will restart your service. Next time new jobs are found, you'll get Telegram alerts!

---

## PHASE 5 — Adzuna + SerpAPI Setup (Day 3)

### Step 19: Get Adzuna API key (free)
1. Go to **developer.adzuna.com**
2. Register → get App ID and App Key
3. Add to Railway env: `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`

This adds Naukri + Indeed + Shine + Monster jobs automatically.

### Step 20: Get SerpAPI key (free — 100 searches/month)
1. Go to **serpapi.com** → Sign up free
2. Copy your API key
3. Add to Railway env: `SERPAPI_KEY`

This adds Google Jobs results (which includes LinkedIn job listings).

---

## PHASE 6 — Verify Everything Works

### Step 21: Check scraper logs on Railway
Railway dashboard → your service → **Logs** tab

You should see every 30 minutes:
```
[Scheduler] Triggered scrape run
[Greenhouse] Starting API scrape...
[Greenhouse] Done — 12 relevant jobs
[Lever] Done — 8 relevant jobs
[Adzuna] Done — 31 unique jobs
[Orchestrator] New: 14 | Skipped: 37
```

### Step 22: Verify database is growing
```bash
# Trigger manual scrape
curl -X POST https://your-railway-url.railway.app/api/jobs/scrape \
  -H "x-api-key: your-admin-key" \
  -H "Content-Type: application/json"

# Check counts
curl https://your-railway-url.railway.app/api/jobs/stats/summary
```

### Step 23: Check your dashboard
Open your GitHub Pages URL → click ⟳ Fetch Jobs
- Jobs should load from the backend
- Filter by 🇮🇳 India or 🌐 Remote
- Telegram should have received alerts

---

## Quick Reference — Useful Commands

```bash
# Run scraper manually (local)
node src/services/scrapeOrchestrator.js

# Start server (local)
npm run dev

# Check jobs in DB (local)
node -e "
const db = require('better-sqlite3')('./data/jobs.db');
console.log('Total jobs:', db.prepare('SELECT COUNT(*) as n FROM jobs').get().n);
console.log('India jobs:', db.prepare(\"SELECT COUNT(*) as n FROM jobs WHERE geo='india'\").get().n);
console.log('Remote jobs:', db.prepare(\"SELECT COUNT(*) as n FROM jobs WHERE geo='remote'\").get().n);
"

# Test Telegram alert
node -e "
require('dotenv').config();
const t = require('./src/alerts/telegram');
t.send('Test alert from Job Copilot!').then(() => console.log('Sent!'));
"

# Check last scraper run
node -e "
const db = require('better-sqlite3')('./data/jobs.db');
console.log(db.prepare('SELECT * FROM scraper_runs ORDER BY id DESC LIMIT 3').all());
"
```

---

## Troubleshooting

**"Cannot find module 'better-sqlite3'"**
→ Run `npm install` again. If on Railway, check build logs.

**0 jobs after scraping**
→ Check internet connection. Run individual scraper test (Step 5).

**Playwright crashes on Railway**
→ Add `"postinstall": "npx playwright install chromium --with-deps"` to package.json

**CORS error in browser**
→ Set `FRONTEND_URL` in env to your exact GitHub Pages URL.

**Telegram not sending**
→ Run the test command in Step 21. Check BOT_TOKEN and CHAT_ID.

**Naukri scraper blocked**
→ Normal. Naukri detects bots. Rely on Adzuna for Naukri jobs instead.

---

## Cost Summary

| Service         | Cost     |
|----------------|----------|
| Railway hosting | $0/month |
| SerpAPI         | $0/month (100 free) |
| Adzuna API      | $0/month (1000 free/day) |
| Telegram Bot    | $0/month |
| GitHub Pages    | $0/month |
| **Total**       | **$0/month** |
