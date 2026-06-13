'use strict';

const crypto = require('crypto');
const { detectGeo, detectRemoteType } = require('./geoDetector');

/**
 * Target Roles
 */
const ROLE_KEYWORDS = [
  'technical support engineer',
  'support engineer',
  'api support engineer',
  'production support engineer',
  'application support engineer',
  'integration engineer',
  'integration support engineer',
  'platform support engineer',
  'developer support engineer',
  'customer success engineer',
  'technical account manager',
  'cloud support engineer',
  'software support engineer',
  'l2 support',
  'l3 support'
];

/**
 * SaaS Companies
 */
const SAAS_COMPANIES = [
  'postman',
  'stripe',
  'cloudflare',
  'datadog',
  'gitlab',
  'zendesk',
  'notion',
  'freshworks',
  'intercom',
  'pagerduty',
  'elastic',
  'mongodb',
  'browserstack',
  'razorpay',
  'cashfree',
  'chargebee',
  'samsara',
  'rippling',
  'supabase'
];

/**
 * Excluded Roles
 */
const EXCLUDED_KEYWORDS = [
  'sales engineer',
  'presales',
  'pre-sales',
  'account executive',
  'director',
  'vp',
  'head of',
  'manager'
];

/**
 * Generate Stable ID
 */
function generateId(url) {
  return crypto
    .createHash('sha256')
    .update(url)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Normalize Job
 */
function normalize(raw) {
  const url = (raw.applyUrl || raw.url || '').trim();

  if (!url) return null;

  const title = (raw.title || '').trim();
  const company = (raw.company || '').trim();
  const location = (raw.location || '').trim();

  const description =
    raw.description ||
    raw.content ||
    raw.body ||
    raw.text ||
    '';

  const geo = detectGeo(title, location);
  const remoteType = detectRemoteType(title, location);

  const skills = extractSkills(description);

  const tags = buildTags(
    title,
    company,
    geo,
    raw.source
  );

  return {
    id: generateId(url),

    title,
    company,
    location,

    geo,
    remote_type: remoteType,

    source: raw.source || 'unknown',

    apply_url: url,

    posted_at:
      raw.postedAt ||
      raw.posted_at ||
      null,

    salary: raw.salary || '',

    description: description.slice(0, 5000),

    skills: JSON.stringify(skills),

    tags: JSON.stringify(tags),

    rank_score: 0,

    fetched_at: new Date().toISOString(),

    is_active: 1
  };
}

/**
 * Extract Skills
 */
function extractSkills(desc = '') {
  const text = desc.toLowerCase();

  const skillList = [
    'python',
    'sql',
    'javascript',
    'typescript',
    'java',
    'php',
    'bash',

    'aws',
    'azure',
    'gcp',

    'docker',
    'kubernetes',

    'linux',

    'api',
    'rest',
    'graphql',

    'postman',
    'jira',
    'confluence',

    'datadog',
    'splunk',
    'grafana',
    'newrelic',
    'pagerduty',

    'mysql',
    'postgresql',
    'mongodb',
    'redis',

    'git',
    'github',
    'gitlab',

    'terraform',
    'ansible',

    'ci/cd'
  ];

  return skillList.filter(skill =>
    text.includes(skill)
  );
}

/**
 * Build Tags
 */
function buildTags(
  title,
  company,
  geo,
  source
) {
  const tags = [];

  const t = title.toLowerCase();
  const c = company.toLowerCase();

  const isExcluded =
    EXCLUDED_KEYWORDS.some(k =>
      t.includes(k)
    );

  const isTarget =
    ROLE_KEYWORDS.some(k =>
      t.includes(k)
    );

  if (isTarget && !isExcluded) {
    tags.push('target-role');
  }

  if (t.includes('senior')) {
    tags.push('senior');
  }

  if (t.includes('l2')) {
    tags.push('l2');
  }

  if (t.includes('l3')) {
    tags.push('l3');
  }

  if (t.includes('api')) {
    tags.push('api');
  }

  if (t.includes('integration')) {
    tags.push('integration');
  }

  if (geo === 'india') {
    tags.push('india');
  }

  if (geo === 'remote') {
    tags.push('remote');
  }

  if (
    SAAS_COMPANIES.some(s =>
      c.includes(s)
    )
  ) {
    tags.push('saas');
  }

  if (source) {
    tags.push(source);
  }

  return [...new Set(tags)];
}

module.exports = {
  normalize,
  generateId,
  extractSkills,
  buildTags,
  ROLE_KEYWORDS,
  SAAS_COMPANIES
};