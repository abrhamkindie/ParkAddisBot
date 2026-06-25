import { extendBooking, cancelBooking, BookingModificationError } from '../../services/bookingModificationService.js';
import * as bookingsRepo from '../../db/repositories/bookings.js';
import { formatMoney, currency } from '../../utils/format.js';

export function registerBookingModification(bot) {
  // Extend booking flow.
  bot.callbackQuery(/^booking:extend:(\d+)$/, async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();

    await ctx.editMessageText(ctx.t('modification.choose_hours'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `+1 ${ctx.t('modification.hour')}`, callback_data: `booking:extend:confirm:${bookingId}:1` },
            { text: `+2 ${ctx.t('modification.hours')}`, callback_data: `booking:extend:confirm:${bookingId}:2` },
          ],
          [
            { text: `+3 ${ctx.t('modification.hours')}`, callback_data: `booking:extend:confirm:${bookingId}:3` },
            { text: `+5 ${ctx.t('modification.hours')}`, callback_data: `booking:extend:confirm:${bookingId}:5` },
          ],
          [{ text: ctx.t('common.back'), callback_data: `booking:detail:${bookingId}` }],
        ],
      },
    });
  });

  // Confirm extension.
  bot.callbackQuery(/^booking:extend:confirm:(\d+):(\d+)$/, async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    const hours = Number(ctx.match[2]);
    await ctx.answerCallbackQuery();

    try {
      const result = await extendBooking(bookingId, hours);
      
      await ctx.editMessageText(
        ctx.t('modification.extended_success', {
          hours,
          new_end: new Date(result.booking.end_time).toLocaleString(),
          cost: formatMoney(result.additionalCost),
          currency,
        })
      );
    } catch (err) {
      await handleError(ctx, err.code);
    }
  });

  // Cancel booking flow.
  bot.callbackQuery(/^booking:cancel:(\d+)$/, async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();

    const booking = await bookingsRepo.getById(bookingId);
    if (!booking) return;

    // Show refund policy
    const hoursUntilStart = (new Date(booking.start_time) - Date.now()) / 3600000;
    let refundInfo = '';
    
    if (hoursUntilStart > 24) {
      refundInfo = ctx.t('modification.refund_full');
    } else if (hoursUntilStart > 2) {
      refundInfo = ctx.t('modification.refund_partial');
    } else {
      refundInfo = ctx.t('modification.refund_none');
    }

    await ctx.editMessageText(
      ctx.t('modification.cancel_confirm') + '\n\n' + refundInfo,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: ctx.t('modification.cancel_yes'), callback_data: `booking:cancel:confirm:${bookingId}` },
              { text: ctx.t('common.back'), callback_data: `booking:detail:${bookingId}` },
            ],
          ],
        },
      }
    );
  });

  // Confirm cancellation.
  bot.callbackQuery(/^booking:cancel:confirm:(\d+)$/, async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();

    try {
      const result = await cancelBooking(bookingId);
      
      let refundMsg = '';
      if (result.refundAmount > 0) {
        refundMsg = ctx.t('modification.refund_amount', {
          amount: formatMoney(result.refundAmount),
          percent: result.refundPercent,
          currency,
        });
      } else {
        refundMsg = ctx.t('modification.no_refund');
      }

      await ctx.editMessageText(
        ctx.t('modification.cancelled_success') + '\n\n' + refundMsg
      );

      // Notify waitlist if applicable
      const { notifyNextInWaitlist } = await import('../../services/waitlistService.js');
      await notifyNextInWaitlist(ctx.api, booking.spot_id, booking);
    } catch (err) {
      await handleError(ctx, err.code);
    }
  });
}

async function handleError(ctx, code) {
  const messages = {
    'BOOKING_NOT_FOUND': ctx.t('common.error_generic'),
    'INVALID_STATUS': ctx.t('modification.invalid_status'),
    'SLOT_UNAVAILABLE': ctx.t('modification.slot_unavailable'),
    'CANNOT_CANCEL': ctx.t('modification.cannot_cancel'),
  };
  
  await ctx.reply(messages[code] || ctx.t('common.error_generic'), { show_alert: true });
}
