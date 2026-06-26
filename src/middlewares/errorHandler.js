/**
 * @file Global error-handling Express middleware.
 *
 * Three pieces work together:
 * 1. {@link asyncHandler} — wraps async route handlers so thrown errors are
 *    forwarded to `next()`.
 * 2. {@link errorHandler} — Express error middleware (4 args) that converts
 *    any error to a standard JSON envelope and logs it.
 * 3. {@link notFoundHandler} — catches requests to unknown routes (404).
 * 4. {@link setupProcessErrorHandlers} — catches `unhandledRejection` and
 *    `uncaughtException` at the process level.
 *
 * @example
 * import { errorHandler, notFoundHandler, asyncHandler } from '../middlewares/errorHandler.js';
 *
 * // Mount routes...
 * app.use(asyncHandler(async (req, res) => { ... }));
 *
 * // Then error handlers last:
 * app.use(notFoundHandler);
 * app.use(errorHandler);
 */

import { toAppError } from '../utils/errors.js';
import { error as sendError } from '../utils/apiResponse.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Express error-handling middleware (4 params — Express identifies it as an
 * error handler by the 4th parameter).
 *
 * - Converts legacy errors to {@link AppError} via `toAppError()`.
 * - Logs 5xx errors with full stack traces, 4xx at warn level.
 * - Returns a consistent JSON error envelope.
 * - Includes stack traces in non-production environments.
 *
 * **Must be registered LAST** in the middleware chain.
 *
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, req, res, _next) {
  const appErr = toAppError(err);

  const logMeta = {
    code: appErr.code,
    statusCode: appErr.statusCode,
    method: req.method,
    path: req.path,
    requestId: req.requestId,
    userId: req.admin?.id || req.dbUser?.id,
  };

  if (appErr.statusCode >= 500) {
    logger.error(appErr.message, { ...logMeta, stack: appErr.stack, meta: appErr.meta });
  } else {
    logger.warn(appErr.message, logMeta);
  }

  sendError(res, {
    code: appErr.code,
    statusCode: appErr.statusCode,
    message: appErr.message,
    details: appErr.details,
  });
}

/**
 * Wraps an async route handler so any thrown/rejected error is forwarded to
 * `next()` instead of causing an unhandled promise rejection.
 *
 * @param {Function} fn Async `(req, res, next) => Promise` handler.
 * @returns {import('express').RequestHandler}
 *
 * @example
 * app.get('/spots', asyncHandler(async (req, res) => {
 *   const spots = await Spot.findAll();
 *   res.json(spots);
 * }));
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 catch-all handler. Place this **after** all route definitions but
 * **before** the `errorHandler`.
 *
 * @type {import('express').RequestHandler}
 */
export function notFoundHandler(req, res) {
  sendError(res, {
    code: 'NOT_FOUND',
    statusCode: 404,
    message: `Route ${req.method} ${req.path} not found`,
  });
}

/**
 * Register process-level error handlers for `unhandledRejection` and
 * `uncaughtException`.
 *
 * Call once at startup — typically in `src/server.js` `createServer()`.
 */
export function setupProcessErrorHandlers() {
  process.on('unhandledRejection', (reason) => {
    logger.error('UNHANDLED REJECTION', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION', {
      message: err.message,
      stack: err.stack,
    });
    // Give logger time to flush, then crash
    setTimeout(() => process.exit(1), 1000);
  });
}
