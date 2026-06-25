import { InlineKeyboard, InputFile } from 'grammy';
import { initiatePayment, processManualPayment, sendPaymentReceipt, confirmChapaPayment } from '../../services/paymentService.js';
import { verifyPayment } from '../../services/chapaService.js';
import { getSession, setSession, clearSession } from '../session.js';
import * as bookingsRepo from '../../db/repositories/bookings.js';
import { formatMoney, currency, formatDateTime } from '../../utils/format.js';
import { checkinQrPng } from '../../utils/qr.js';
import { checkinLink } from '../../utils/deeplink.js';
import { logger } from '../../utils/logger.js';

// Show payment method selection for a booking.
export async function showPaymentOptions(ctx, bookingId) {
  const booking = await bookingsRepo.getById(bookingId);
  if (!booking) {
    return ctx.reply(ctx.t('common.error_generic'));
  }

  if (booking.payment_status === 'paid') {
    return ctx.reply(ctx.t('payment.already_paid'));
  }

  const kb = new InlineKeyboard()
    .text(ctx.t('payment.chapa_button'), `pay:chapa:${bookingId}`)
    .row()
    .text(ctx.t('payment.manual_button'), `pay:manual:${bookingId}`)
    .row()
    .text(ctx.t('common.cancel'), 'pay:cancel');

  await ctx.reply(ctx.t('payment.choose_method'), { reply_markup: kb });
}

// Initiate Chapa payment flow.
async function handleChapaPayment(ctx, bookingId) {
  try {
    const { payment, checkoutUrl } = await initiatePayment({
      bookingId,
      method: 'chapa',
      ctx,
    });

    // Store payment session
    setSession(ctx.from.id, {
      flow: 'payment',
      bookingId,
      paymentId: payment.id,
      txRef: payment.reference,
      method: 'chapa',
    });

    const kb = new InlineKeyboard()
      .url(ctx.t('payment.chapa_checkout_button'), checkoutUrl)
      .row()
      .text(ctx.t('payment.check_status'), `pay:check:${bookingId}`)
      .row()
      .text(ctx.t('common.cancel'), 'pay:cancel');

    await ctx.reply(
      `${ctx.t('payment.chapa_instructions')}\n\n` +
      `💰 ${formatMoney(payment.amount)} ${currency}`,
      { reply_markup: kb }
    );
  } catch (err) {
    logger.error('Chapa payment initiation failed', { error: err.message, bookingId });
    if (err.message === 'PAYMENT_ALREADY_EXISTS' || err.message === 'BOOKING_ALREADY_PAID') {
      return ctx.reply(ctx.t('payment.already_paid'));
    }
    await ctx.reply(ctx.t('common.error_generic'));
  }
}

// Initiate manual transfer payment flow.
async function handleManualPayment(ctx, bookingId) {
  try {
    const { payment } = await initiatePayment({
      bookingId,
      method: 'manual',
      ctx,
    });

    const booking = await bookingsRepo.getById(bookingId);

    // Store payment session
    setSession(ctx.from.id, {
      flow: 'payment',
      bookingId,
      paymentId: payment.id,
      method: 'manual',
      waitingForReceipt: true,
    });

    const instructions = ctx.t('payment.manual_instructions', {
      amount: formatMoney(payment.amount),
      currency,
      code: booking.confirmation_code,
    });

    const kb = new InlineKeyboard()
      .text(ctx.t('common.cancel'), 'pay:cancel');

    await ctx.reply(instructions, { reply_markup: kb });
    await ctx.reply(ctx.t('payment.waiting_receipt'));
  } catch (err) {
    logger.error('Manual payment initiation failed', { error: err.message, bookingId });
    if (err.message === 'PAYMENT_ALREADY_EXISTS' || err.message === 'BOOKING_ALREADY_PAID') {
      return ctx.reply(ctx.t('payment.already_paid'));
    }
    await ctx.reply(ctx.t('common.error_generic'));
  }
}

// Handle receipt photo upload for manual payment.
async function handleReceiptUpload(ctx) {
  const session = getSession(ctx.from.id);

  if (!session || session.flow !== 'payment' || session.method !== 'manual' || !session.waitingForReceipt) {
    return; // Not in manual payment flow
  }

  // Check if message has a photo
  if (!ctx.message?.photo) {
    await ctx.reply(ctx.t('payment.waiting_receipt'));
    return;
  }

  await ctx.reply(ctx.t('payment.received_receipt'));

  try {
    // Get the largest photo size
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;

    const { booking, payment } = await processManualPayment({
      bookingId: session.bookingId,
      screenshotFileId: fileId,
      reference: `manual_${Date.now()}`,
    });

    // Clear session
    clearSession(ctx.from.id);

    // Send receipt and QR
    await sendPaymentReceipt(ctx, booking, payment);
  } catch (err) {
    logger.error('Manual payment processing failed', { error: err.message, bookingId: session.bookingId });
    clearSession(ctx.from.id);
    await ctx.reply(ctx.t('common.error_generic'));
  }
}

// Check payment status (for Chapa payments - manual verification).
async function checkPaymentStatus(ctx, bookingId) {
  const session = getSession(ctx.from.id);
  
  if (!session || session.flow !== 'payment' || session.method !== 'chapa') {
    return ctx.reply(ctx.t('common.error_generic'));
  }

  try {
    const { booking, payment } = await confirmChapaPayment(session.txRef);
    
    // Clear session
    clearSession(ctx.from.id);

    // Send receipt and QR
    await sendPaymentReceipt(ctx, booking, payment);
  } catch (err) {
    if (err.message === 'PAYMENT_FAILED') {
      return ctx.reply(ctx.t('payment.payment_failed'));
    }
    // Payment not yet complete
    await ctx.reply(ctx.t('payment.verify_instructions'), {
      reply_markup: new InlineKeyboard()
        .text(ctx.t('payment.check_status'), `pay:check:${bookingId}`)
        .row()
        .text(ctx.t('common.cancel'), 'pay:cancel'),
    });
  }
}

// Cancel payment and booking.
async function cancelPayment(ctx, bookingId) {
  try {
    await bookingsRepo.updateStatus(bookingId, 'cancelled', {
      cancelledReason: 'Payment cancelled by user',
    });
    clearSession(ctx.from.id);
    await ctx.reply(ctx.t('payment.cancelled'));
  } catch (err) {
    logger.error('Payment cancellation failed', { error: err.message, bookingId });
    await ctx.reply(ctx.t('common.error_generic'));
  }
}

// Export main handler for photo uploads (called from bot middleware)
export { handleReceiptUpload };

// Register payment callbacks.
export function registerPayment(bot) {
  // Chapa payment
  bot.callbackQuery(/^pay:chapa:(\d+)$/, async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleChapaPayment(ctx, bookingId);
  });

  // Manual payment
  bot.callbackQuery(/^pay:manual:(\d+)$/, async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleManualPayment(ctx, bookingId);
  });

  // Check payment status
  bot.callbackQuery(/^pay:check:(\d+)$/, async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await checkPaymentStatus(ctx, bookingId);
  });

  // Cancel payment
  bot.callbackQuery('pay:cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    if (session && session.flow === 'payment' && session.bookingId) {
      await cancelPayment(ctx, session.bookingId);
    } else {
      await ctx.editMessageText(ctx.t('payment.cancelled')).catch(() => {});
    }
  });

  // Handle photo uploads for manual payment receipts
  bot.on('message:photo', async (ctx, next) => {
    await handleReceiptUpload(ctx);
    await next();
  });
}
