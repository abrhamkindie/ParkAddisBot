import * as bookingsRepo from '../db/repositories/bookings.js';

export class CheckinError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // NOT_FOUND | NOT_OWNER | ALREADY_CHECKED_IN | INVALID_STATE | EXPIRED | NOT_COMPLETABLE
  }
}

function authorize(booking, scannerTelegramId, scannerRole) {
  const isOwner = String(booking.owner_telegram_id) === String(scannerTelegramId);
  const isAdmin = scannerRole === 'admin';
  if (!isOwner && !isAdmin) throw new CheckinError('NOT_OWNER');
}

// Check a booking in by its QR token. Returns { booking } (with joined parties).
export async function checkIn({ scannerTelegramId, scannerRole, token }) {
  const booking = await bookingsRepo.getByCheckinToken(token);
  if (!booking) throw new CheckinError('NOT_FOUND');

  authorize(booking, scannerTelegramId, scannerRole);

  if (booking.status === 'active') throw new CheckinError('ALREADY_CHECKED_IN');
  if (!['reserved', 'confirmed'].includes(booking.status)) throw new CheckinError('INVALID_STATE');
  if (new Date(booking.end_time).getTime() < Date.now()) throw new CheckinError('EXPIRED');

  const updated = await bookingsRepo.markCheckedIn(booking.id);
  if (!updated) throw new CheckinError('ALREADY_CHECKED_IN'); // lost a concurrent race

  // Keep joined fields (address, driver_name, …) and overlay the new status/timestamp.
  return { booking: { ...booking, ...updated } };
}

// Mark an active booking complete (owner/admin only).
export async function complete({ bookingId, scannerTelegramId, scannerRole }) {
  const booking = await bookingsRepo.getByIdWithParties(bookingId);
  if (!booking) throw new CheckinError('NOT_FOUND');

  authorize(booking, scannerTelegramId, scannerRole);

  const updated = await bookingsRepo.markCompleted(bookingId);
  if (!updated) throw new CheckinError('NOT_COMPLETABLE');
  return updated;
}
