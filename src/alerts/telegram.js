'use strict';
// src/alerts/telegram.js
// Free Telegram Bot API — no cost ever

const axios  = require('axios');
const logger = require('../utils/logger');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const BASE_URL  = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Escape special characters for HTML parse mode (only &, <, >)
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send a plain text message (no formatting)
 */
async function sendPlainText(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    logger.warn('[Telegram] Not configured — skipping alert');
    return false;
  }
  try {
    await axios.post(`${BASE_URL}/sendMessage`, {
      chat_id: CHAT_ID,
      text: text.slice(0, 4096), // Telegram limit
      parse_mode: undefined,
      disable_web_page_preview: true,
    }, { timeout: 8000 });
    return true;
  } catch (err) {
    const errorDetail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.error(`[Telegram] Plain text send failed: ${errorDetail}`);
    return false;
  }
}

/**
 * Send a formatted job alert card using HTML (safe and reliable)
 */
async function sendJob(job) {
  if (!BOT_TOKEN || !CHAT_ID) {
    logger.warn('[Telegram] Not configured — skipping job alert');
    return false;
  }

  // Guard against invalid job object
  if (!job || !job.title) {
    logger.warn('[Telegram] Attempted to send invalid job object');
    return false;
  }

  // Escape all dynamic text fields
  const title = escapeHtml(job.title);
  const company = escapeHtml(job.company || 'Unknown company');
  const location = escapeHtml(job.location || job.geo || 'Unknown location');
  const source = escapeHtml(job.source || 'unknown');
  const salary = job.salary ? escapeHtml(job.salary) : null;
  const postedAt = job.posted_at ? new Date(job.posted_at).toLocaleDateString('en-IN') : null;

  // Geo emoji mapping
  const geoEmoji = {
    india: '🇮🇳',
    remote: '🌐',
    worldwide: '🌍',
    hybrid: '🏢'
  }[job.geo] || '📍';

  // Build message with HTML tags
  let htmlMessage = `<b>${title}</b>\n` +
                    `<b>🏢</b> ${company}\n` +
                    `${geoEmoji} ${location}\n` +
                    `<b>📦 Source:</b> ${source}\n` +
                    `<b>⭐ Score:</b> ${job.rank_score || 'N/A'}/100`;

  if (salary) {
    htmlMessage += `\n<b>💰 Salary:</b> ${salary}`;
  }
  if (postedAt) {
    htmlMessage += `\n<b>🕐 Posted:</b> ${postedAt}`;
  }
  if (job.apply_url) {
    htmlMessage += `\n\n<a href="${job.apply_url}">🔗 Apply Here ↗</a>`;
  }

  // Trim to Telegram's 4096 character limit
  if (htmlMessage.length > 4096) {
    htmlMessage = htmlMessage.slice(0, 4000) + '…\n\n<a href="' + (job.apply_url || '') + '">View job</a>';
  }

  try {
    await axios.post(`${BASE_URL}/sendMessage`, {
      chat_id: CHAT_ID,
      text: htmlMessage,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }, { timeout: 8000 });

    // Small delay between alerts to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
    logger.info(`[Telegram] Job alert sent: ${job.title}`);
    return true;
  } catch (err) {
    const errorDetail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.warn(`[Telegram] HTML send failed for "${job.title}": ${errorDetail}`);

    // Fallback: send plain text without any formatting
    const plainText = `${job.title}\n${job.company || ''} · ${location}\nApply: ${job.apply_url || 'no link'}`;
    const fallbackOk = await sendPlainText(plainText);
    if (fallbackOk) {
      logger.warn(`[Telegram] Fallback plain text sent for "${job.title}"`);
    } else {
      logger.error(`[Telegram] Both HTML and plain text failed for "${job.title}"`);
    }
    return fallbackOk;
  }
}

/**
 * Send a plain text message (legacy wrapper, kept for compatibility)
 */
async function send(text) {
  return sendPlainText(text);
}

/**
 * Send a daily digest summary
 */
async function sendDailyDigest(stats) {
  const text = [
    `📊 *Job Copilot — Daily Summary*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🇮🇳 India jobs: ${stats.india || 0}`,
    `🌐 Remote jobs: ${stats.remote || 0}`,
    `📋 Total active: ${stats.total || 0}`,
    `🆕 New today: ${stats.newToday || 0}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Open your dashboard to apply_`,
  ].join('\n');
  // Daily digest can be plain text (no formatting needed)
  await sendPlainText(text);
}

module.exports = { send, sendJob, sendDailyDigest };