'use strict';
// src/db/schema.js
// Run once: node src/db/schema.js

const path = require('path');
const fs   = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/jobs.db';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  /* ── JOBS ─────────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    company     TEXT NOT NULL,
    location    TEXT DEFAULT '',
    remote_type TEXT DEFAULT 'unknown',
    -- 'india' | 'remote' | 'worldwide' | 'hybrid' | 'unknown'
    geo         TEXT DEFAULT 'unknown',
    source      TEXT NOT NULL,
    apply_url   TEXT UNIQUE NOT NULL,
    posted_at   TEXT,
    salary      TEXT DEFAULT '',
    description TEXT DEFAULT '',
    skills      TEXT DEFAULT '[]',
    tags        TEXT DEFAULT '[]',
    rank_score  INTEGER DEFAULT 0,
    fetched_at  TEXT DEFAULT (datetime('now')),
    is_active   INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_source     ON jobs(source);
  CREATE INDEX IF NOT EXISTS idx_jobs_geo        ON jobs(geo);
  CREATE INDEX IF NOT EXISTS idx_jobs_rank       ON jobs(rank_score DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_posted     ON jobs(posted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_fetched    ON jobs(fetched_at DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_active     ON jobs(is_active);

  /* ── SCRAPER RUNS LOG ─────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS scraper_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,
    started_at  TEXT DEFAULT (datetime('now')),
    ended_at    TEXT,
    jobs_found  INTEGER DEFAULT 0,
    jobs_new    INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'running',
    -- 'running' | 'success' | 'error'
    error_msg   TEXT
  );

  /* ── SEEN URL CACHE (fast dedupe) ─────────────────────── */
  CREATE TABLE IF NOT EXISTS seen_urls (
    url_hash    TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    first_seen  TEXT DEFAULT (datetime('now'))
  );

  /* ── ALERTS LOG ───────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS alerts_sent (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id    TEXT NOT NULL,
    channel   TEXT NOT NULL,
    sent_at   TEXT DEFAULT (datetime('now'))
  );
`);

console.log('✓ Database schema initialized at', DB_PATH);
module.exports = db;
