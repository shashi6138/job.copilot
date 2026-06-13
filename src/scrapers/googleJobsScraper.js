'use strict';
// src/scrapers/googleJobsScraper.js
// Strategy 1: SerpAPI (free 100/month) → Strategy 2: Playwright direct

const axios      = require('axios');
const BaseScraper = require('./base');
const logger     = require('../utils/logger');
const { randomDelay } = require('../utils/delays');


const SEARCH_QUERIES = [
  'technical support engineer jobs India remote',
  'support engineer saas jobs India',
  'api integration engineer jobs Bangalore Hyderabad',
  'production support engineer remote India',
  'l2 l3 support engineer jobs India',
  'customer success engineer jobs India remote',
  'application support engineer jobs India',
  'platform support engineer jobs remote India',
];

function stripHtml(h = '') {
  return h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ════════════════════════════════════════════════════════════
// STRATEGY 1 — SerpAPI (free tier: 100 searches/month)
// Get free key at: https://serpapi.com
// ════════════════════════════════════════════════════════════
async function scrapeViaSerpAPI() {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;

  const allJobs = [];
  logger.info('[GoogleJobs/SerpAPI] Starting...');

  for (const query of SEARCH_QUERIES) {
    try {
      const url = `https://serpapi.com/search.json` +
        `?engine=google_jobs&q=${encodeURIComponent(query)}&location=India&hl=en&gl=in&api_key=${key}`;
      const res  = await axios.get(url, { timeout: 12000 });
      const jobs = (res.data.jobs_results || []).map(j => mapSerpJob(j));
      allJobs.push(...jobs);
      logger.info(`[GoogleJobs/SerpAPI] Query "${query}": ${jobs.length} jobs`);
      await randomDelay(1000, 2000);
    } catch (err) {
      logger.warn(`[GoogleJobs/SerpAPI] "${query}": ${err.message}`);
    }
  }

  return allJobs.length > 0 ? allJobs : null;
}

function mapSerpJob(j) {
  return {
    title:       j.title || '',
    company:     j.company_name || '',
    location:    j.location || '',
    applyUrl:    (j.related_links || [])[0]?.link || j.job_id || '',
    postedAt:    j.detected_extensions?.posted_at
      ? parsePostedAt(j.detected_extensions.posted_at) : null,
    source:      'google_jobs',
    salary:      j.detected_extensions?.salary || '',
    description: stripHtml((j.description || '').slice(0, 3000)),
  };
}

// ════════════════════════════════════════════════════════════
// STRATEGY 2 — Direct Playwright scrape of Google Jobs
// Used when SerpAPI quota exhausted
// ════════════════════════════════════════════════════════════
class GoogleJobsPlaywrightScraper extends BaseScraper {
  constructor() {
    super('google_jobs_playwright');
  }

  async scrapeQuery(page, query) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&ibp=htl;jobs&hl=en&gl=in`;
    const jobs = [];

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomDelay(2000, 4000);

      // Check for CAPTCHA
      const bodyText = await page.textContent('body').catch(() => '');
      if (bodyText.includes('unusual traffic') || bodyText.includes('captcha')) {
        logger.warn('[GoogleJobs/Playwright] CAPTCHA detected — stopping');
        return [];
      }

      // Click on job cards to expand them
      const cards = await page.$$('[jscontroller] [data-ved] h2');
      logger.info(`[GoogleJobs/Playwright] "${query}" — found ${cards.length} cards`);

      for (let i = 0; i < Math.min(cards.length, 10); i++) {
        try {
          await cards[i].click();
          await randomDelay(1000, 2000);

          const job = await page.evaluate(() => {
            const title   = document.querySelector('[data-ved] h2, .KLsYvd')?.textContent?.trim() || '';
            const company = document.querySelector('.vNEEBe, [data-company]')?.textContent?.trim() || '';
            const location= document.querySelector('.Qk80Jf, [data-location]')?.textContent?.trim() || '';
            const desc    = document.querySelector('.YgLbBe, .HBvzbc')?.textContent?.slice(0, 2000) || '';
            const links   = [...document.querySelectorAll('a[href]')]
              .map(a => a.href)
              .filter(h => h.includes('job') || h.includes('career') || h.includes('apply'));
            return { title, company, location, desc, links };
          });

          if (job.title && job.company) {
            jobs.push({
              title:       job.title,
              company:     job.company,
              location:    job.location,
              applyUrl:    job.links[0] || url,
              postedAt:    null,
              source:      'google_jobs',
              description: job.desc,
            });
          }
        } catch (e) {
          // skip individual card errors
          logger.debug(`[GoogleJobs/Playwright] Card click error: ${e.message}`);
        }
      }

      // Also extract JSON-LD structured data (most reliable)
      const jsonLdJobs = await page.evaluate(() => {
        const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
        const jobs = [];
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent);
            if (data['@type'] === 'JobPosting') jobs.push(data);
            if (Array.isArray(data)) data.forEach(d => d['@type'] === 'JobPosting' && jobs.push(d));
          } catch (e) {}
        }
        return jobs;
      });

      for (const jl of jsonLdJobs) {
        jobs.push({
          title:    jl.title || '',
          company:  (jl.hiringOrganization || {}).name || '',
          location: (jl.jobLocation || {}).name ||
            ((jl.jobLocation || {}).address || {}).addressLocality || '',
          applyUrl: jl.url || jl.sameAs || '',
          postedAt: jl.datePosted || null,
          source:   'google_jobs',
          salary:   (jl.baseSalary || {}).value?.value || '',
          description: (jl.description || '').slice(0, 3000),
        });
      }
    } catch (err) {
      logger.warn(`[GoogleJobs/Playwright] Error during query "${query}": ${err.message}`);
    }

    return jobs;
  }

  async scrape() {
    const page  = await this.newPage();
    const allJobs = [];

    // Limit to 4 queries per run to avoid Google rate limiting
    const queries = SEARCH_QUERIES.slice(0, 4);

    for (let i = 0; i < queries.length; i++) {
      const jobs = await this.scrapeQuery(page, queries[i]);
      allJobs.push(...jobs);
      if (i < queries.length - 1) {
        await randomDelay(8000, 15000); // Long delay between Google requests
      }
    }

    await page.close();
    return allJobs;
  }

  // Expected by the fallback call `scraper.run()` – returns an object with `jobs`
  async run() {
    const jobs = await this.scrape();
    return { jobs };
  }
}

// ════════════════════════════════════════════════════════════
// MAIN EXPORT — tries SerpAPI first, falls back to Playwright
// ════════════════════════════════════════════════════════════
async function scrapeGoogleJobs() {
  logger.info('[GoogleJobs] Starting...');

  // Try SerpAPI first
  const serpResults = await scrapeViaSerpAPI();
  if (serpResults) {
    logger.info(`[GoogleJobs] SerpAPI returned ${serpResults.length} jobs`);
    return serpResults;
  }

  // Fallback to Playwright
  logger.info('[GoogleJobs] Falling back to Playwright...');
  const scraper = new GoogleJobsPlaywrightScraper();
  const { jobs } = await scraper.run();
  return jobs;
}

// ── Date parser for SerpAPI "3 days ago" format ───────────
function parsePostedAt(str = '') {
  const now = Date.now();
  const match = str.match(/(\d+)\s+(hour|day|week|month)/i);
  if (!match) return new Date().toISOString();
  const [, num, unit] = match;
  const n = parseInt(num);
  const ms = {
    hour:  3_600_000,
    day:   86_400_000,
    week:  604_800_000,
    month: 2_592_000_000,
  }[unit.toLowerCase()] || 0;
  return new Date(now - n * ms).toISOString();
}

module.exports = { scrapeGoogleJobs };