'use strict';
// src/utils/delays.js

const MIN = parseInt(process.env.SCRAPER_MIN_DELAY) || 3000;
const MAX = parseInt(process.env.SCRAPER_MAX_DELAY) || 8000;

/**
 * Random delay between MIN and MAX ms
 * Simulates human-like browsing behavior
 */
function randomDelay(min = MIN, max = MAX) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Short delay for between actions on same page
 */
function shortDelay() {
  return randomDelay(500, 2000);
}

/**
 * Long delay for between different sites
 */
function longDelay() {
  return randomDelay(8000, 15000);
}

module.exports = { randomDelay, shortDelay, longDelay };

// ─────────────────────────────────────────────────────────────

// src/utils/userAgents.js
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

module.exports.randomUserAgent = randomUserAgent;
module.exports.USER_AGENTS = USER_AGENTS;
