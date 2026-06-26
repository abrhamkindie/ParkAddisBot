/**
 * Payment flow handlers — Chapa and manual payment.
 *
 * @module bot/handlers/payment
 */

import { InlineKeyboard } from 'grammy';
import { initiatePayment, processManualPayment, sendPaymentReceipt, confirmChapaPayment } from '../../services/paymentService.js';
import { getSession, clearSession } from '../session.js';
import * as bookingsRepo from '../../db/repositories/bookings.js';
import { formatMoney, currency } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { BotError, BotErrorCode, botAsyncHandler } from '../utils/botError.js';
import { Flow, PaymentMethod, isInFlow, getFlowSession, clearFlowSession, setFlowSession } from '../utils/session.js';

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
  // Let user know we're processing
  await ctx.reply(ctx.t('common.loading'));

  try {
    const { payment, checkoutUrl } = await initiatePayment({
      bookingId,
      method: 'chapa',
      ctx,
    });

    // Store payment session
    setFlowSession(ctx.from.id, {
      flow: Flow.PAYMENT,
      bookingId,
      paymentId: payment.id,
      txRef: payment.reference,
      method: PaymentMethod.CHAPA,
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
    logger.error('Chapa payment initiation failed', {
      bookingId,
      error: err.message,
    });

    // Show visible error message — not just a toast
    await ctx.reply(`❌ *${ctx.t('payment.payment_failed')}*`, {
      parse_mode: 'Markdown',
    });
  }
}

// Initiate manual transfer payment flow.
async function handleManualPayment(ctx, bookingId) {
  const { payment } = await initiatePayment({
    bookingId,
    method: 'manual',
    ctx,
  });

  const booking = await bookingsRepo.getById(bookingId);

  // Store payment session
  setFlowSession(ctx.from.id, {
    flow: Flow.PAYMENT,
    bookingId,
    paymentId: payment.id,
    method: PaymentMethod.MANUAL,
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
}

// Handle receipt photo upload for manual payment.
async function handleReceiptUpload(ctx) {
  const session = getFlowSession(ctx.from.id);

  if (!isInFlow(session, Flow.PAYMENT) || session.method !== PaymentMethod.MANUAL || !session.waitingForReceipt) {
    return; // Not in manual payment flow
  }

  // Check if message has a photo
  if (!ctx.message?.photo) {
    await ctx.reply(ctx.t('payment.waiting_receipt'));
    return;
  }

  await ctx.reply(ctx.t('payment.received_receipt'));

  // Get the largest photo size
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileId = photo.file_id;

  const { booking, payment } = await processManualPayment({
    bookingId: session.bookingId,
    screenshotFileId: fileId,
    reference: `manual_${Date.now()}`,
  });

  // Clear session
  clearFlowSession(ctx.from.id);

  // Send receipt and QR
  await sendPaymentReceipt(ctx, booking, payment);
}

// Check payment status (for Chapa payments - manual verification).
async function checkPaymentStatus(ctx, bookingId) {
  const session = getFlowSession(ctx.from.id);

  if (!isInFlow(session, Flow.PAYMENT) || session.method !== PaymentMethod.CHAPA) {
    return ctx.reply(ctx.t('common.error_generic'));
  }

  const { booking, payment } = await confirmChapaPayment(session.txRef);

  // Clear session
  clearFlowSession(ctx.from.id);

  // Send receipt and QR
  await sendPaymentReceipt(ctx, booking, payment);
}

// Cancel payment and booking.
async function cancelPayment(ctx, bookingId) {
  await bookingsRepo.updateStatus(bookingId, 'cancelled', {
    cancelledReason: 'Payment cancelled by user',
  });
  clearFlowSession(ctx.from.id);
  await ctx.reply(ctx.t('payment.cancelled'));
}

// Export main handler for photo uploads (called from bot middleware)
export { handleReceiptUpload };

// Register payment callbacks.
export function registerPayment(bot) {
  // Chapa payment
  bot.callbackQuery(/^pay:chapa:(\d+)$/, botAsyncHandler(async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleChapaPayment(ctx, bookingId);
  }));

  // Manual payment
  bot.callbackQuery(/^pay:manual:(\d+)$/, botAsyncHandler(async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleManualPayment(ctx, bookingId);
  }));

  // Check payment status
  bot.callbackQuery(/^pay:check:(\d+)$/, botAsyncHandler(async (ctx) => {
    const bookingId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await checkPaymentStatus(ctx, bookingId);
  }));

  // Cancel payment
  bot.callbackQuery('pay:cancel', botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = getFlowSession(ctx.from.id);
    if (isInFlow(session, Flow.PAYMENT) && session.bookingId) {
      await cancelPayment(ctx, session.bookingId);
    } else {
      await ctx.editMessageText(ctx.t('payment.cancelled')).catch(() => {});
    }
  }));

  // Handle photo uploads for manual payment receipts
  bot.on('message:photo', async (ctx, next) => {
    await handleReceiptUpload(ctx);
    await next();
  });
}
