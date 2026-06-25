import * as bookingsRepo from '../db/repositories/bookings.js';
import * as paymentsRepo from '../db/repositories/payments.js';
import { query } from '../db/index.js';
import { calcTotal } from './pricing.js';
import { logger } from '../utils/logger.js';

export class BookingModificationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Extend a booking by adding more hours.
export async function extendBooking(bookingId, additionalHours) {
  const booking = await bookingsRepo.getByIdWithParties(bookingId);
  if (!booking) {
    throw new BookingModificationError('BOOKING_NOT_FOUND');
  }

  // Can only extend active or confirmed bookings
  if (!['reserved', 'confirmed', 'active'].includes(booking.status)) {
    throw new BookingModificationError('INVALID_STATUS');
  }

  // Calculate new end time
  const currentEnd = new Date(booking.end_time);
  const newEnd = new Date(currentEnd.getTime() + additionalHours * 3600 * 1000);

  // Check if spot has capacity for the extension
  const { rows: conflicts } = await query(
    `SELECT COUNT(*) FROM bookings
     WHERE spot_id = $1
       AND id != $2
       AND status NOT IN ('cancelled', 'completed')
       AND start_time < $3
       AND end_time > $4`,
    [booking.spot_id, bookingId, newEnd, currentEnd]
  );

  if (parseInt(conflicts[0].count) > 0) {
    throw new BookingModificationError('SLOT_UNAVAILABLE');
  }

  // Calculate additional cost
  const additionalCost = await calcTotal(booking.total_price / booking.hours, additionalHours);

  // Update booking
  const updated = await query(
    `UPDATE bookings SET end_time = $1, total_price = total_price + $2
     WHERE id = $3 RETURNING *`,
    [newEnd, additionalCost, bookingId]
  );

  logger.info('Booking extended', {
    bookingId,
    additionalHours,
    additionalCost,
    newEndTime: newEnd,
  });

  return {
    booking: updated.rows[0],
    additionalCost,
    newEndTime: newEnd,
  };
}

// Cancel a booking with refund logic.
export async function cancelBooking(bookingId, reason = 'user_request') {
  const booking = await bookingsRepo.getById(bookingId);
  if (!booking) {
    throw new BookingModificationError('BOOKING_NOT_FOUND');
  }

  // Can only cancel reserved/confirmed bookings
  if (!['reserved', 'confirmed'].includes(booking.status)) {
    throw new BookingModificationError('CANNOT_CANCEL');
  }

  // Calculate refund based on time until start
  const hoursUntilStart = (new Date(booking.start_time) - Date.now()) / 3600000;
  let refundPercent = 0;

  if (hoursUntilStart > 24) {
    refundPercent = 100; // Full refund
  } else if (hoursUntilStart > 2) {
    refundPercent = 50; // Partial refund
  } else {
    refundPercent = 0; // No refund (too close to start)
  }

  const refundAmount = booking.total_price * (refundPercent / 100);

  // Update booking status
  await bookingsRepo.updateStatus(bookingId, 'cancelled', { cancelledReason: reason });

  // Process refund if payment was made
  if (booking.payment_status === 'paid' && refundAmount > 0) {
    const payment = await paymentsRepo.getByBookingId(bookingId);
    if (payment) {
      await paymentsRepo.createRefund(payment.id, refundAmount, reason);
    }
  }

  logger.info('Booking cancelled', {
    bookingId,
    reason,
    refundPercent,
    refundAmount,
    hoursUntilStart,
  });

  return {
    booking: await bookingsRepo.getById(bookingId),
    refundAmount,
    refundPercent,
  };
}

// Modify booking start time (cancel old + create new).
export async function modifyBookingTime(bookingId, newStartTime, newHours) {
  const booking = await bookingsRepo.getByIdWithParties(bookingId);
  if (!booking) {
    throw new BookingModificationError('BOOKING_NOT_FOUND');
  }

  // Cancel the old booking
  await cancelBooking(bookingId, 'time_modified');

  // Create new booking (reuse reserve function)
  const { reserve } = await import('./bookingService.js');
  const result = await reserve({
    driverId: booking.driver_id,
    spotId: booking.spot_id,
    start: new Date(newStartTime),
    hours: newHours,
  });

  logger.info('Booking time modified', {
    oldBookingId: bookingId,
    newBookingId: result.booking.id,
    newStartTime,
  });

  return result;
}
