import * as spotsRepo from '../../db/repositories/spots.js';
import * as usersRepo from '../../db/repositories/users.js';
import { reserve, BookingError } from '../../services/bookingService.js';
import { calcTotal } from '../../services/pricing.js';
import {
  startTimeKeyboard,
  durationKeyboard,
  confirmBookingKeyboard,
} from '../keyboards.js';
import { formatDateTime, formatMoney, currency } from '../../utils/format.js';
import { InputFile } from 'grammy';
import { checkinQrPng } from '../../utils/qr.js';
import { checkinLink } from '../../utils/deeplink.js';
import { logger } from '../../utils/logger.js';

// Translate a BookingError code to a user-facing message.
function bookingErrorMessage(t, code) {
  switch (code) {
    case 'CAPACITY_FULL':
      return t('booking.conflict_full');
    case 'SPOT_UNAVAILABLE':
    case 'SPOT_NOT_FOUND':
      return t('booking.spot_unavailable');
    default:
      return t('common.error_generic');
  }
}

// Compute the start Date from an offset-in-minutes from "now".
function startFromOffset(offsetMin) {
  return new Date(Date.now() + Number(offsetMin) * 60 * 1000);
}

// Notify the host that their spot was just reserved.
async function notifyHost(ctx, spot, booking) {
  try {
    const host = await usersRepo.getById(spot.owner_id);
    if (!host) return;
    const ht = (await import('../../i18n/index.js')).getTranslator(host.language_pref);
    const text =
      `${ht('booking.host_notified_title')}\n\n` +
      ht('booking.host_notified_body', {
        address: spot.address || '—',
        code: booking.confirmation_code,
        start: formatDateTime(booking.start_time),
        end: formatDateTime(booking.end_time),
        driver: ctx.dbUser?.name || ctx.from.first_name || '—',
        total: formatMoney(booking.total_price),
        currency,
      });
    await ctx.api.sendMessage(Number(host.telegram_id), text);
  } catch (err) {
    // Host may have never started the bot; don't fail the booking over a notify.
    logger.warn('host notify failed', { error: err.message });
  }
}

// Begin the booking flow for a spot: shows the start-time choices. Shared by the
// `book:start:<id>` callback and the `start=book_<id>` deep link (from the map).
export async function beginBooking(ctx, spotId) {
  const spot = await spotsRepo.getById(spotId);
  if (!spot) return ctx.reply(ctx.t('booking.spot_unavailable'));
  await ctx.reply(ctx.t('booking.choose_start'), {
    reply_markup: startTimeKeyboard(ctx.t, spotId),
  });
}

export function registerBooking(bot) {
  // Step 1: choose start time.
  bot.callbackQuery(/^book:start:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginBooking(ctx, Number(ctx.match[1]));
  });

  // Back from the duration step → re-show the start-time choices (edit in place).
  bot.callbackQuery(/^book:to_start:(\d+)$/, async (ctx) => {
    const spotId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t('booking.choose_start'), {
      reply_markup: startTimeKeyboard(ctx.t, spotId),
    });
  });

  // Step 2: chose start offset → choose duration.
  bot.callbackQuery(/^book:start_at:(\d+):(\d+)$/, async (ctx) => {
    const spotId = Number(ctx.match[1]);
    const offset = Number(ctx.match[2]);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t('booking.choose_duration'), {
      reply_markup: durationKeyboard(ctx.t, spotId, offset),
    });
  });

  // Step 3: chose duration → show summary.
  bot.callbackQuery(/^book:dur:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const spotId = Number(ctx.match[1]);
    const offset = Number(ctx.match[2]);
    const hours = Number(ctx.match[3]);
    await ctx.answerCallbackQuery();

    const spot = await spotsRepo.getById(spotId);
    if (!spot) return ctx.reply(ctx.t('booking.spot_unavailable'));

    const start = startFromOffset(offset);
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    const total = calcTotal(spot.price_per_hour, hours);

    const summary =
      `${ctx.t('booking.summary_title')}\n\n` +
      ctx.t('booking.summary_body', {
        address: spot.address || '—',
        start: formatDateTime(start),
        end: formatDateTime(end),
        hours,
        total: formatMoney(total),
        currency,
      }) +
      `\n\n_${ctx.t('booking.confirm_pending_note')}_`;

    await ctx.editMessageText(summary, {
      parse_mode: 'Markdown',
      reply_markup: confirmBookingKeyboard(ctx.t, spotId, offset, hours),
    });
  });

  // Step 4: confirm → create the reservation atomically.
  bot.callbackQuery(/^book:confirm:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const spotId = Number(ctx.match[1]);
    const offset = Number(ctx.match[2]);
    const hours = Number(ctx.match[3]);
    await ctx.answerCallbackQuery();

    const start = startFromOffset(offset);

    try {
      const { booking, spot } = await reserve({
        driverId: ctx.dbUser.id,
        spotId,
        start,
        hours,
      });

      const text =
        `${ctx.t('booking.reserved_title')}\n\n` +
        ctx.t('booking.reserved_body', {
          code: booking.confirmation_code,
          address: spot.address || '—',
          start: formatDateTime(booking.start_time),
          end: formatDateTime(booking.end_time),
          total: formatMoney(booking.total_price),
          currency,
        });

      await ctx.editMessageText(text, { parse_mode: 'Markdown' });

      // Send the scannable QR for entrance check-in (best-effort).
      try {
        if (booking.checkin_token) {
          const png = await checkinQrPng(checkinLink(booking.checkin_token));
          await ctx.replyWithPhoto(new InputFile(png, 'checkin.png'), {
            caption: ctx.t('booking.qr_caption', {
              address: spot.address || '—',
              start: formatDateTime(booking.start_time),
              end: formatDateTime(booking.end_time),
              total: formatMoney(booking.total_price),
              currency,
              code: booking.confirmation_code,
            }),
            parse_mode: 'Markdown',
          });
        }
      } catch (err) {
        logger.warn('qr send failed', { error: err.message });
      }

      await notifyHost(ctx, spot, booking);
    } catch (err) {
      if (err instanceof BookingError) {
        return ctx.reply(bookingErrorMessage(ctx.t, err.code));
      }
      logger.error('booking confirm failed', { error: err.message });
      return ctx.reply(ctx.t('common.error_generic'));
    }
  });

  // Cancel at any booking step.
  bot.callbackQuery('book:cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t('booking.cancelled')).catch(() => {});
  });
}
