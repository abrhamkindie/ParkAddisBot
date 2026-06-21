import { InlineKeyboard, InputFile } from 'grammy';
import * as bookingsRepo from '../../db/repositories/bookings.js';
import * as spotsRepo from '../../db/repositories/spots.js';
import { formatDateTime, formatMoney, currency } from '../../utils/format.js';
import { allTranslations } from '../../i18n/index.js';
import { checkinQrPng } from '../../utils/qr.js';
import { checkinLink } from '../../utils/deeplink.js';
import { logger } from '../../utils/logger.js';

const QR_STATUSES = new Set(['reserved', 'confirmed', 'active']);

// "My bookings" menu button → list recent bookings for this driver.
export function registerBookingsList(bot) {
  bot.hears(allTranslations('menu.my_bookings'), async (ctx) => {
    const t = ctx.t;
    const rows = await bookingsRepo.listByDriver(ctx.dbUser.id, 10);
    if (!rows.length) return ctx.reply(t('booking.none'));

    const items = rows.map((b) =>
      t('booking.list_item', {
        code: b.confirmation_code || '—',
        address: b.address || '—',
        start: formatDateTime(b.start_time),
        end: formatDateTime(b.end_time),
        status: t(`status.${b.status}`),
        total: formatMoney(b.total_price),
        currency,
      })
    );

    // One "Show QR" button per still-scannable booking.
    const kb = new InlineKeyboard();
    for (const b of rows) {
      if (QR_STATUSES.has(b.status) && b.checkin_token) {
        kb.text(`${t('booking.show_qr_button')} · ${b.confirmation_code || b.id}`, `booking:qr:${b.id}`).row();
      }
    }
    const hasButtons = kb.inline_keyboard.length > 0;

    await ctx.reply(items.join('\n\n'), hasButtons ? { reply_markup: kb } : undefined);
  });

  // Re-send a booking's QR (driver-only).
  bot.callbackQuery(/^booking:qr:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = Number(ctx.match[1]);
    const b = await bookingsRepo.getById(id);
    if (!b || String(b.driver_id) !== String(ctx.dbUser.id) || !b.checkin_token) {
      return ctx.reply(ctx.t('common.error_generic'));
    }
    try {
      const spot = await spotsRepo.getById(b.spot_id);
      const png = await checkinQrPng(checkinLink(b.checkin_token));
      await ctx.replyWithPhoto(new InputFile(png, 'checkin.png'), {
        caption: ctx.t('booking.qr_caption', {
          address: spot?.address || '—',
          start: formatDateTime(b.start_time),
          end: formatDateTime(b.end_time),
          total: formatMoney(b.total_price),
          currency,
          code: b.confirmation_code,
        }),
        parse_mode: 'Markdown',
      });
    } catch (err) {
      logger.warn('show qr failed', { error: err.message });
      await ctx.reply(ctx.t('common.error_generic'));
    }
  });
}
