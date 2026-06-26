import * as paymentsRepo from '../db/repositories/payments.js';
import * as bookingsRepo from '../db/repositories/bookings.js';
import { query } from '../db/index.js';
import { initializePayment, verifyPayment } from './chapaService.js';
import { confirmPayment } from './bookingService.js';
import { calcSplit } from './pricing.js';
import { checkinQrPng } from '../utils/qr.js';
import { checkinLink } from '../utils/deeplink.js';
import { formatMoney, currency, formatDateTime } from '../utils/format.js';
import { InputFile } from 'grammy';
import { getTranslator } from '../i18n/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

// Initiate payment for a booking (Chapa or manual).
// Returns: { payment, checkoutUrl? }
export async function initiatePayment({ bookingId, method = 'chapa', ctx }) {
  // Check if payment already exists for this booking
  const existingPayment = await paymentsRepo.getByBookingId(bookingId);
  if (existingPayment) {
    throw new Error('PAYMENT_ALREADY_EXISTS');
  }

  const booking = await bookingsRepo.getByIdWithParties(bookingId);
  if (!booking) {
    throw new Error('BOOKING_NOT_FOUND');
  }

  if (booking.payment_status !== 'unpaid') {
    throw new Error('BOOKING_ALREADY_PAID');
  }

  // Calculate split (commission + host payout)
  const split = await calcSplit(booking.total_price);

  let payment;
  let checkoutUrl;

  if (method === 'chapa') {
    // Initialize Chapa payment
    const chapaResult = await initializePayment({
      amount: booking.total_price,
      currency: 'ETB',
      bookingId,
      customerEmail: ctx?.from?.username ? `${ctx.from.username}@gmail.com` : undefined,
      customerPhone: ctx?.dbUser?.phone,
      callbackUrl: `${config.publicUrl}/api/payments/chapa/webhook`,
      returnUrl: `${config.publicUrl}/payment/success`,
    });

    // Create payment record
    payment = await paymentsRepo.createPayment({
      bookingId,
      method: 'chapa',
      amount: split.total,
      commissionAmount: split.commission,
      hostPayoutAmount: split.hostPayout,
      status: 'pending',
      reference: chapaResult.tx_ref,
      checkoutUrl: chapaResult.checkout_url,
    });

    checkoutUrl = chapaResult.checkout_url;
  } else if (method === 'manual') {
    // Manual transfer - create payment in awaiting_review status
    payment = await paymentsRepo.createPayment({
      bookingId,
      method: 'manual',
      amount: split.total,
      commissionAmount: split.commission,
      hostPayoutAmount: split.hostPayout,
      status: 'awaiting_review',
      reference: `manual_${booking.confirmation_code}`,
    });
  } else {
    throw new Error('INVALID_PAYMENT_METHOD');
  }

  return { payment, checkoutUrl };
}

// Process successful Chapa payment (called from webhook or manual verification).
// Returns: { booking, payment }
export async function confirmChapaPayment(txRef) {
  const payment = await paymentsRepo.getByReference(txRef);
  if (!payment) {
    throw new Error('PAYMENT_NOT_FOUND');
  }

  if (payment.status === 'paid') {
    // Already processed (idempotent)
    const booking = await bookingsRepo.getByIdWithParties(payment.booking_id);
    return { booking, payment };
  }

  // Verify with Chapa
  const verification = await verifyPayment(txRef);

  if (verification.status !== 'success') {
    // Mark payment as failed
    await paymentsRepo.updateStatus(payment.id, 'failed', verification.data);
    await bookingsRepo.updateStatus(payment.booking_id, 'cancelled', {
      cancelledReason: 'Payment failed',
    });
    throw new Error('PAYMENT_FAILED');
  }

  // Update payment status
  const updatedPayment = await paymentsRepo.updateStatus(payment.id, 'paid', verification.data);
  if (!updatedPayment) {
    // Already processed by another request
    const booking = await bookingsRepo.getByIdWithParties(payment.booking_id);
    return { booking, payment: await paymentsRepo.getByBookingId(payment.booking_id) };
  }

  // Update booking payment status and confirm
  const booking = await confirmPayment(payment.booking_id);

  return { booking, payment: updatedPayment };
}

// Process manual transfer payment (auto-accept mode).
// Returns: { booking, payment }
export async function processManualPayment({ bookingId, screenshotFileId, reference }) {
  const payment = await paymentsRepo.getByBookingId(bookingId);
  if (!payment) {
    throw new Error('PAYMENT_NOT_FOUND');
  }

  if (payment.status === 'paid') {
    // Already processed
    const booking = await bookingsRepo.getByIdWithParties(bookingId);
    return { booking, payment };
  }

  // Update payment with screenshot and mark as paid (auto-accept)
  const raw = { screenshot_file_id: screenshotFileId, reference };
  const updatedPayment = await paymentsRepo.updateStatus(payment.id, 'paid', raw);

  if (!updatedPayment) {
    throw new Error('PAYMENT_ALREADY_PROCESSED');
  }

  // Also update the screenshot_file_id field
  await query(
    'UPDATE payments SET screenshot_file_id = $1 WHERE id = $2',
    [screenshotFileId, payment.id]
  );

  // Update booking payment status and confirm
  const booking = await confirmPayment(bookingId);

  return { booking, payment: updatedPayment };
}

// Send payment receipt with QR code to user.
export async function sendPaymentReceipt(ctx, booking, payment) {
  const t = getTranslator(ctx.dbUser?.language_pref || 'en');

  const methodLabel = payment.method === 'chapa' ? 'Chapa (Telebirr/CBE/Card)' : 'Manual Transfer';

  const receiptText =
    `${t('payment.success')}\n\n` +
    `🧾 ${t('payment.receipt_caption')}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💳 ${t('payment.method')}: ${methodLabel}\n` +
    `🔖 ${t('payment.reference')}: ${payment.reference}\n` +
    `💰 ${t('payment.amount')}: ${formatMoney(payment.amount)} ${currency}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `${t('booking.reserved_body', {
      code: booking.confirmation_code,
      address: booking.address || '—',
      start: formatDateTime(booking.start_time),
      end: formatDateTime(booking.end_time),
      total: formatMoney(booking.total_price),
      currency,
    })}\n\n` +
    `_${t('payment.qr_instruction')}_`;

  // Send receipt text
  await ctx.reply(receiptText, { parse_mode: 'Markdown' });

  // Send QR code for check-in
  if (booking.checkin_token) {
    try {
      const png = await checkinQrPng(checkinLink(booking.checkin_token));
      await ctx.replyWithPhoto(new InputFile(png, 'checkin.png'), {
        caption: t('booking.qr_caption', {
          address: booking.address || '—',
          start: formatDateTime(booking.start_time),
          end: formatDateTime(booking.end_time),
          total: formatMoney(booking.total_price),
          currency,
          code: booking.confirmation_code,
        }),
        parse_mode: 'Markdown',
      });
    } catch (err) {
      logger.warn('Failed to send QR code', { error: err.message });
    }
  }

  // Notify host about paid booking
  await notifyHostPayment(ctx, booking);
}

// Notify host that their booking has been paid.
async function notifyHostPayment(ctx, booking) {
  try {
    if (!booking.owner_telegram_id) return;

    const ht = getTranslator(booking.owner_language_pref || 'en');
    const text =
      `${ht('booking.host_notified_title')}\n\n` +
      ht('booking.host_notified_body', {
        address: booking.address || '—',
        code: booking.confirmation_code,
        start: formatDateTime(booking.start_time),
        end: formatDateTime(booking.end_time),
        driver: booking.driver_name || '—',
        total: formatMoney(booking.total_price),
        currency,
      }) +
      `\n\n✅ ${ht('payment.host_payment_confirmed')}`;

    await ctx.api.sendMessage(Number(booking.owner_telegram_id), text);
  } catch (err) {
    logger.warn('Host payment notification failed', { error: err.message });
  }
}
