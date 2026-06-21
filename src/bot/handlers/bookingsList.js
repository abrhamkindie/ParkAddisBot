import * as bookingsRepo from '../../db/repositories/bookings.js';
import { formatDateTime, formatMoney, currency } from '../../utils/format.js';
import { allTranslations } from '../../i18n/index.js';

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
    await ctx.reply(items.join('\n\n'));
  });
}
