// Structured logger with production JSON format and development pretty format.
import { config } from '../config/index.js';

const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = levels[config.logging?.level] || levels.info;
const isProduction = config.env === 'production';
const logFormat = config.logging?.format || (isProduction ? 'json' : 'pretty');

function formatLogEntry(level, msg, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...(meta && { meta }),
  };

  if (logFormat === 'pretty') {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const color = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
    }[level] || '\x1b[0m';
    const reset = '\x1b[0m';
    return `${color}[${entry.timestamp}] ${level.toUpperCase()}:${reset} ${msg}${metaStr}`;
  }

  // JSON format for production
  return JSON.stringify(entry);
}

function log(level, msg, meta) {
  if (levels[level] < threshold) return;
  const formatted = formatLogEntry(level, msg, meta);
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(formatted + '\n');
}

export const logger = {
  debug: (m, meta) => log('debug', m, meta),
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
};
