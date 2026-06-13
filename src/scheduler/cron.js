'use strict';
// src/scheduler/cron.js

const cron   = require('node-cron');
const logger = require('../utils/logger');
const { runAllScrapers } = require('../services/scrapeOrchestrator');

let isRunning = false;

/**
 * Start the scheduled scraping job
 */
function startScheduler() {
  const interval = process.env.SCRAPER_INTERVAL || '*/30 * * * *'; // every 30 min

  logger.info(`[Scheduler] Starting — interval: "${interval}"`);

  cron.schedule(interval, async () => {
    if (isRunning) {
      logger.warn('[Scheduler] Previous run still in progress — skipping');
      return;
    }

    isRunning = true;
    logger.info('[Scheduler] Triggered scrape run');

    try {
      // Fast run every 30 min (API scrapers only)
      // Slow run (Playwright) only every 2 hours
      const now = new Date();
      const includeSlow = now.getMinutes() < 5; // only on :00 runs

      await runAllScrapers({ includeSlow, includeNaukri: false });
    } catch (err) {
      logger.error(`[Scheduler] Run failed: ${err.message}`);
    } finally {
      isRunning = false;
    }
  }, { timezone: 'Asia/Kolkata' });

  // Run immediately on startup (API scrapers only)
  logger.info('[Scheduler] Running initial scrape on startup...');
  setTimeout(async () => {
    isRunning = true;
    try {
      await runAllScrapers({ includeSlow: false });
    } finally {
      isRunning = false;
    }
  }, 3000);
}

module.exports = { startScheduler };
