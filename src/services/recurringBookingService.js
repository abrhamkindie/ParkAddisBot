import * as recurringRepo from '../db/repositories/recurringBookings.js';
import * as bookingsRepo from '../db/repositories/bookings.js';
import { logger } from '../utils/logger.js';
import { query } from '../db/index.js';

// Generate individual bookings from recurring patterns.
export async function generateRecurringBookings(bot) {
  const patterns = await recurringRepo.getPatternsNeedingGeneration();
  
  if (patterns.length === 0) {
    return 0;
  }

  let generated = 0;

  for (const pattern of patterns) {
    try {
      await generateBookingsForPattern(bot, pattern);
      await recurringRepo.updateLastGenerated(pattern.id);
      generated++;
    } catch (err) {
      logger.error('Failed to generate recurring bookings', {
        patternId: pattern.id,
        error: err.message,
      });
    }
  }

  logger.info('Generated recurring bookings', { count: generated });
  return generated;
}

// Generate bookings for a specific pattern.
async function generateBookingsForPattern(bot, pattern) {
  const { getTranslator } = await import('../i18n/index.js');
  const t = getTranslator('en'); // Will get user's language later

  // Calculate next booking date based on pattern
  const now = new Date();
  const nextDate = getNextBookingDate(pattern, now);

  if (!nextDate) return;

  // Check if booking already exists for this date
  const { rows: existing } = await query(
    `SELECT COUNT(*) FROM bookings
     WHERE driver_id = $1 AND spot_id = $2
       AND DATE(start_time) = $3
       AND status NOT IN ('cancelled')`,
    [pattern.driver_id, pattern.spot_id, nextDate]
  );

  if (parseInt(existing[0].count) > 0) {
    return; // Already booked
  }

  // Create the booking
  const startDateTime = new Date(nextDate);
  const startTime = pattern.start_time.split(':');
  startDateTime.setHours(parseInt(startTime[0]), parseInt(startTime[1]), 0);

  const endDateTime = new Date(startDateTime.getTime() + pattern.duration_hours * 3600 * 1000);

  try {
    const booking = await bookingsRepo.createBooking({
      driverId: pattern.driver_id,
      spotId: pattern.spot_id,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: 0, // Will be calculated during payment
      status: 'reserved',
    });

    // Notify driver
    const user = await (await import('../db/repositories/users.js')).getById(pattern.driver_id);
    if (user) {
      const ut = getTranslator(user.language_pref);
      await bot.api.sendMessage(Number(user.telegram_id), 
        ut('notification.recurring_booking_created', {
          address: (await (await import('../db/repositories/spots.js')).getById(pattern.spot_id)).address,
          date: startDateTime.toLocaleDateString(),
          time: startDateTime.toLocaleTimeString(),
          booking_code: booking.confirmation_code,
        })
      );
    }
  } catch (err) {
    logger.warn('Could not create recurring booking (possibly capacity conflict)', {
      patternId: pattern.id,
      date: nextDate,
      error: err.message,
    });
  }
}

// Calculate next booking date based on pattern.
function getNextBookingDate(pattern, from) {
  const nextDate = new Date(from);
  nextDate.setDate(nextDate.getDate() + 1); // Start from tomorrow

  switch (pattern.pattern) {
    case 'daily':
      // Every day, just return nextDate
      return nextDate;

    case 'weekly':
      // Find next occurrence of the specified day of week
      while (nextDate.getDay() !== pattern.day_of_week) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      return nextDate;

    case 'monthly':
      // Same day next month
      nextDate.setMonth(nextDate.getMonth() + 1);
      return nextDate;

    default:
      return null;
  }
}
