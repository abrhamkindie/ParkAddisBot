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
