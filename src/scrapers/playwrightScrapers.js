'use strict';
// src/scrapers/playwrightScrapers.js
// Playwright-based scrapers for India job boards - OPTIMIZED FAST VERSION

const BaseScraper    = require('./base');
const logger         = require('../utils/logger');
const { randomDelay } = require('../utils/delays');
const fs = require('fs').promises;
const path = require('path');

async function saveSnapshot(page, name) {
  try {
    const dir = path.join(process.cwd(), 'debug_snapshots');
    await fs.mkdir(dir, { recursive: true });
    const timestamp = Date.now();
    const htmlPath = path.join(dir, `${name}_${timestamp}.html`);
    const html = await page.content();
    await fs.writeFile(htmlPath, html);
    logger.info(`[Debug] Snapshot saved: ${htmlPath}`);
  } catch (e) {}
}

const KEYWORDS = [
  'technical support','support engineer','integration engineer',
  'api support','production support','application support',
  'platform support','developer support','l2 support','l3 support',
  'customer support engineer','cloud support','saas support',
  'helpdesk','it support','customer success','solutions engineer'
];
function relevant(t = '') {
  return KEYWORDS.some(k => t.toLowerCase().includes(k));
}

// ════════════════════════════════════════════════════════════
// HIRIST.TECH — fixed: use domcontentloaded + shorter timeout
// ════════════════════════════════════════════════════════════
class HiristScraper extends BaseScraper {
  constructor() { super('hirist'); }

  async scrape() {
    const page = await this.newPage();
    const jobs = [];

    const searchTerms = [
      'technical-support-engineer',
      'support-engineer',
      'integration-engineer',
      'api-support',
      'production-support',
    ];

    for (const term of searchTerms) {
      try {
        const url = `https://www.hirist.tech/k/${term}-jobs-1`;
        logger.info(`[hirist] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await randomDelay(1500, 2500);

        // Wait for any job listing
        const jobSelector = '.job-list li, .jobCard, [class*="job-card"], .job-listing';
        try {
          await page.waitForSelector(jobSelector, { timeout: 10000 });
        } catch (e) {
          logger.warn(`[hirist] No jobs for ${term}, saving snapshot`);
          await saveSnapshot(page, `hirist_${term}_nojobs`);
          continue;
        }

        // Quick scroll to load lazy content
        await page.evaluate(() => window.scrollBy(0, 500));
        await randomDelay(500, 1000);

        const pageJobs = await page.evaluate(() => {
          const cards = document.querySelectorAll('.job-list li, .jobCard, [class*="job-card"]');
          const results = [];
          cards.forEach(card => {
            const titleEl = card.querySelector('h2 a, .job-title a, h3 a');
            const title = titleEl ? titleEl.textContent.trim() : '';
            const companyEl = card.querySelector('.company-name, .org-name');
            const company = companyEl ? companyEl.textContent.trim() : '';
            const locationEl = card.querySelector('.location');
            const location = locationEl ? locationEl.textContent.trim() : 'India';
            let link = '';
            if (titleEl && titleEl.href) link = titleEl.href;
            else {
              const linkEl = card.querySelector('a[href*="/j/"]');
              if (linkEl) link = linkEl.href;
            }
            if (title && link) results.push({ title, company, location, link });
          });
          return results;
        });

        for (const j of pageJobs) {
          if (relevant(j.title)) {
            jobs.push({
              title: j.title, company: j.company, location: j.location || 'India',
              applyUrl: j.link, postedAt: null, source: 'hirist', description: '',
            });
          }
        }

        logger.info(`[hirist] "${term}": ${pageJobs.length} total, ${pageJobs.filter(j => relevant(j.title)).length} relevant`);
        await randomDelay(2000, 4000);
      } catch (err) {
        logger.warn(`[hirist] "${term}": ${err.message}`);
        await saveSnapshot(page, `hirist_${term}_error`);
      }
    }
    await page.close();
    return jobs;
  }
}

// ════════════════════════════════════════════════════════════
// SHINE.COM — updated selectors, handle redirects
// ════════════════════════════════════════════════════════════
class ShineScraper extends BaseScraper {
  constructor() { super('shine'); }

  async scrape() {
    const page = await this.newPage();
    const jobs = [];

    const searches = [
      'technical-support-engineer',
      'support-engineer',
      'integration-engineer',
      'application-support-engineer'
    ];

    for (const term of searches) {
      try {
        const url = `https://www.shine.com/job-search/${term}-jobs-in-india`;
        logger.info(`[shine] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await randomDelay(2000, 3000);

        // Try to close any overlay
        const closeBtn = await page.$('button.close, .modal-close, .popup-close');
        if (closeBtn) await closeBtn.click().catch(() => {});

        // Wait for job cards – modern Shine uses data-job-id
        const jobSelector = '[data-job-id], .jobCard, .job_listing';
        try {
          await page.waitForSelector(jobSelector, { timeout: 10000 });
        } catch (e) {
          logger.warn(`[shine] No jobs for ${term}, saving snapshot`);
          await saveSnapshot(page, `shine_${term}_nojobs`);
          continue;
        }

        const pageJobs = await page.evaluate(() => {
          const cards = document.querySelectorAll('[data-job-id], .jobCard, .job_listing');
          const results = [];
          cards.forEach(card => {
            let title = '';
            let titleEl = card.querySelector('h2 a, .job-title a, [class*="title"] a');
            if (titleEl) title = titleEl.textContent.trim();
            if (!title) {
              titleEl = card.querySelector('a[class*="title"]');
              if (titleEl) title = titleEl.textContent.trim();
            }
            const companyEl = card.querySelector('.company, [class*="company"]');
            const company = companyEl ? companyEl.textContent.trim() : '';
            const locationEl = card.querySelector('.location, [class*="location"]');
            const location = locationEl ? locationEl.textContent.trim() : 'India';
            const linkEl = card.querySelector('a[href*="/job-detail/"]') || card.querySelector('a[href*="/jobs/"]');
            const link = linkEl ? linkEl.href : '';
            if (title && link) results.push({ title, company, location, link });
          });
          return results;
        });

        for (const j of pageJobs) {
          if (relevant(j.title)) {
            jobs.push({
              title: j.title, company: j.company, location: j.location || 'India',
              applyUrl: j.link, postedAt: null, source: 'shine', description: '',
            });
          }
        }

        logger.info(`[shine] "${term}": ${pageJobs.length} total, ${pageJobs.filter(j => relevant(j.title)).length} relevant`);
        await randomDelay(2000, 4000);
      } catch (err) {
        logger.warn(`[shine] "${term}": ${err.message}`);
        await saveSnapshot(page, `shine_${term}_error`);
      }
    }
    await page.close();
    return jobs;
  }
}

// ════════════════════════════════════════════════════════════
// FOUNDIT — updated selectors for current layout
// ════════════════════════════════════════════════════════════
class FounditScraper extends BaseScraper {
  constructor() { super('foundit'); }

  async scrape() {
    const page = await this.newPage();
    const jobs = [];

    const queries = [
      'technical+support+engineer',
      'support+engineer',
      'api+integration+engineer',
      'production+support+engineer'
    ];

    for (const q of queries) {
      try {
        const url = `https://www.foundit.in/srp/results?query=${q}&location=India`;
        logger.info(`[foundit] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await randomDelay(2000, 3000);

        const jobSelector = '[data-job-id], .srp-job-card, .card-job, [class*="job-card"]';
        try {
          await page.waitForSelector(jobSelector, { timeout: 10000 });
        } catch (e) {
          logger.warn(`[foundit] No jobs for ${q}, saving snapshot`);
          await saveSnapshot(page, `foundit_${q}_nojobs`);
          continue;
        }

        const pageJobs = await page.evaluate(() => {
          const cards = document.querySelectorAll('[data-job-id], .srp-job-card, .card-job, [class*="job-card"]');
          const results = [];
          cards.forEach(card => {
            const titleEl = card.querySelector('[class*="title"] a, h3 a');
            const title = titleEl ? titleEl.textContent.trim() : '';
            const companyEl = card.querySelector('[class*="company"]');
            const company = companyEl ? companyEl.textContent.trim() : '';
            const locationEl = card.querySelector('[class*="location"]');
            const location = locationEl ? locationEl.textContent.trim() : 'India';
            let link = '';
            if (titleEl && titleEl.href) link = titleEl.href;
            else {
              const linkEl = card.querySelector('a[href*="/job/"]');
              if (linkEl) link = linkEl.href;
            }
            if (title && link) results.push({ title, company, location, link });
          });
          return results;
        });

        for (const j of pageJobs) {
          if (relevant(j.title)) {
            jobs.push({
              title: j.title, company: j.company, location: j.location || 'India',
              applyUrl: j.link, postedAt: null, source: 'foundit', description: '',
            });
          }
        }

        logger.info(`[foundit] "${q}": ${pageJobs.length} total, ${pageJobs.filter(j => relevant(j.title)).length} relevant`);
        await randomDelay(2000, 4000);
      } catch (err) {
        logger.warn(`[foundit] "${q}": ${err.message}`);
        await saveSnapshot(page, `foundit_${q}_error`);
      }
    }
    await page.close();
    return jobs;
  }
}

// ════════════════════════════════════════════════════════════
// WELLFOUND — new domain and selector adjustments
// ════════════════════════════════════════════════════════════
class WellfoundScraper extends BaseScraper {
  constructor() { super('wellfound'); }

  async scrape() {
    const page = await this.newPage();
    const jobs = [];

    const searches = [
      'technical support',
      'support engineer',
      'integration engineer',
      'customer success'
    ];

    for (const term of searches) {
      try {
        const url = `https://wellfound.com/jobs?q=${encodeURIComponent(term)}&l=India&remote=true`;
        logger.info(`[wellfound] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await randomDelay(2000, 3000);

        // Try multiple possible selectors for job cards
        const possibleSelectors = [
          '[data-test="job-listing"]',
          '[class*="JobCard"]',
          '.job-list-item',
          '.job-card'
        ];
        let found = false;
        for (const sel of possibleSelectors) {
          if (await page.$(sel)) {
            found = true;
            break;
          }
        }
        if (!found) {
          logger.warn(`[wellfound] No job container for ${term}, saving snapshot`);
          await saveSnapshot(page, `wellfound_${term}_nojobs`);
          continue;
        }

        // Scroll a bit to load
        await page.evaluate(() => window.scrollBy(0, 500));
        await randomDelay(1000, 1500);

        const pageJobs = await page.evaluate(() => {
          const cards = document.querySelectorAll('[data-test="job-listing"], [class*="JobCard"], .job-list-item');
          const results = [];
          cards.forEach(card => {
            const titleEl = card.querySelector('h2, h3, [class*="title"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            const companyEl = card.querySelector('[class*="company"]');
            const company = companyEl ? companyEl.textContent.trim() : '';
            const locationEl = card.querySelector('[class*="location"]');
            const location = locationEl ? locationEl.textContent.trim() : 'Remote';
            const linkEl = card.querySelector('a[href*="/jobs/"]');
            const link = linkEl ? linkEl.href : '';
            if (title && link) results.push({ title, company, location, link });
          });
          return results;
        });

        for (const j of pageJobs) {
          if (relevant(j.title)) {
            jobs.push({
              title: j.title, company: j.company, location: j.location || 'Remote',
              applyUrl: j.link, postedAt: null, source: 'wellfound', description: '',
            });
          }
        }

        logger.info(`[wellfound] "${term}": ${pageJobs.length} total, ${pageJobs.filter(j => relevant(j.title)).length} relevant`);
        await randomDelay(2000, 4000);
      } catch (err) {
        logger.warn(`[wellfound] "${term}": ${err.message}`);
        await saveSnapshot(page, `wellfound_${term}_error`);
      }
    }
    await page.close();
    return jobs;
  }
}

// ════════════════════════════════════════════════════════════
// INSTAHYRE — may require login; try public API alternative
// ════════════════════════════════════════════════════════════
class InstahyreScraper extends BaseScraper {
  constructor() { super('instahyre'); }

  async scrape() {
    const page = await this.newPage();
    const jobs = [];

    try {
      const url = 'https://www.instahyre.com/jobs/?designation=Support+Engineer&location=India';
      logger.info(`[instahyre] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await randomDelay(2000, 3000);

      const jobSelector = '.job-card, [class*="JobCard"], .job-list-item';
      try {
        await page.waitForSelector(jobSelector, { timeout: 8000 });
      } catch (e) {
        logger.warn('[instahyre] No job cards found, saving snapshot');
        await saveSnapshot(page, 'instahyre_nojobs');
        await page.close();
        return [];
      }

      await page.evaluate(() => window.scrollBy(0, 500));
      await randomDelay(500, 1000);

      const pageJobs = await page.evaluate(() => {
        const cards = document.querySelectorAll('.job-card, [class*="JobCard"], .job-list-item');
        const results = [];
        cards.forEach(card => {
          const titleEl = card.querySelector('h3, .title');
          const title = titleEl ? titleEl.textContent.trim() : '';
          const companyEl = card.querySelector('.company');
          const company = companyEl ? companyEl.textContent.trim() : '';
          const locationEl = card.querySelector('.location');
          const location = locationEl ? locationEl.textContent.trim() : 'India';
          const linkEl = card.querySelector('a[href*="/job/"]') || card.querySelector('a');
          const link = linkEl ? linkEl.href : '';
          if (title && link) results.push({ title, company, location, link });
        });
        return results;
      });

      for (const j of pageJobs) {
        if (relevant(j.title)) {
          jobs.push({
            title: j.title, company: j.company, location: j.location || 'India',
            applyUrl: j.link, postedAt: null, source: 'instahyre', description: '',
          });
        }
      }

      logger.info(`[instahyre] ${pageJobs.length} total, ${jobs.length} relevant`);
    } catch (err) {
      logger.warn(`[instahyre] ${err.message}`);
      await saveSnapshot(page, 'instahyre_error');
    }
    await page.close();
    return jobs;
  }
}

// ════════════════════════════════════════════════════════════
// NAUKRI — unchanged, works already
// ════════════════════════════════════════════════════════════
class NaukriScraper extends BaseScraper {
  constructor() { super('naukri'); }

  async scrape() {
    const page = await this.newPage();
    const jobs = [];
    const MAX_PAGES = 2;

    const searches = [
      { term: 'technical-support-engineer', loc: 'India' },
      { term: 'support-engineer', loc: 'India' },
    ];

    for (const { term, loc } of searches) {
      for (let pg = 1; pg <= MAX_PAGES; pg++) {
        try {
          const url = `https://www.naukri.com/${term}-jobs-in-india-${pg}`;
          logger.info(`[Naukri] Fetching ${url}`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await randomDelay(3000, 5000);

          const title = await page.title();
          if (title.toLowerCase().includes('access denied') ||
              title.toLowerCase().includes('captcha')) {
            logger.warn('[Naukri] Bot detection triggered — stopping');
            await page.close();
            return jobs;
          }

          const pageJobs = await page.evaluate(() => {
            const cards = document.querySelectorAll('.jobTuple, .cust-job-tuple');
            const results = [];
            cards.forEach(card => {
              const titleEl = card.querySelector('.title a, a.title');
              const companyEl = card.querySelector('.companyInfo a');
              const locationEl = card.querySelector('.locWdth');
              if (titleEl) {
                results.push({
                  title: titleEl.textContent?.trim() || '',
                  company: companyEl?.textContent?.trim() || '',
                  location: locationEl?.textContent?.trim() || 'India',
                  link: titleEl.href || '',
                });
              }
            });
            return results;
          });

          for (const j of pageJobs) {
            if (relevant(j.title) && j.link) {
              jobs.push({
                title: j.title, company: j.company, location: j.location || 'India',
                applyUrl: j.link, postedAt: null, source: 'naukri', description: '',
              });
            }
          }

          logger.info(`[Naukri] Page ${pg} "${term}": ${pageJobs.filter(j => relevant(j.title)).length} relevant`);
          await randomDelay(5000, 8000);
        } catch (err) {
          logger.warn(`[Naukri] pg${pg} "${term}": ${err.message}`);
          break;
        }
      }
      await randomDelay(8000, 12000);
    }
    await page.close();
    return jobs;
  }
}

module.exports = {
  HiristScraper,
  ShineScraper,
  FounditScraper,
  WellfoundScraper,
  NaukriScraper,
  InstahyreScraper,
};