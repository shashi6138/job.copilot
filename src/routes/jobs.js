'use strict';
// src/routes/jobs.js

const express = require('express');
const router  = express.Router();
const db      = require('../db/db');
const logger  = require('../utils/logger');
const { runAllScrapers } = require('../services/scrapeOrchestrator');

// ── GET /api/jobs ─────────────────────────────────────────
// Main endpoint — your frontend calls this
// Query params:
//   geo      = india | remote | worldwide | hybrid | all
//   source   = greenhouse | lever | ashby | adzuna | remotive | google_jobs | etc
//   time     = 1h | 6h | 24h | 3d | 7d | 30d | all
//   q        = search string
//   page     = page number (default 1)
//   limit    = results per page (default 30, max 100)
//   sort     = rank | date | company
router.get('/', (req, res) => {
  try {
    const {
      geo    = 'all',
      source = 'all',
      time   = 'all',
      q      = '',
      page   = 1,
      limit  = 30,
      sort   = 'rank',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const offset   = (pageNum - 1) * limitNum;

    // Build WHERE clauses
    const conditions = ['is_active = 1'];
    const params     = [];

    if (geo !== 'all') {
      conditions.push('geo = ?');
      params.push(geo);
    }

    if (source !== 'all') {
      conditions.push('source = ?');
      params.push(source);
    }

    if (time !== 'all') {
      const timeMap = {
        '1h':  "datetime('now', '-1 hours')",
        '6h':  "datetime('now', '-6 hours')",
        '24h': "datetime('now', '-1 days')",
        '3d':  "datetime('now', '-3 days')",
        '7d':  "datetime('now', '-7 days')",
        '30d': "datetime('now', '-30 days')",
      };
      if (timeMap[time]) {
        conditions.push(`fetched_at >= ${timeMap[time]}`);
      }
    }

    if (q) {
      conditions.push('(title LIKE ? OR company LIKE ? OR location LIKE ? OR description LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const where = conditions.join(' AND ');

    // Order by
    const orderMap = {
      rank:    'rank_score DESC, fetched_at DESC',
      date:    'posted_at DESC NULLS LAST, fetched_at DESC',
      company: 'company ASC',
    };
    const order = orderMap[sort] || orderMap.rank;

    // Count total
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM jobs WHERE ${where}`)
      .get(...params).cnt;

    // Fetch page
    const jobs = db.prepare(
      `SELECT id, title, company, location, geo, remote_type, source,
              apply_url, posted_at, salary, skills, tags, rank_score, fetched_at
       FROM jobs
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`
    ).all(...params, limitNum, offset);

    // Parse JSON fields
    const formatted = jobs.map(j => ({
      ...j,
      skills: safeJsonParse(j.skills, []),
      tags:   safeJsonParse(j.tags, []),
    }));

    res.json({
      success: true,
      data:    formatted,
      meta: {
        total,
        page:     pageNum,
        limit:    limitNum,
        pages:    Math.ceil(total / limitNum),
        hasNext:  pageNum < Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    logger.error(`GET /api/jobs: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/jobs/:id ─────────────────────────────────────
// GET /api/jobs/stats
router.get('/stats', async (req, res) => {
  try {
    const totalJobs = db
      .prepare('SELECT COUNT(*) as count FROM jobs')
      .get();

    const sources = db
      .prepare(`
        SELECT source, COUNT(*) as count
        FROM jobs
        GROUP BY source
      `)
      .all();

    res.json({
      success: true,
      totalJobs: totalJobs.count,
      sources,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get('/sources', (req, res) => {
  try {
    const sources = db.prepare(`
      SELECT source, COUNT(*) AS count
      FROM jobs
      WHERE is_active = 1
      GROUP BY source
      ORDER BY count DESC
    `).all();

    res.json({
      success: true,
      data: sources
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

router.get('/stats/summary', (req, res) => {
  try {
    const total  = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE is_active=1").get().n;
    const india  = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE geo='india' AND is_active=1").get().n;
    const remote = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE geo='remote' AND is_active=1").get().n;
    const today  = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE fetched_at >= datetime('now','-1 days') AND is_active=1").get().n;
    const week   = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE fetched_at >= datetime('now','-7 days') AND is_active=1").get().n;
    const highScore = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE rank_score >= 70 AND is_active=1").get().n;
    const withSalary = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE salary IS NOT NULL AND salary != '' AND is_active=1").get().n;

    const bySrc = db.prepare(
      "SELECT source, COUNT(*) as count FROM jobs WHERE is_active=1 GROUP BY source ORDER BY count DESC"
    ).all();

    const lastRun = db.prepare(
      "SELECT * FROM scraper_runs ORDER BY started_at DESC LIMIT 1"
    ).get();

    res.json({
      success: true,
      data: { total, india, remote, today, week, highScore, withSalary, bySrc, lastRun },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Full job detail including description
router.get('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({
      success: true,
      data: {
        ...job,
        skills: safeJsonParse(job.skills, []),
        tags:   safeJsonParse(job.tags, []),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/jobs/stats/summary ───────────────────────────
// ── POST /api/jobs/scrape ─────────────────────────────────
// Manually trigger a scrape run (protected by API key)
router.post('/scrape', async (req, res) => {
  const expectedKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_KEY || process.env.API_KEY || '').trim();
  const authHeader = req.headers.authorization || '';
  const headerKey = req.headers['x-api-key'] || '';
  const key = String(headerKey || authHeader.replace(/^Bearer\s+/i, '')).trim();

  if (!expectedKey) {
    logger.error('Manual scrape blocked: admin API key is not configured');
    return res.status(503).json({
      success: false,
      error: 'Admin API key is not configured on backend. Set ADMIN_API_KEY or ADMIN_KEY.',
    });
  }

  if (key !== expectedKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.json({ success: true, message: 'Scrape started in background' });

  // Run async after response sent
  setImmediate(async () => {
    try {
      await runAllScrapers({ includeSlow: req.body?.slow === true });
    } catch (err) {
      logger.error(`Manual scrape failed: ${err.message}`);
    }
  });
});

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

module.exports = router;
