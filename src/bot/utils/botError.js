/**
 * Bot-specific error handling utilities.
 *
 * Provides:
 * - `BotError` — extends `AppError` for Telegram handler errors
 * - `botAsyncHandler` — wraps async bot handlers so unhandled rejections are
 *   caught and logged instead of crashing the poller
 * - `translateError` — maps error codes to localized user messages
 *
 * @module bot/utils/botError
 */

import { logger } from '../../utils/logger.js';

/**
 * Error codes used by bot handlers, keyed by domain.
 * @readonly
 * @enum {string}
 */
export const BotErrorCode = {
  // Booking
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  BOOKING_INVALID_STATUS: 'BOOKING_INVALID_STATUS',
  BOOKING_SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  BOOKING_CANNOT_CANCEL: 'BOOKING_CANNOT_CANCEL',
  BOOKING_CAPACITY_FULL: 'BOOKING_CAPACITY_FULL',
  BOOKING_SPOT_UNAVAILABLE: 'BOOKING_SPOT_UNAVAILABLE',
  BOOKING_SPOT_NOT_FOUND: 'BOOKING_SPOT_NOT_FOUND',
  BOOKING_ALREADY_PAID: 'BOOKING_ALREADY_PAID',

  // Checkin
  CHECKIN_NOT_FOUND: 'CHECKIN_NOT_FOUND',
  CHECKIN_NOT_OWNER: 'CHECKIN_NOT_OWNER',
  CHECKIN_ALREADY: 'CHECKIN_ALREADY',
  CHECKIN_INVALID_STATE: 'CHECKIN_INVALID_STATE',
  CHECKIN_EXPIRED: 'CHECKIN_EXPIRED',
  CHECKIN_NOT_COMPLETABLE: 'CHECKIN_NOT_COMPLETABLE',

  // Payment
  PAYMENT_ALREADY_EXISTS: 'PAYMENT_ALREADY_EXISTS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',

  // Rating
  RATING_ALREADY_RATED: 'RATING_ALREADY_RATED',
  RATING_BOOKING_NOT_COMPLETED: 'RATING_BOOKING_NOT_COMPLETED',
  RATING_INVALID_SCORE: 'RATING_INVALID_SCORE',

  // Host
  HOST_SPOT_GONE: 'HOST_SPOT_GONE',
  HOST_NOT_YOUR_SPOT: 'HOST_NOT_YOUR_SPOT',

  // Generic
  GENERIC: 'GENERIC',
};

/**
 * Maps service error codes (from BookingError, CheckinError, etc.) to
 * canonical {@link BotErrorCode} values.
 * @type {Object<string, string>}
 */
const SERVICE_ERROR_MAP = {
  // BookingService.BookingError
  CAPACITY_FULL: BotErrorCode.BOOKING_CAPACITY_FULL,
  SPOT_UNAVAILABLE: BotErrorCode.BOOKING_SPOT_UNAVAILABLE,
  SPOT_NOT_FOUND: BotErrorCode.BOOKING_SPOT_NOT_FOUND,

  // CheckinService.CheckinError
  NOT_FOUND: BotErrorCode.CHECKIN_NOT_FOUND,
  NOT_OWNER: BotErrorCode.CHECKIN_NOT_OWNER,
  ALREADY_CHECKED_IN: BotErrorCode.CHECKIN_ALREADY,
  INVALID_STATE: BotErrorCode.CHECKIN_INVALID_STATE,
  EXPIRED: BotErrorCode.CHECKIN_EXPIRED,
  NOT_COMPLETABLE: BotErrorCode.CHECKIN_NOT_COMPLETABLE,

  // RatingService.RatingError
  ALREADY_RATED: BotErrorCode.RATING_ALREADY_RATED,
  BOOKING_NOT_COMPLETED: BotErrorCode.RATING_BOOKING_NOT_COMPLETED,
  INVALID_SCORE: BotErrorCode.RATING_INVALID_SCORE,

  // BookingModificationService.BookingModificationError
  BOOKING_NOT_FOUND: BotErrorCode.BOOKING_NOT_FOUND,
  INVALID_STATUS: BotErrorCode.BOOKING_INVALID_STATUS,
  SLOT_UNAVAILABLE: BotErrorCode.BOOKING_SLOT_UNAVAILABLE,
  CANNOT_CANCEL: BotErrorCode.BOOKING_CANNOT_CANCEL,

  // PaymentService
  PAYMENT_ALREADY_EXISTS: BotErrorCode.PAYMENT_ALREADY_EXISTS,
  PAYMENT_FAILED: BotErrorCode.PAYMENT_FAILED,
  BOOKING_ALREADY_PAID: BotErrorCode.BOOKING_ALREADY_PAID,
};

/**
 * Bot-scoped application error.
 * Carries a machine-readable `code` that can be mapped to a localized message
 * via {@link translateError}.
 */
export class BotError extends Error {
  /**
   * @param {string} code - Machine-readable error code (from {@link BotErrorCode})
   * @param {string} [message] - Optional developer-facing message; falls back to code
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'BotError';
    /** @type {string} */
    this.code = code;
  }
}

/**
 * Resolves any error with a `.code` property (BotError or service error) to a
 * canonical {@link BotErrorCode}.
 *
 * @param {Error} err - The caught error
 * @returns {string} Resolved BotErrorCode (falls back to {@link BotErrorCode.GENERIC})
 */
function resolveCode(err) {
  if (err instanceof BotError) return err.code;
  // Some services set the code in .code, others in .message (e.g. payment service)
  if (err.code && SERVICE_ERROR_MAP[err.code]) return SERVICE_ERROR_MAP[err.code];
  if (err.message && SERVICE_ERROR_MAP[err.message]) return SERVICE_ERROR_MAP[err.message];
  return BotErrorCode.GENERIC;
}

/**
 * Maps a code (BotErrorCode or service error code) to a localized user message.
 *
 * @param {import('../../i18n/index.js').Translator} t - The locale-bound translator
 * @param {string} code - The error code (will be resolved via {@link resolveCode} if needed)
 * @returns {string} Localized error message
 */
export function translateError(t, code) {
  // Resolve service error codes to BotErrorCode if needed
  const resolved = SERVICE_ERROR_MAP[code] || code;

  switch (resolved) {
    // Booking
    case BotErrorCode.BOOKING_CAPACITY_FULL:
      return t('booking.conflict_full');
    case BotErrorCode.BOOKING_SPOT_UNAVAILABLE:
    case BotErrorCode.BOOKING_SPOT_NOT_FOUND:
      return t('booking.spot_unavailable');
    case BotErrorCode.BOOKING_INVALID_STATUS:
      return t('modification.invalid_status');
    case BotErrorCode.BOOKING_SLOT_UNAVAILABLE:
      return t('modification.slot_unavailable');
    case BotErrorCode.BOOKING_CANNOT_CANCEL:
      return t('modification.cannot_cancel');
    case BotErrorCode.BOOKING_ALREADY_PAID:
      return t('payment.already_paid');

    // Checkin
    case BotErrorCode.CHECKIN_NOT_FOUND:
      return t('checkin.err_not_found');
    case BotErrorCode.CHECKIN_NOT_OWNER:
      return t('checkin.err_not_owner');
    case BotErrorCode.CHECKIN_ALREADY:
      return t('checkin.err_already');
    case BotErrorCode.CHECKIN_INVALID_STATE:
      return t('checkin.err_invalid_state');
    case BotErrorCode.CHECKIN_EXPIRED:
      return t('checkin.err_expired');
    case BotErrorCode.CHECKIN_NOT_COMPLETABLE:
      return t('checkin.not_completable');

    // Rating
    case BotErrorCode.RATING_ALREADY_RATED:
      return t('rating.already_rated');
    case BotErrorCode.RATING_BOOKING_NOT_COMPLETED:
      return t('rating.booking_not_completed');

    // Host
    case BotErrorCode.HOST_SPOT_GONE:
      return t('host.spot_gone');
    case BotErrorCode.HOST_NOT_YOUR_SPOT:
      return t('host.not_your_spot');

    // Generic fallback
    default:
      return t('common.error_generic');
  }
}

/**
 * Wraps an async bot handler so rejected promises are caught and logged instead
 * of crashing the polling loop. Mirrors `asyncHandler` from the API middleware.
 *
 * Handles:
 * - {@link BotError} — user receives the localized message
 * - Service errors (BookingError, CheckinError, RatingError,
 *   BookingModificationError) — codes are auto-mapped via {@link SERVICE_ERROR_MAP}
 *   and the user receives the correct localized message
 * - All other errors — logged, user receives a generic failure message
 *
 * @param {function(import('grammy').Context, Function): Promise<void>} fn - Async handler
 * @returns {function(import('grammy').Context, Function): Promise<void>}
 *
 * @example
 * bot.command('start', botAsyncHandler(async (ctx) => {
 *   await ctx.reply('Hello!');
 * }));
 */
export function botAsyncHandler(fn) {
  return async (ctx, next) => {
    try {
      await fn(ctx, next);
    } catch (err) {
      const code = resolveCode(err);
      const message = translateError(ctx.t, code);

      logger.error('bot handler error', {
        code,
        error: err.message,
        from: ctx.from?.id,
        update_id: ctx.update?.update_id,
      });

      try {
        if (ctx.callbackQuery) {
          await ctx.answerCallbackQuery({ text: message }).catch(() => {});
        } else {
          await ctx.reply(message).catch(() => {});
        }
      } catch {
        // Swallow reply failures — the update is already broken
      }
    }
  };
}
