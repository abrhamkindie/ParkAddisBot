/**
 * Tests for bot error handling utilities.
 *
 * @module bot/utils/botError.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotError, BotErrorCode, botAsyncHandler, translateError } from './botError.js';

// Mock the logger so no actual logs are emitted during tests
vi.mock('../../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// --- BotError class ---

describe('BotError', () => {
  it('creates an error with the given code', () => {
    const err = new BotError(BotErrorCode.BOOKING_CAPACITY_FULL);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BotError');
    expect(err.code).toBe('BOOKING_CAPACITY_FULL');
    expect(err.message).toBe('BOOKING_CAPACITY_FULL');
  });

  it('accepts an optional developer message', () => {
    const err = new BotError(BotErrorCode.GENERIC, 'Something went wrong');
    expect(err.message).toBe('Something went wrong');
    expect(err.code).toBe('GENERIC');
  });

  it('preserves stack trace', () => {
    const err = new BotError(BotErrorCode.CHECKIN_NOT_FOUND);
    expect(err.stack).toBeDefined();
  });
});

// --- translateError ---

describe('translateError', () => {
  /** @type {import('../../i18n/index.js').Translator} */
  const t = vi.fn((key) => {
    const map = {
      'booking.conflict_full': 'Full capacity',
      'booking.spot_unavailable': 'Spot unavailable',
      'modification.invalid_status': 'Invalid booking status',
      'modification.slot_unavailable': 'Time slot not available',
      'modification.cannot_cancel': 'Cannot cancel this booking',
      'payment.already_paid': 'Already paid',
      'checkin.err_not_found': 'Check-in not found',
      'checkin.err_not_owner': 'Not the owner',
      'checkin.err_already': 'Already checked in',
      'checkin.err_invalid_state': 'Invalid booking state',
      'checkin.err_expired': 'Booking expired',
      'checkin.not_completable': 'Cannot complete',
      'rating.already_rated': 'Already rated',
      'rating.booking_not_completed': 'Booking not completed yet',
      'host.spot_gone': 'Spot not found',
      'host.not_your_spot': 'Not your spot',
      'common.error_generic': 'Something went wrong',
    };
    return map[key] || key;
  });

  it('translates booking CAPACITY_FULL code', () => {
    expect(translateError(t, 'BOOKING_CAPACITY_FULL')).toBe('Full capacity');
  });

  it('translates booking SPOT_UNAVAILABLE code', () => {
    expect(translateError(t, 'BOOKING_SPOT_UNAVAILABLE')).toBe('Spot unavailable');
  });

  it('translates checkin NOT_FOUND code', () => {
    expect(translateError(t, 'CHECKIN_NOT_FOUND')).toBe('Check-in not found');
  });

  it('translates checkin NOT_OWNER code', () => {
    expect(translateError(t, 'CHECKIN_NOT_OWNER')).toBe('Not the owner');
  });

  it('translates checkin ALREADY code', () => {
    expect(translateError(t, 'CHECKIN_ALREADY')).toBe('Already checked in');
  });

  it('translates rating codes', () => {
    expect(translateError(t, 'RATING_ALREADY_RATED')).toBe('Already rated');
    expect(translateError(t, 'RATING_BOOKING_NOT_COMPLETED')).toBe('Booking not completed yet');
  });

  it('translates host codes', () => {
    expect(translateError(t, 'HOST_SPOT_GONE')).toBe('Spot not found');
    expect(translateError(t, 'HOST_NOT_YOUR_SPOT')).toBe('Not your spot');
  });

  it('resolves service error codes via SERVICE_ERROR_MAP', () => {
    // Service code 'CAPACITY_FULL' should resolve to BotErrorCode.BOOKING_CAPACITY_FULL
    expect(translateError(t, 'CAPACITY_FULL')).toBe('Full capacity');
  });

  it('resolves checkin service codes', () => {
    expect(translateError(t, 'NOT_FOUND')).toBe('Check-in not found');
    expect(translateError(t, 'NOT_OWNER')).toBe('Not the owner');
    expect(translateError(t, 'ALREADY_CHECKED_IN')).toBe('Already checked in');
  });

  it('falls back to generic for unmapped BotErrorCode (PAYMENT_ALREADY_EXISTS is mapped but not handled in switch)', () => {
    expect(translateError(t, 'PAYMENT_ALREADY_EXISTS')).toBe('Something went wrong');
  });

  it('falls back to generic for unknown codes', () => {
    expect(translateError(t, 'UNKNOWN_CODE')).toBe('Something went wrong');
  });
});

// --- botAsyncHandler ---

describe('botAsyncHandler', () => {
  /** @type {import('grammy').Context} */
  let ctx;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = {
      from: { id: 12345 },
      update: { update_id: 1 },
      t: vi.fn((key) => {
        const map = {
          'booking.spot_unavailable': 'Spot unavailable',
          'common.error_generic': 'Something went wrong',
          'booking.conflict_full': 'Full capacity',
        };
        return map[key] || key;
      }),
      reply: vi.fn().mockResolvedValue(undefined),
      callbackQuery: null,
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('calls the wrapped function and resolves', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const wrapped = botAsyncHandler(fn);

    await wrapped(ctx);

    expect(fn).toHaveBeenCalledWith(ctx, undefined);
  });

  it('passes next to the wrapped function', async () => {
    const next = vi.fn();
    const fn = vi.fn().mockResolvedValue('ok');
    const wrapped = botAsyncHandler(fn);

    await wrapped(ctx, next);

    expect(fn).toHaveBeenCalledWith(ctx, next);
  });

  it('catches BotError and replies with localized message', async () => {
    const fn = vi.fn().mockRejectedValue(new BotError(BotErrorCode.BOOKING_SPOT_UNAVAILABLE));
    const wrapped = botAsyncHandler(fn);

    await wrapped(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Spot unavailable');
  });

  it('catches a plain Error (no code) and replies with generic message', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Database timeout'));
    const wrapped = botAsyncHandler(fn);

    await wrapped(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Something went wrong');
  });

  it('catches service error with .code property and maps to localized message', async () => {
    const serviceError = new Error('Full capacity');
    serviceError.code = 'CAPACITY_FULL'; // BookingError pattern
    const fn = vi.fn().mockRejectedValue(serviceError);
    const wrapped = botAsyncHandler(fn);

    await wrapped(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Full capacity');
  });

  it('catches service error with code in .message (payment pattern) and maps correctly', async () => {
    const paymentError = new Error('PAYMENT_ALREADY_EXISTS'); // PaymentService throws with code in message
    const fn = vi.fn().mockRejectedValue(paymentError);
    const wrapped = botAsyncHandler(fn);

    await wrapped(ctx);

    // PAYMENT_ALREADY_EXISTS is in SERVICE_ERROR_MAP but not in translateError switch → generic
    expect(ctx.reply).toHaveBeenCalledWith('Something went wrong');
  });

  it('uses answerCallbackQuery for callback query errors', async () => {
    ctx.callbackQuery = { data: 'test' };
    const fn = vi.fn().mockRejectedValue(new BotError(BotErrorCode.BOOKING_SPOT_UNAVAILABLE));
    const wrapped = botAsyncHandler(fn);

    await wrapped(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: 'Spot unavailable' });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('handles errors thrown during reply gracefully', async () => {
    ctx.reply = vi.fn().mockRejectedValue(new Error('Network error'));
    const fn = vi.fn().mockRejectedValue(new BotError(BotErrorCode.GENERIC));
    const wrapped = botAsyncHandler(fn);

    // Should not throw despite the reply failure
    await expect(wrapped(ctx)).resolves.toBeUndefined();
  });
});
