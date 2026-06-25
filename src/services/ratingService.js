import * as ratingsRepo from '../db/repositories/ratings.js';
import * as bookingsRepo from '../db/repositories/bookings.js';
import { query } from '../db/index.js';
import { logger } from '../utils/logger.js';

export class RatingError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // ALREADY_RATED | BOOKING_NOT_COMPLETED | INVALID_SCORE | BOOKING_NOT_FOUND
  }
}

// Submit a rating for a completed booking.
export async function submitRating({ bookingId, driverId, score, comment }) {
  // Validate score
  if (score < 1 || score > 5) {
    throw new RatingError('INVALID_SCORE');
  }

  // Get booking details
  const booking = await bookingsRepo.getByIdWithParties(bookingId);
  if (!booking) {
    throw new RatingError('BOOKING_NOT_FOUND');
  }

  // Verify the driver owns this booking
  if (booking.driver_id !== driverId) {
    throw new RatingError('BOOKING_NOT_FOUND');
  }

  // Check if booking is completed
  if (booking.status !== 'completed') {
    throw new RatingError('BOOKING_NOT_COMPLETED');
  }

  // Check if already rated
  const existingRating = await ratingsRepo.getByBookingId(bookingId);
  if (existingRating) {
    throw new RatingError('ALREADY_RATED');
  }

  // Create rating
  const rating = await ratingsRepo.createRating({
    bookingId,
    driverId,
    spotId: booking.spot_id,
    hostId: booking.owner_id,
    score,
    comment,
  });

  // Mark booking as rating_prompted
  await query(
    'UPDATE bookings SET rating_prompted = true WHERE id = $1',
    [bookingId]
  );

  // Recalculate spot rating
  await recalculateSpotRating(booking.spot_id);

  logger.info('Rating submitted', {
    bookingId,
    spotId: booking.spot_id,
    score,
    driverId,
  });

  return { rating, booking };
}

// Recalculate spot's average rating and count.
export async function recalculateSpotRating(spotId) {
  // Use the existing SQL function from migrations
  await query('SELECT recalc_spot_rating($1)', [spotId]);
}

// Find completed bookings for a driver that haven't been rated yet.
export async function getUnratedBookings(driverId, limit = 5) {
  const { rows } = await query(
    `SELECT b.*, s.address
     FROM bookings b
     JOIN spots s ON s.id = b.spot_id
     WHERE b.driver_id = $1
       AND b.status = 'completed'
       AND b.rating_prompted = false
     ORDER BY b.checked_out_at DESC
     LIMIT $2`,
    [driverId, limit]
  );
  return rows;
}

// Check if a booking can be rated.
export async function canRateBooking(bookingId, driverId) {
  const booking = await bookingsRepo.getById(bookingId);
  if (!booking || booking.driver_id !== driverId) {
    return false;
  }
  if (booking.status !== 'completed') {
    return false;
  }
  const existingRating = await ratingsRepo.getByBookingId(bookingId);
  if (existingRating) {
    return false;
  }
  return true;
}
