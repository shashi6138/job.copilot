'use strict';
// src/utils/logger.js

const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return stack
        ? `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`
        : `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: './logs/error.log',
      level: 'error',
      maxsize: 5242880,  // 5MB
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: './logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Create logs dir if not exists
const fs = require('fs');
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

module.exports = logger;
