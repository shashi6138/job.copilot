'use strict';
// src/server.js — Main Express server

require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const logger      = require('./utils/logger');
const db          = require('./db/db');
const { startScheduler } = require('./scheduler/cron');

// Initialize DB schema on first run
require('./db/schema');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ───────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true
}));

app.options('*', cors());

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(express.json());

// Rate limiter — 100 requests per minute per IP
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  message: { success: false, error: 'Too many requests — try again shortly' },
}));

// Request logger
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path} — ${req.ip}`);
  next();
});

// ── ROUTES ─────────────────────────────────────────────────
app.use('/api/jobs', require('./routes/jobs'));

// Health check
app.get('/health', (_req, res) => {
  const expectedKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_KEY || process.env.API_KEY || '').trim();
  const keySource = process.env.ADMIN_API_KEY ? 'ADMIN_API_KEY'
    : process.env.ADMIN_KEY ? 'ADMIN_KEY'
    : process.env.API_KEY ? 'API_KEY'
    : 'none';
  const jobsCount = db.prepare('SELECT COUNT(*) as n FROM jobs').get().n;
  const lastRun = db.prepare('SELECT * FROM scraper_runs ORDER BY started_at DESC LIMIT 1').get();

  res.json({
    status: 'ok',
    uptime: process.uptime().toFixed(0) + 's',
    time:   new Date().toISOString(),
    env:    process.env.NODE_ENV,
    adminKeyConfigured: !!expectedKey,
    adminKeySource: keySource,
    jobsCount,
    lastRun,
  });
});

// Root
app.get('/', (_req, res) => {
  res.json({
    name:    'Job Copilot API',
    version: '1.0.0',
    docs:    'GET /api/jobs — fetch jobs with filters',
    health:  'GET /health',
  });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`════════════════════════════════════`);
  logger.info(`  Job Copilot API running on :${PORT}`);
  logger.info(`  ENV: ${process.env.NODE_ENV}`);
  logger.info(`════════════════════════════════════`);

  // Start scheduled scraping
  startScheduler();
});

module.exports = app;
