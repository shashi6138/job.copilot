'use strict';

const { ROLE_KEYWORDS, SAAS_COMPANIES } = require('./jobNormalizer');

const EXCLUDED_KEYWORDS = [
  'sales engineer',
  'presales',
  'pre-sales',
  'account executive',
  'solutions architect',
  'manager',
  'director',
  'head of',
  'vp '
];

function rankJob(job) {
  let score = 0;

  const title = (job.title || '').toLowerCase();
  const company = (job.company || '').toLowerCase();

  // Reject irrelevant roles immediately
  if (EXCLUDED_KEYWORDS.some(k => title.includes(k))) {
    return 0;
  }

  // ===================================================
  // GEO SCORE
  // ===================================================

  if (job.geo === 'india') score += 50;
  else if (job.geo === 'remote') score += 30;
  else if (job.geo === 'hybrid') score += 20;
  else if (job.geo === 'apac') score += 15;

  // ===================================================
  // ROLE SCORE
  // ===================================================

  if (title.includes('production support')) score += 40;
  if (title.includes('technical support')) score += 40;
  if (title.includes('application support')) score += 40;
  if (title.includes('api support')) score += 35;
  if (title.includes('integration engineer')) score += 30;
  if (title.includes('customer success engineer')) score += 25;
  if (title.includes('support engineer')) score += 25;

  const matches = ROLE_KEYWORDS.filter(k => title.includes(k)).length;

  score += Math.min(matches * 5, 20);

  // ===================================================
  // RECENCY
  // ===================================================

  if (job.posted_at) {
    const ageMs = Date.now() - new Date(job.posted_at).getTime();

    if (ageMs < 86400000) score += 20;
    else if (ageMs < 259200000) score += 15;
    else if (ageMs < 604800000) score += 10;
  }

  // ===================================================
  // SAAS BONUS
  // ===================================================

  if (SAAS_COMPANIES.some(s => company.includes(s))) {
    score += 15;
  }

  // ===================================================
  // TARGET COMPANIES
  // ===================================================

  if (company.includes('postman')) score += 20;
  if (company.includes('stripe')) score += 20;
  if (company.includes('cloudflare')) score += 15;
  if (company.includes('datadog')) score += 15;
  if (company.includes('gitlab')) score += 10;

  // ===================================================
  // SALARY BONUS
  // ===================================================

  if (job.salary && job.salary.trim()) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

module.exports = { rankJob };