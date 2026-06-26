/**
 * @file Structured logger with production JSON and development pretty output.
 *
 * Supports **correlation IDs** for request tracing and **child loggers**
 * for module-scoped metadata.
 *
 * @example
 * import { logger, setCorrelationId } from '../utils/logger.js';
 * setCorrelationId('req-abc-123');
 * logger.info('Booking created', { bookingId: 42 });
 *
 * // Module-scoped logger
 * const log = logger.child({ module: 'paymentService' });
 * log.error('Payment failed', { txRef: 'abc' });
 */

import { config } from '../config/index.js';

/** @type {Object<string, number>} */
const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = levels[config.logging?.level] || levels.info;
const isProduction = config.env === 'production';
const logFormat = config.logging?.format || (isProduction ? 'json' : 'pretty');

/**
 * Global correlation ID for the currently-executing request.
 * Set by the correlation-ID middleware in `server.js`.
 *
 * @type {string|null}
 */
let currentRequestId = null;

/**
 * Set the correlation ID for the current request context.
 *
 * @param {string} id UUID or similar unique identifier.
 */
export function setCorrelationId(id) {
  currentRequestId = id;
}

/**
 * Clear the correlation ID after the request finishes.
 */
export function clearCorrelationId() {
  currentRequestId = null;
}

/**
 * Format a log entry as a coloured string (pretty) or JSON.
 *
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} msg
 * @param {object} [meta]
 * @returns {string}
 */
function formatLogEntry(level, msg, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...(currentRequestId && { requestId: currentRequestId }),
    ...(meta && Object.keys(meta).length > 0 && { meta }),
  };

  if (logFormat === 'pretty') {
    const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    const ridStr = currentRequestId ? ` [${currentRequestId.slice(0, 8)}]` : '';
    const color = {
      debug: '\x1b[36m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    }[level] || '\x1b[0m';
    const reset = '\x1b[0m';
    return `${color}[${entry.timestamp}]${ridStr} ${level.toUpperCase()}:${reset} ${msg}${metaStr}`;
  }

  return JSON.stringify(entry);
}

/**
 * Write a log entry to stdout (debug/info) or stderr (warn/error).
 *
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} msg
 * @param {object} [meta]
 */
function log(level, msg, meta) {
  if (levels[level] < threshold) return;
  const formatted = formatLogEntry(level, msg, meta);
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(formatted + '\n');
}

/**
 * Public logger API.
 *
 * @namespace logger
 */
export const logger = {
  /** @param {string} m @param {object} [meta] */
  debug: (m, meta) => log('debug', m, meta),
  /** @param {string} m @param {object} [meta] */
  info: (m, meta) => log('info', m, meta),
  /** @param {string} m @param {object} [meta] */
  warn: (m, meta) => log('warn', m, meta),
  /** @param {string} m @param {object} [meta] */
  error: (m, meta) => log('error', m, meta),

  /**
   * Create a child logger that automatically includes `defaultMeta` in every
   * log call — useful for module-scoped logging.
   *
   * @param {object} defaultMeta Metadata to merge into every log entry.
   * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
   *
   * @example
   * const log = logger.child({ module: 'bookingService' });
   * log.info('Booking created', { bookingId: 1 });
   * // → { ..., meta: { module: 'bookingService', bookingId: 1 } }
   */
  child: (defaultMeta) => {
    const child = {};
    for (const method of ['debug', 'info', 'warn', 'error']) {
      child[method] = (m, meta) =>
        log(method, m, { ...defaultMeta, ...(meta || {}) });
    }
    return child;
  },
};
