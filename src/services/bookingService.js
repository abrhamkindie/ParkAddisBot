import * as bookingsRepo from '../db/repositories/bookings.js';
import * as spotsRepo from '../db/repositories/spots.js';
import { calcTotal } from './pricing.js';
import { generateConfirmationCode, generateCheckinToken } from '../utils/code.js';
import { logger } from '../utils/logger.js';
import { query } from '../db/index.js';

export class BookingError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // SPOT_NOT_FOUND | SPOT_UNAVAILABLE | CAPACITY_FULL
  }
}

const KNOWN_CODES = ['SPOT_NOT_FOUND', 'SPOT_UNAVAILABLE', 'CAPACITY_FULL'];

// Reserve a spot for [start, start+hours). Returns { booking, spot }.
// Throws BookingError on conflict/unavailability.
export async function reserve({ driverId, spotId, start, hours, paymentStatus = 'unpaid' }) {
  const spot = await spotsRepo.getById(spotId);
  if (!spot) throw new BookingError('SPOT_NOT_FOUND');

  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + hours * 60 * 60 * 1000);
  const total = calcTotal(spot.price_per_hour, hours);
  const code = generateConfirmationCode();

  let bookingId;
  try {
    bookingId = await bookingsRepo.createBooking({
      driverId,
      spotId,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      totalPrice: total,
      confirmationCode: code,
      status: 'reserved',
      paymentStatus,
    });
  } catch (err) {
    const code = KNOWN_CODES.find((c) => err.message.includes(c));
    if (code) throw new BookingError(code);
    throw err;
  }

  const booking = await bookingsRepo.getById(bookingId);
  return { booking, spot };
}

// Confirm payment for a booking: updates payment_status and generates checkin token.
// Returns booking with parties (for notification).
export async function confirmPayment(bookingId) {
  // Update payment status to paid
  await query(
    `UPDATE bookings SET payment_status = 'paid' WHERE id = $1`,
    [bookingId]
  );

  // Generate and attach checkin token
  const checkinToken = generateCheckinToken();
  await bookingsRepo.attachCheckinToken(bookingId, checkinToken);

  // Update booking status to confirmed
  await bookingsRepo.updateStatus(bookingId, 'confirmed');

  // Return full booking with parties
  const booking = await bookingsRepo.getByIdWithParties(bookingId);
  if (!booking) {
    throw new Error('Booking not found after payment confirmation');
  }

  logger.info('Payment confirmed for booking', { bookingId, confirmationCode: booking.confirmation_code });

  return booking;
}
