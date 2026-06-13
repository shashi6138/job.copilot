'use strict';
// src/services/scrapeOrchestrator.js
// Runs all scrapers in sequence, normalizes + deduplicates + ranks results

require('dotenv').config();
const logger        = require('../utils/logger');
const { normalize } = require('./jobNormalizer');
const { rankJob }   = require('./jobNormalizer');
const { bulkInsert, purgeStaleJobs } = require('./deduplicator');
const telegramAlert  = require('../alerts/telegram');

// API scrapers (fast, no browser)
const {
  scrapeGreenhouse,
  scrapeLever,
  scrapeAshby,
  scrapeAdzuna,
  scrapeRemotive,
} = require('../scrapers/apiScrapers');

// Google Jobs
const { scrapeGoogleJobs } = require('../scrapers/googleJobsScraper');

// Playwright scrapers (slower, browser-based)
const {
  HiristScraper,
  ShineScraper,
  FounditScraper,
  WellfoundScraper,
  NaukriScraper,
  InstahyreScraper,
} = require('../scrapers/playwrightScrapers');

// Load ranker separately to avoid circular deps
const { rankJob: rank } = (() => {
  try { return require('./jobNormalizer'); }
  catch { return { rankJob: () => 50 }; }
})();

/**
 * Run all scrapers and store results
 * @param {Object} options
 * @param {boolean} options.includeSlow - include Playwright scrapers (slower)
 * @param {boolean} options.includeNaukri - include Naukri (very slow, risky)
 */
async function runAllScrapers({ includeSlow = true, includeNaukri = false } = {}) {
  const startTime = Date.now();
  logger.info('═══════════════════════════════════════');
  logger.info('  Scrape run started');
  logger.info('═══════════════════════════════════════');

  const allRaw = [];
  const results = {};

  // ── Phase 1: Fast API scrapers (parallel) ──────────────
  logger.info('[Orchestrator] Phase 1: API scrapers...');
  try {
    const [gh, lv, ash, az, rm] = await Promise.allSettled([
      scrapeGreenhouse(),
      scrapeLever(),
      scrapeAshby(),
      scrapeAdzuna(),
      scrapeRemotive(),
    ]);

    results.greenhouse = gh.status === 'fulfilled' ? gh.value : [];
    results.lever      = lv.status === 'fulfilled' ? lv.value : [];
    results.ashby      = ash.status === 'fulfilled' ? ash.value : [];
    results.adzuna     = az.status === 'fulfilled' ? az.value : [];
    results.remotive   = rm.status === 'fulfilled' ? rm.value : [];

    allRaw.push(
      ...results.greenhouse,
      ...results.lever,
      ...results.ashby,
      ...results.adzuna,
      ...results.remotive,
    );

    logger.info(`[Orchestrator] Phase 1 done — ${allRaw.length} raw jobs`);
  } catch (err) {
    logger.error(`[Orchestrator] Phase 1 error: ${err.message}`);
  }

  // ── Phase 2: Google Jobs ───────────────────────────────
  logger.info('[Orchestrator] Phase 2: Google Jobs...');
  try {
    const googleJobs = await scrapeGoogleJobs();
    results.google_jobs = googleJobs;
    allRaw.push(...googleJobs);
    logger.info(`[Orchestrator] Google Jobs: ${googleJobs.length} jobs`);
  } catch (err) {
    logger.error(`[Orchestrator] Google Jobs error: ${err.message}`);
    results.google_jobs = [];
  }

  // ── Phase 3: Playwright scrapers (optional, slower) ────
  if (includeSlow) {
    logger.info('[Orchestrator] Phase 3: Playwright scrapers...');

    const playwrightScrapers = [
      new HiristScraper(),
      new ShineScraper(),
      new FounditScraper(),
      new WellfoundScraper(),
      new InstahyreScraper(),
    ];

    if (includeNaukri) {
      playwrightScrapers.push(new NaukriScraper());
    }

    // Run Playwright scrapers one at a time (no parallel — avoid detection)
    for (const scraper of playwrightScrapers) {
      try {
        const { jobs } = await scraper.run();
        results[scraper.name] = jobs;
        allRaw.push(...jobs);
        logger.info(`[Orchestrator] ${scraper.name}: ${jobs.length} jobs`);
      } catch (err) {
        logger.error(`[Orchestrator] ${scraper.name} failed: ${err.message}`);
        results[scraper.name] = [];
      }
    }
  }

  // ── Phase 4: Normalize + deduplicate + rank ─────────────
  logger.info(`[Orchestrator] Phase 4: Processing ${allRaw.length} raw jobs...`);

  const normalized = allRaw
    .map(raw => {
      const job = normalize(raw);
      if (!job) return null;

      // Add ranker that's defined inline to avoid import issues
      const score = computeScore(job);
      return { ...job, rank_score: score };
    })
    .filter(Boolean);

  const { inserted, skipped } = bulkInsert(normalized);

  // ── Phase 5: Purge stale jobs ──────────────────────────
  purgeStaleJobs();

  // ── Phase 6: Send Telegram alerts for new jobs ─────────
  if (inserted > 0) {
    await sendNewJobAlerts(normalized, inserted);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = {
    duration: `${duration}s`,
    totalRaw:    allRaw.length,
    normalized:  normalized.length,
    inserted,
    skipped,
    sources:     Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, v.length])
    ),
  };

  logger.info('═══════════════════════════════════════');
  logger.info(`  Scrape complete in ${duration}s`);
  logger.info(`  Raw: ${allRaw.length} | New: ${inserted} | Skipped: ${skipped}`);
  logger.info('═══════════════════════════════════════');

  return summary;
}

// ── Inline ranker (avoids circular import) ────────────────
const ROLE_KW = ['technical support','support engineer','integration engineer',
  'api support','production support','application support','l2','l3',
  'customer success','solutions engineer','cloud support','platform support'];
const SAAS_CO = ['datadog','stripe','postman','freshworks','zendesk','intercom',
  'pagerduty','elastic','mongodb','cloudflare','gitlab','figma','hubspot'];

function computeScore(job) {
  let s = 0;
  const t = (job.title || '').toLowerCase();
  const c = (job.company || '').toLowerCase();
  if (job.geo === 'india')  s += 30;
  if (job.geo === 'remote') s += 25;
  if (job.geo === 'hybrid') s += 15;
  s += Math.min(ROLE_KW.filter(k => t.includes(k)).length * 8, 25);
  if (job.posted_at) {
    const age = Date.now() - new Date(job.posted_at).getTime();
    if (age < 3_600_000)   s += 20;
    else if (age < 86_400_000)  s += 15;
    else if (age < 259_200_000) s += 8;
  }
  if (SAAS_CO.some(co => c.includes(co))) s += 15;
  if (job.salary && job.salary.trim())    s += 5;
  return Math.max(0, Math.min(100, s));
}

// ── Alert new high-score jobs via Telegram ────────────────
async function sendNewJobAlerts(jobs, insertedCount) {
  try {
    // Only alert for India/Remote jobs with score >= threshold
    const minScore = parseInt(process.env.TELEGRAM_MIN_SCORE) || 60;
    const geoFilter = (process.env.TELEGRAM_GEO_FILTER || 'india,remote').split(',');

    const alertJobs = jobs
      .filter(j => j.rank_score >= minScore && geoFilter.includes(j.geo))
      .sort((a, b) => b.rank_score - a.rank_score)
      .slice(0, 5); // max 5 alerts per run

    if (alertJobs.length === 0) return;

    // Summary message first
    await telegramAlert.send(
      `🎯 *Job Copilot — ${insertedCount} new jobs found!*\n` +
      `Top ${alertJobs.length} picks for you 👇`
    );

    for (const job of alertJobs) {
      await telegramAlert.sendJob(job);
    }
  } catch (err) {
    logger.warn(`[Orchestrator] Telegram alert failed: ${err.message}`);
  }
}

// Allow running directly: node src/services/scrapeOrchestrator.js
if (require.main === module) {
  runAllScrapers({ includeSlow: true, includeNaukri: false })
    .then(summary => {
      console.log('\nSummary:', JSON.stringify(summary, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}

module.exports = { runAllScrapers };
