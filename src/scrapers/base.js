'use strict';
// src/scrapers/base.js

const { chromium } = require('playwright');
const { randomDelay } = require('../utils/delays');
const { randomUserAgent } = require('../utils/delays');
const logger = require('../utils/logger');
const db = require('../db/db');

class BaseScraper {
  constructor(name) {
    this.name    = name;
    this.browser = null;
    this.context = null;
    this.runId   = null;
  }

  // ── Playwright browser setup ──────────────────────────────
  async launchBrowser() {
    this.browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: randomUserAgent(),
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    // Block images, fonts, media to speed up scraping
    await this.context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Remove webdriver fingerprint
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });

    return this.context;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser  = null;
      this.context  = null;
    }
  }

  async newPage() {
    if (!this.context) await this.launchBrowser();
    const page = await this.context.newPage();
    return page;
  }

  // ── Run logging ───────────────────────────────────────────
  startRun() {
    const result = db.prepare(`
      INSERT INTO scraper_runs (source, status) VALUES (?, 'running')
    `).run(this.name);
    this.runId = result.lastInsertRowid;
    logger.info(`[${this.name}] Scraper run started (id: ${this.runId})`);
  }

  endRun(jobsFound, jobsNew, status = 'success', errorMsg = null) {
    db.prepare(`
      UPDATE scraper_runs
      SET ended_at = datetime('now'), jobs_found = ?, jobs_new = ?,
          status = ?, error_msg = ?
      WHERE id = ?
    `).run(jobsFound, jobsNew, status, errorMsg, this.runId);
    logger.info(`[${this.name}] Run ended — found: ${jobsFound}, new: ${jobsNew}`);
  }

  // ── Retry wrapper ─────────────────────────────────────────
  async withRetry(fn, maxRetries = 3, label = '') {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        logger.warn(`[${this.name}] ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        if (attempt === maxRetries) throw err;
        await randomDelay(3000 * attempt, 6000 * attempt);
      }
    }
  }

  // ── Human-like delay ──────────────────────────────────────
  async delay(min, max) {
    return randomDelay(min, max);
  }

  // ── Abstract method — subclasses implement this ───────────
  async scrape() {
    throw new Error(`${this.name}.scrape() not implemented`);
  }

  // ── Main entry point ──────────────────────────────────────
  async run() {
    this.startRun();
    let jobs = [], errorMsg = null;

    try {
      jobs = await this.scrape();
      logger.info(`[${this.name}] Fetched ${jobs.length} raw jobs`);
    } catch (err) {
      errorMsg = err.message;
      logger.error(`[${this.name}] Scraper failed: ${err.message}`);
    } finally {
      await this.closeBrowser();
    }

    return { jobs, error: errorMsg, runId: this.runId };
  }
}

module.exports = BaseScraper;
