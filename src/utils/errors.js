/**
 * @file Unified error hierarchy for ParkAddis.
 *
 * All API errors extend {@link AppError} which carries a machine-readable
 * `code`, an HTTP `statusCode`, a human-readable `message`, optional debug
 * `meta`, and an `isOperational` flag that distinguishes expected errors
 * from programmer bugs.
 *
 * Usage:
 * ```js
 * throw new NotFoundError('Spot not found');
 * throw new ValidationError('Invalid email', [
 *   { field: 'email', message: 'Must be a valid email' },
 * ]);
 * throw new AppError('PAYMENT_FAILED', 402, 'Payment declined', { txRef: 'abc' });
 * ```
 */

/**
 * Base application error. All custom errors should extend this class.
 *
 * @augments Error
 */
export class AppError extends Error {
  /**
   * @param {string}  code       Machine-readable error code (e.g. `'NOT_FOUND'`).
   * @param {number}  [statusCode=500] HTTP status code.
   * @param {string}  [message='Internal Server Error'] Human-readable description.
   * @param {object}  [meta]      Extra debug context (never sent to client responses).
   */
  constructor(code, statusCode = 500, message = 'Internal Server Error', meta) {
    super(message);
    this.name = 'AppError';
    /** @type {string} */
    this.code = code;
    /** @type {number} */
    this.statusCode = statusCode;
    /** @type {object|undefined} */
    this.meta = meta;
    /** @type {boolean} */
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── 4xx Client Errors ─────────────────────────────────────────────────────

/** Request is malformed — 400. @augments AppError */
export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', meta) {
    super('BAD_REQUEST', 400, message, meta);
    this.name = 'BadRequestError';
  }
}

/** Authentication required or failed — 401. @augments AppError */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', meta) {
    super('UNAUTHORIZED', 401, message, meta);
    this.name = 'UnauthorizedError';
  }
}

/** Authenticated but not permitted — 403. @augments AppError */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', meta) {
    super('FORBIDDEN', 403, message, meta);
    this.name = 'ForbiddenError';
  }
}

/** Resource does not exist — 404. @augments AppError */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', meta) {
    super('NOT_FOUND', 404, message, meta);
    this.name = 'NotFoundError';
  }
}

/** Resource conflict (duplicate, race) — 409. @augments AppError */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', meta) {
    super('CONFLICT', 409, message, meta);
    this.name = 'ConflictError';
  }
}

/**
 * Request failed schema validation — 422.
 *
 * Carries field-level `details` so the client can pinpoint which inputs
 * are invalid.
 *
 * @augments AppError
 */
export class ValidationError extends AppError {
  /**
   * @param {string}  message
   * @param {Array<{field:string, message:string}>} [details] Per-field errors.
   * @param {object}  [meta]
   */
  constructor(message = 'Validation failed', details, meta) {
    super('VALIDATION_ERROR', 422, message, { ...meta, details });
    this.name = 'ValidationError';
    /** @type {Array<{field:string, message:string}>|undefined} */
    this.details = details;
  }
}

/** Rate limit exceeded — 429. @augments AppError */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', meta) {
    super('RATE_LIMIT_EXCEEDED', 429, message, meta);
    this.name = 'RateLimitError';
  }
}

// ── 5xx Server Errors ─────────────────────────────────────────────────────

/** Unexpected server failure — 500. @augments AppError */
export class InternalError extends AppError {
  constructor(message = 'Internal Server Error', meta) {
    super('INTERNAL_ERROR', 500, message, meta);
    this.name = 'InternalError';
  }
}

/** Service temporarily unavailable — 503. @augments AppError */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', meta) {
    super('SERVICE_UNAVAILABLE', 503, message, meta);
    this.name = 'ServiceUnavailableError';
  }
}

// ── Domain-specific errors (map legacy errors to AppError) ─────────────────

/**
 * Map of legacy error code → [statusCode, message].
 *
 * @type {Object<string, [number, string]>}
 */
const LEGACY_ERROR_MAP = {
  // Generic
  NOT_FOUND: [404, 'Resource not found'],

  // Auth
  INVALID_CREDENTIALS: [401, 'Invalid email or password'],
  TOKEN_EXPIRED: [401, 'Token has expired, please login again'],
  INVALID_TOKEN: [401, 'Invalid token'],

  // Booking
  SPOT_NOT_FOUND: [404, 'Spot not found'],
  SPOT_UNAVAILABLE: [409, 'This spot is no longer available'],
  CAPACITY_FULL: [409, 'Spot is fully booked for this time'],
  BOOKING_NOT_FOUND: [404, 'Booking not found'],
  BOOKING_ALREADY_PAID: [409, 'Booking has already been paid'],
  PAYMENT_ALREADY_EXISTS: [409, 'Payment already exists'],
  PAYMENT_NOT_FOUND: [404, 'Payment not found'],
  PAYMENT_FAILED: [402, 'Payment failed'],
  PAYMENT_ALREADY_PROCESSED: [409, 'Payment already processed'],

  // Checkin (CheckinError uses code 'NOT_FOUND', caught by generic entry above)
  NOT_OWNER: [403, 'Only the spot owner can perform this action'],
  ALREADY_CHECKED_IN: [409, 'Already checked in'],
  INVALID_STATE: [409, 'Booking is in an invalid state'],
  EXPIRED: [410, 'Booking has expired'],
  NOT_COMPLETABLE: [409, 'Booking cannot be completed'],

  // Rating
  ALREADY_RATED: [409, 'Already rated'],
  BOOKING_NOT_COMPLETED: [409, 'Can only rate completed bookings'],
  INVALID_SCORE: [422, 'Score must be between 1 and 5'],

  // Modification
  BOOKING_MOD_NOT_FOUND: [404, 'Booking not found'],
  INVALID_STATUS: [409, 'Booking cannot be modified in its current status'],
  SLOT_UNAVAILABLE: [409, 'Time slot is no longer available'],
  CANNOT_CANCEL: [409, 'Booking cannot be cancelled'],
};

/**
 * Convert a legacy domain error (e.g. `BookingError`, `CheckinError`) to an
 * {@link AppError} so the global error handler can reply consistently.
 *
 * {@link NotFoundError} (which also uses code `'NOT_FOUND'`) never reaches
 * this function because it extends {@link AppError} and is returned early.
 *
 * @param {Error} err Any error, possibly with a `.code` property.
 * @returns {AppError} A mapped or wrapped `AppError` instance.
 */
export function toAppError(err) {
  if (err instanceof AppError) return err;

  const code = err.code || err.message;
  const mapped = LEGACY_ERROR_MAP[code];
  if (mapped) {
    const [statusCode, message] = mapped;
    return new AppError(code, statusCode, message, { originalMessage: err.message });
  }

  return new InternalError('Internal Server Error', { originalMessage: err.message });
}
