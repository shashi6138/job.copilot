'use strict';
// src/scrapers/apiScrapers.js
// API-based scrapers (no browser needed) — most reliable

const axios  = require('axios');
const logger = require('../utils/logger');
const { randomDelay } = require('../utils/delays');

// ── Target role keywords ──────────────────────────────────────
const KEYWORDS = [
  'technical support','support engineer','integration engineer',
  'api support','production support','application support',
  'platform support','developer support','l2 support','l3 support',
  'customer support engineer','cloud support','saas support',
  'payment support','software support','helpdesk','it support',
  'customer success engineer','solutions engineer','technical account'
];

function relevant(title = '') {
  return KEYWORDS.some(k => title.toLowerCase().includes(k));
}

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ════════════════════════════════════════════════════════════
// GREENHOUSE
// ════════════════════════════════════════════════════════════
const GH_COMPANIES = [
  'gleanwork','samsara','narvar','postman','bottomlinetechnologies',
  'freshworks','chargebee','sprinklr','zendesk','intercom',
  'pagerduty','elastic','mongodb','cloudflare','gitlab',
  'figma','rippling','lattice','asana','miro','segment',
  'amplitude','mixpanel','hubspot','dynatrace','supabase',
  'stripe','brex','plaid','airbase','moderntreasury','marqeta',
  'adyen','rapyd','nium','airwallex','servicenow','salesforce',
  'crowdstrike','snyk','lacework','wiz','hashicorp','datadog',
  'newrelic','razorpay','browserstack','clevertap'
];

async function scrapeGreenhouse() {
  const allJobs = [];
  logger.info('[Greenhouse] Starting API scrape...');

  for (const token of GH_COMPANIES) {
    try {
      const res = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
        { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const jobs = (res.data.jobs || [])
        .filter(j => relevant(j.title))
        .map(j => ({
          title:    j.title,
          company:  token.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          location: (j.location || {}).name || '',
          applyUrl: j.absolute_url || `https://job-boards.greenhouse.io/${token}/jobs/${j.id}`,
          postedAt: j.updated_at || null,
          source:   'greenhouse',
          description: '',  // fetch on demand
        }));
      allJobs.push(...jobs);
      await randomDelay(800, 1500);
    } catch (err) {
      logger.warn(`[Greenhouse] ${token}: ${err.message}`);
    }
  }

  logger.info(`[Greenhouse] Done — ${allJobs.length} relevant jobs`);
  return allJobs;
}

// ════════════════════════════════════════════════════════════
// LEVER
// ════════════════════════════════════════════════════════════
const LV_COMPANIES = [
  'certifyos','talend','thinkahead','clari','fullstacklabs',
  'megaport','agiloft','gusto','netlify','grafana','neon',
  'cockroachlabs','hasura','ably','stytch','scale-ai','cashfree',
  'open-financial','niyo','kustomer','talkdesk','front-app',
  'helpscout','decentro','innovaccer','darwinbox','leadsquared'
];

async function scrapeLever() {
  const allJobs = [];
  logger.info('[Lever] Starting API scrape...');

  for (const token of LV_COMPANIES) {
    try {
      const res = await axios.get(
        `https://api.lever.co/v0/postings/${token}?mode=json`,
        { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const data = Array.isArray(res.data) ? res.data : [];
      const jobs = data
        .filter(j => relevant(j.text))
        .map(j => ({
          title:    j.text,
          company:  token.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          location: (j.categories || {}).location || '',
          applyUrl: j.hostedUrl || `https://jobs.lever.co/${token}/${j.id}`,
          postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
          source:   'lever',
          description: stripHtml(
            ((j.descriptionBody || '') +
            (j.lists || []).map(l => (l.text || '') + ' ' + (l.content || '')).join(' ')).slice(0, 3000)
          ),
        }));
      allJobs.push(...jobs);
      await randomDelay(800, 1500);
    } catch (err) {
      logger.warn(`[Lever] ${token}: ${err.message}`);
    }
  }

  logger.info(`[Lever] Done — ${allJobs.length} relevant jobs`);
  return allJobs;
}

// ════════════════════════════════════════════════════════════
// ASHBY
// ════════════════════════════════════════════════════════════
const ASH_COMPANIES = [
  'linear','mercury','ramp','deel','remote','descript','coda',
  'raycast','superhuman','liveblocks','resend','neon',
  'motherduck','turso','fly-io','railway','render',
  'retool','posthog','cal','formbricks','typebot'
];

async function scrapeAshby() {
  const allJobs = [];
  logger.info('[Ashby] Starting API scrape...');

  for (const token of ASH_COMPANIES) {
    try {
      const res = await axios.get(
        `https://api.ashbyhq.com/posting-api/job-board/${token}`,
        { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const jobs = (res.data.jobPostings || [])
        .filter(j => relevant(j.title))
        .map(j => ({
          title:    j.title,
          company:  token.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          location: j.isRemote ? 'Remote' : (j.locationName || ''),
          applyUrl: j.jobUrl || `https://jobs.ashbyhq.com/${token}/${j.id}`,
          postedAt: j.publishedAt || null,
          source:   'ashby',
          description: stripHtml((j.descriptionHtml || j.descriptionPlain || '').slice(0, 3000)),
        }));
      allJobs.push(...jobs);
      await randomDelay(800, 1500);
    } catch (err) {
      logger.warn(`[Ashby] ${token}: ${err.message}`);
    }
  }

  logger.info(`[Ashby] Done — ${allJobs.length} relevant jobs`);
  return allJobs;
}

// ════════════════════════════════════════════════════════════
// ADZUNA — aggregates Naukri, Indeed, Shine, Monster, TimesJobs
// ════════════════════════════════════════════════════════════
async function scrapeAdzuna() {
  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    logger.warn('[Adzuna] No API credentials — skipping');
    return [];
  }

  const queries = [
    'technical support engineer',
    'api integration engineer',
    'production support engineer',
    'application support engineer',
    'l2 support engineer',
    'customer success engineer saas',
  ];

  const allJobs = [];
  logger.info('[Adzuna] Starting API scrape (India)...');

  for (const q of queries) {
    try {
      const url = `https://api.adzuna.com/v1/api/jobs/in/search/1` +
        `?app_id=${appId}&app_key=${appKey}` +
        `&results_per_page=25&what=${encodeURIComponent(q)}` +
        `&content-type=application/json`;
      const res = await axios.get(url, { timeout: 10000 });
      const jobs = (res.data.results || []).map(j => ({
        title:    j.title,
        company:  (j.company || {}).display_name || '',
        location: (j.location || {}).display_name || 'India',
        applyUrl: j.redirect_url || '',
        postedAt: j.created || null,
        source:   'adzuna',
        salary:   j.salary_min
          ? `₹${Math.round(j.salary_min / 1000)}k–₹${Math.round((j.salary_max || j.salary_min) / 1000)}k`
          : '',
        description: stripHtml((j.description || '').slice(0, 3000)),
      })).filter(j => j.applyUrl);
      allJobs.push(...jobs);
      await randomDelay(500, 1000);
    } catch (err) {
      logger.warn(`[Adzuna] Query "${q}": ${err.message}`);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = allJobs.filter(j => {
    if (seen.has(j.applyUrl)) return false;
    seen.add(j.applyUrl);
    return true;
  });

  logger.info(`[Adzuna] Done — ${unique.length} unique jobs`);
  return unique;
}

// ════════════════════════════════════════════════════════════
// REMOTIVE — free remote jobs API
// ════════════════════════════════════════════════════════════
async function scrapeRemotive() {
  logger.info('[Remotive] Starting API scrape...');
  try {
    const res = await axios.get(
      'https://remotive.com/api/remote-jobs?category=customer-support&limit=50',
      { timeout: 10000 }
    );
    const jobs = (res.data.jobs || [])
      .filter(j => relevant(j.title))
      .map(j => ({
        title:    j.title,
        company:  j.company_name || '',
        location: 'Remote',
        applyUrl: j.url || '',
        postedAt: j.publication_date || null,
        source:   'remotive',
        description: stripHtml((j.description || '').slice(0, 3000)),
      }));
    logger.info(`[Remotive] Done — ${jobs.length} relevant jobs`);
    return jobs;
  } catch (err) {
    logger.error(`[Remotive] Failed: ${err.message}`);
    return [];
  }
}

module.exports = {
  scrapeGreenhouse,
  scrapeLever,
  scrapeAshby,
  scrapeAdzuna,
  scrapeRemotive,
};
