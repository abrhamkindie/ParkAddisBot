import { InlineKeyboard } from 'grammy';
import { checkIn, complete, CheckinError } from '../../services/checkinService.js';
import { triggerRatingPrompt } from './rating.js';
import { getTranslator } from '../../i18n/index.js';
import { formatDateTime, formatMoney, currency } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';

function errMessage(t, code) {
  switch (code) {
    case 'NOT_FOUND': return t('checkin.err_not_found');
    case 'NOT_OWNER': return t('checkin.err_not_owner');
    case 'ALREADY_CHECKED_IN': return t('checkin.err_already');
    case 'INVALID_STATE': return t('checkin.err_invalid_state');
    case 'EXPIRED': return t('checkin.err_expired');
    default: return t('common.error_generic');
  }
}

// Entry from start.js when the /start payload is checkin_<token>.
export async function handleCheckin(ctx, token) {
  const t = ctx.t;
  let booking;
  try {
    ({ booking } = await checkIn({
      scannerTelegramId: ctx.from.id,
      scannerRole: ctx.dbUser?.role,
      token,
    }));
  } catch (err) {
    if (err instanceof CheckinError) return ctx.reply(errMessage(t, err.code));
    logger.error('checkin failed', { error: err.message });
    return ctx.reply(t('common.error_generic'));
  }

  const kb = new InlineKeyboard().text(t('checkin.complete_button'), `checkin:complete:${booking.id}`);
  await ctx.reply(
    t('checkin.success_owner', {
      driver: booking.driver_name || '—',
      address: booking.address || '—',
      start: formatDateTime(booking.start_time),
      end: formatDateTime(booking.end_time),
      total: formatMoney(booking.total_price),
      currency,
    }),
    { reply_markup: kb }
  );

  // Notify the driver in their own language (best-effort).
  try {
    const dt = getTranslator(booking.driver_language_pref || 'en');
    await ctx.api.sendMessage(
      Number(booking.driver_telegram_id),
      dt('checkin.driver_notified', { address: booking.address || '—' })
    );
  } catch (err) {
    logger.warn('driver notify failed', { error: err.message });
  }
}

export function registerCheckin(bot) {
  bot.callbackQuery(/^checkin:complete:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const bookingId = Number(ctx.match[1]);
    try {
      await complete({
        bookingId,
        scannerTelegramId: ctx.from.id,
        scannerRole: ctx.dbUser?.role,
      });
      await ctx.reply(ctx.t('checkin.completed_owner'));

      // Trigger rating prompt to driver
      await triggerRatingPrompt(ctx, bookingId);
    } catch (err) {
      if (err instanceof CheckinError) {
        const msg = err.code === 'NOT_OWNER' ? ctx.t('checkin.err_not_owner') : ctx.t('checkin.not_completable');
        return ctx.reply(msg);
      }
      logger.error('complete failed', { error: err.message });
      return ctx.reply(ctx.t('common.error_generic'));
    }
  });
}
