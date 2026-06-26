/**
 * @file Cron-based notification scheduler.
 *
 * Runs every 5 minutes and handles:
 * 1. Booking start reminders (30 min before)
 * 2. Payment expiry warnings (10 min after creation)
 * 3. Check-in prompts (at start time)
 * 4. Host upcoming-booking alerts (1 hour before)
 * 5. Auto-cancel expired unpaid bookings (15 min)
 *
 * The main {@link runNotificationChecks} function uses `Promise.allSettled` so
 * a failure in one notification type never blocks the others.
 *
 * @example
 * import { startScheduler, stopScheduler } from '../services/scheduler.js';
 * const task = startScheduler(bot);
 * // Later...
 * stopScheduler();
 */

import cron from 'node-cron';
import * as bookingsRepo from '../db/repositories/bookings.js';
import {
  sendBookingStartReminder,
  sendPaymentExpiryWarning,
  sendCheckinPrompt,
  sendHostUpcomingBooking,
  cancelExpiredUnpaidBooking,
} from './notificationService.js';
import { logger } from '../utils/logger.js';

/** @type {cron.ScheduledTask[]} */
let scheduledTasks = [];

/**
 * Main notification check — queries the database for bookings that need
 * attention and fires the appropriate notification functions.
 *
 * Uses `Promise.allSettled` so a failure in one channel never blocks others.
 *
 * @param {import('grammy').Bot} bot Telegram bot instance for sending messages.
 */
async function runNotificationChecks(bot) {
  logger.info('Running notification checks...');

  try {
    // 1. Send booking start reminders (30 min before)
    const startReminders = await bookingsRepo.getUpcomingForReminder(35);
    logger.info(`Found ${startReminders.length} bookings needing start reminder`);

    await Promise.allSettled(
      startReminders.map(async (booking) => {
        await sendBookingStartReminder(bot, booking);
        await bookingsRepo.markNotificationSent(booking.id, 'start_reminder');
      })
    );

    // 2. Send payment expiry warnings (10 min after creation if unpaid)
    const paymentWarnings = await bookingsRepo.getUnpaidForWarning(10);
    logger.info(`Found ${paymentWarnings.length} bookings needing payment warning`);

    await Promise.allSettled(
      paymentWarnings.map(async (booking) => {
        await sendPaymentExpiryWarning(bot, booking);
        await bookingsRepo.markNotificationSent(booking.id, 'payment_warning');
      })
    );

    // 3. Send check-in prompts (at start time)
    const checkinPrompts = await bookingsRepo.getActiveForCheckinPrompt();
    logger.info(`Found ${checkinPrompts.length} bookings needing check-in prompt`);

    await Promise.allSettled(
      checkinPrompts.map(async (booking) => {
        await sendCheckinPrompt(bot, booking);
        await bookingsRepo.markNotificationSent(booking.id, 'checkin_prompt');
      })
    );

    // 4. Send host upcoming booking alerts (1 hour before)
    const hostAlerts = await bookingsRepo.getUpcomingForHostAlert(65);
    logger.info(`Found ${hostAlerts.length} bookings needing host alert`);

    await Promise.allSettled(
      hostAlerts.map(async (booking) => {
        await sendHostUpcomingBooking(bot, booking);
        await bookingsRepo.markNotificationSent(booking.id, 'host_alert');
      })
    );

    // 5. Auto-cancel expired unpaid bookings (15 min after creation)
    const expiredBookings = await bookingsRepo.getExpiredUnpaidBookings(15);
    logger.info(`Found ${expiredBookings.length} expired unpaid bookings to cancel`);

    await Promise.allSettled(
      expiredBookings.map(async (booking) => {
        await cancelExpiredUnpaidBooking(bot, booking);
      })
    );

    logger.info('Notification checks completed');
  } catch (err) {
    logger.error('Notification check failed', { error: err.message });
  }
}

/**
 * Start the notification scheduler.
 *
 * Registers a cron job that runs `runNotificationChecks` every 5 minutes.
 * Also runs an initial check immediately on startup.
 *
 * @param {import('grammy').Bot} bot Telegram bot instance.
 * @returns {cron.ScheduledTask} The cron task (for optional external tracking).
 */
export function startScheduler(bot) {
  logger.info('Starting notification scheduler...');

  const task = cron.schedule('*/5 * * * *', () => {
    runNotificationChecks(bot);
  });

  scheduledTasks.push(task);

  // Run immediately on startup
  logger.info('Running initial notification check...');
  runNotificationChecks(bot);

  logger.info('Notification scheduler started (runs every 5 minutes)');
  return task;
}

/**
 * Stop all scheduled cron tasks.
 *
 * Call during graceful shutdown (e.g. in the SIGTERM handler).
 */
export function stopScheduler() {
  logger.info('Stopping notification scheduler...');

  scheduledTasks.forEach((task) => {
    task.stop();
  });

  scheduledTasks = [];
  logger.info('Notification scheduler stopped');
}
