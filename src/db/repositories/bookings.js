import { query } from '../index.js';

// Atomic booking creation via the create_booking SQL function (row lock +
// capacity-aware overlap check). Throws Postgres errors whose .message is one
// of: SPOT_NOT_FOUND, SPOT_UNAVAILABLE, CAPACITY_FULL.
export async function createBooking({
  driverId,
  spotId,
  start,
  end,
  totalPrice,
  confirmationCode,
  status = 'reserved',
}) {
  const { rows } = await query(
    `SELECT create_booking($1, $2, $3, $4, $5, $6, $7::booking_status) AS id`,
    [driverId, spotId, start, end, totalPrice, confirmationCode, status]
  );
  return rows[0].id;
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM bookings WHERE id = $1', [id]);
  return rows[0] || null;
}

// Bookings for a driver with the spot address joined in.
export async function listByDriver(driverId, limit = 10) {
  const { rows } = await query(
    `SELECT b.*, s.address
     FROM bookings b JOIN spots s ON s.id = b.spot_id
     WHERE b.driver_id = $1
     ORDER BY b.start_time DESC
     LIMIT $2`,
    [driverId, limit]
  );
  return rows;
}

export async function updateStatus(id, status, extra = {}) {
  const { rows } = await query(
    `UPDATE bookings SET status = $2,
            cancelled_reason = COALESCE($3, cancelled_reason)
     WHERE id = $1 RETURNING *`,
    [id, status, extra.cancelledReason || null]
  );
  return rows[0] || null;
}

// Shared SELECT that joins a booking with its spot, driver, and owner.
const PARTIES_SELECT = `
  SELECT b.*, s.address, s.owner_id,
         d.name        AS driver_name,
         d.telegram_id AS driver_telegram_id,
         d.language_pref AS driver_language_pref,
         o.telegram_id AS owner_telegram_id,
         o.language_pref AS owner_language_pref,
         o.role        AS owner_role
  FROM bookings b
  JOIN spots s ON s.id = b.spot_id
  JOIN users d ON d.id = b.driver_id
  JOIN users o ON o.id = s.owner_id`;

// Store the QR secret on a booking.
export async function attachCheckinToken(id, token) {
  const { rows } = await query(
    `UPDATE bookings SET checkin_token = $2 WHERE id = $1 RETURNING *`,
    [id, token]
  );
  return rows[0] || null;
}

// Booking (with parties) by its QR token, or null.
export async function getByCheckinToken(token) {
  const { rows } = await query(`${PARTIES_SELECT} WHERE b.checkin_token = $1`, [token]);
  return rows[0] || null;
}

// Booking (with parties) by id, or null.
export async function getByIdWithParties(id) {
  const { rows } = await query(`${PARTIES_SELECT} WHERE b.id = $1`, [id]);
  return rows[0] || null;
}

// Atomic check-in: only succeeds from a pre-check-in state. Returns the updated
// row, or null if it wasn't in a check-in-able state (lost race / already done).
export async function markCheckedIn(id) {
  const { rows } = await query(
    `UPDATE bookings SET status = 'active', checked_in_at = now()
     WHERE id = $1 AND status IN ('reserved','confirmed') RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// Atomic completion: only from 'active'. Returns updated row or null.
export async function markCompleted(id) {
  const { rows } = await query(
    `UPDATE bookings SET status = 'completed', checked_out_at = now()
     WHERE id = $1 AND status = 'active' RETURNING *`,
    [id]
  );
  return rows[0] || null;
}
