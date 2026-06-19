'use strict';
// src/services/deduplicator.js

const crypto = require('crypto');
const db     = require('../db/db');
const logger = require('../utils/logger');
const { distance } = require('fastest-levenshtein');

/**
 * Hash a URL for fast lookup
 */
function hashUrl(url) {
  return crypto.createHash('md5').update(url.toLowerCase().trim()).digest('hex');
}

/**
 * Check if URL has been seen before
 */
function isSeenUrl(url) {
  const hash = hashUrl(url);
  const row  = db.prepare('SELECT 1 FROM seen_urls WHERE url_hash = ?').get(hash);
  return !!row;
}

/**
 * Mark URL as seen
 */
function markUrlSeen(url) {
  const hash = hashUrl(url);
  db.prepare(`
    INSERT OR IGNORE INTO seen_urls (url_hash, url) VALUES (?, ?)
  `).run(hash, url);
}

function refreshExistingJob(job) {
  const result = db.prepare(`
    UPDATE jobs
    SET title = @title,
        company = @company,
        location = @location,
        remote_type = @remote_type,
        geo = @geo,
        source = @source,
        posted_at = @posted_at,
        salary = @salary,
        description = @description,
        skills = @skills,
        tags = @tags,
        rank_score = @rank_score,
        fetched_at = @fetched_at,
        is_active = 1
    WHERE apply_url = @apply_url
  `).run(job);

  return result.changes > 0;
}

/**
 * Check fuzzy duplicate — same company + similar title
 * Uses Levenshtein distance threshold
 */
function isFuzzyDuplicate(title, company) {
  const existing = db.prepare(`
    SELECT title FROM jobs
    WHERE company = ? AND is_active = 1
    LIMIT 20
  `).all(company);

  for (const row of existing) {
    const d = distance(title.toLowerCase(), row.title.toLowerCase());
    const maxLen = Math.max(title.length, row.title.length);
    const similarity = 1 - d / maxLen;
    if (similarity > 0.85) return true;  // 85% similar = duplicate
  }
  return false;
}

/**
 * Main dedupe check — returns true if job should be SKIPPED
 */
function isDuplicate(job) {
  // 1. URL exact match (fastest)
  if (isSeenUrl(job.apply_url)) return true;

  // 2. Fuzzy title+company match
  if (isFuzzyDuplicate(job.title, job.company)) return true;

  return false;
}

/**
 * Insert a job into DB if not duplicate
 * Returns true if inserted, false if skipped
 */
function insertIfNew(job) {
  if (isSeenUrl(job.apply_url)) {
    refreshExistingJob(job);
    return false;
  }

  if (isFuzzyDuplicate(job.title, job.company)) {
    markUrlSeen(job.apply_url);
    return false;
  }

  try {
    db.prepare(`
      INSERT OR IGNORE INTO jobs
        (id, title, company, location, remote_type, geo, source,
         apply_url, posted_at, salary, description, skills, tags,
         rank_score, fetched_at, is_active)
      VALUES
        (@id, @title, @company, @location, @remote_type, @geo, @source,
         @apply_url, @posted_at, @salary, @description, @skills, @tags,
         @rank_score, @fetched_at, @is_active)
    `).run(job);

    markUrlSeen(job.apply_url);
    return true;
  } catch (err) {
    logger.error(`DB insert failed for ${job.title} at ${job.company}: ${err.message}`);
    return false;
  }
}

/**
 * Bulk insert array of normalized jobs
 * Returns { inserted, skipped }
 */
function bulkInsert(jobs) {
  let inserted = 0, skipped = 0;
  const insertMany = db.transaction((jobs) => {
    for (const job of jobs) {
      if (insertIfNew(job)) inserted++;
      else skipped++;
    }
  });
  insertMany(jobs);
  return { inserted, skipped };
}

/**
 * Remove jobs older than STALE_DAYS
 */
function purgeStaleJobs() {
  const days = parseInt(process.env.STALE_DAYS) || 30;
  const result = db.prepare(`
    DELETE FROM jobs
    WHERE fetched_at < datetime('now', '-${days} days')
  `).run();
  logger.info(`Purged ${result.changes} stale jobs older than ${days} days`);
  return result.changes;
}

module.exports = { isDuplicate, insertIfNew, bulkInsert, purgeStaleJobs, markUrlSeen };
