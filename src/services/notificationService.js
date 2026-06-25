import * as bookingsRepo from '../db/repositories/bookings.js';
import { checkinQrPng } from '../utils/qr.js';
import { formatMoney, currency, formatDateTime } from '../utils/format.js';
import { getTranslator } from '../i18n/index.js';
import { logger } from '../utils/logger.js';
import { InputFile } from 'grammy';

// Send booking start reminder to driver (30 minutes before).
export async function sendBookingStartReminder(bot, booking) {
  try {
    const t = getTranslator(booking.driver_language_pref || 'en');
    const text = t('notification.booking_start_reminder', {
      address: booking.address || '—',
      start_time: formatDateTime(booking.start_time),
      code: booking.confirmation_code,
    });

    await bot.api.sendMessage(Number(booking.driver_telegram_id), text);
    logger.info('Start reminder sent', { bookingId: booking.id, driverId: booking.driver_id });
  } catch (err) {
    logger.error('Failed to send start reminder', {
      bookingId: booking.id,
      error: err.message,
    });
  }
}

// Send payment expiry warning to driver.
export async function sendPaymentExpiryWarning(bot, booking) {
  try {
    const t = getTranslator(booking.driver_language_pref || 'en');
    const text = t('notification.payment_expiry_warning', {
      code: booking.confirmation_code,
      amount: formatMoney(booking.total_price),
      currency,
    });

    await bot.api.sendMessage(Number(booking.driver_telegram_id), text);
    logger.info('Payment warning sent', { bookingId: booking.id, driverId: booking.driver_id });
  } catch (err) {
    logger.error('Failed to send payment warning', {
      bookingId: booking.id,
      error: err.message,
    });
  }
}

// Send check-in prompt with QR code to driver.
export async function sendCheckinPrompt(bot, booking) {
  try {
    const t = getTranslator(booking.driver_language_pref || 'en');
    const text = t('notification.checkin_prompt', {
      address: booking.address || '—',
    });

    // Generate QR code
    const qrBuffer = await checkinQrPng(booking.checkin_token);
    const qrFile = new InputFile(qrBuffer, 'checkin.png');

    await bot.api.sendPhoto(Number(booking.driver_telegram_id), qrFile, {
      caption: text,
    });

    logger.info('Check-in prompt sent', { bookingId: booking.id, driverId: booking.driver_id });
  } catch (err) {
    logger.error('Failed to send check-in prompt', {
      bookingId: booking.id,
      error: err.message,
    });
  }
}

// Send upcoming booking alert to host (1 hour before).
export async function sendHostUpcomingBooking(bot, booking) {
  try {
    const t = getTranslator(booking.owner_language_pref || 'en');
    const text = t('notification.host_upcoming_booking', {
      address: booking.address || '—',
      driver_name: booking.driver_name || '—',
      start_time: formatDateTime(booking.start_time),
      end_time: formatDateTime(booking.end_time),
      code: booking.confirmation_code,
    });

    await bot.api.sendMessage(Number(booking.owner_telegram_id), text);
    logger.info('Host alert sent', {
      bookingId: booking.id,
      hostId: booking.owner_id,
    });
  } catch (err) {
    logger.error('Failed to send host alert', {
      bookingId: booking.id,
      error: err.message,
    });
  }
}

// Cancel expired unpaid booking and notify both parties.
export async function cancelExpiredUnpaidBooking(bot, booking) {
  try {
    // Cancel the booking
    await bookingsRepo.updateStatus(booking.id, 'cancelled', {
      cancelledReason: 'payment_timeout',
    });

    // Notify driver
    const dt = getTranslator(booking.driver_language_pref || 'en');
    const driverText = dt('notification.booking_cancelled_timeout', {
      code: booking.confirmation_code,
    });

    try {
      await bot.api.sendMessage(Number(booking.driver_telegram_id), driverText);
    } catch (err) {
      logger.error('Failed to notify driver of cancellation', {
        bookingId: booking.id,
        error: err.message,
      });
    }

    // Notify host
    const ht = getTranslator(booking.owner_language_pref || 'en');
    const hostText = ht('notification.booking_cancelled_host', {
      code: booking.confirmation_code,
      address: booking.address || '—',
    });

    try {
      await bot.api.sendMessage(Number(booking.owner_telegram_id), hostText);
    } catch (err) {
      logger.error('Failed to notify host of cancellation', {
        bookingId: booking.id,
        error: err.message,
      });
    }

    logger.info('Booking auto-cancelled', {
      bookingId: booking.id,
      reason: 'payment_timeout',
    });
  } catch (err) {
    logger.error('Failed to cancel expired booking', {
      bookingId: booking.id,
      error: err.message,
    });
  }
}
