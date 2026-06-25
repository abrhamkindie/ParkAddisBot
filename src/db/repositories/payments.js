import { query } from '../index.js';

// Create a new payment record linked to a booking.
export async function createPayment({
  bookingId,
  method,
  amount,
  commissionAmount,
  hostPayoutAmount,
  status = 'pending',
  reference = null,
  checkoutUrl = null,
}) {
  const { rows } = await query(
    `INSERT INTO payments (booking_id, method, amount, commission_amount, host_payout_amount, status, reference, checkout_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [bookingId, method, amount, commissionAmount, hostPayoutAmount, status, reference, checkoutUrl]
  );
  return rows[0];
}

// Fetch payment by ID.
export async function getById(id) {
  const { rows } = await query('SELECT * FROM payments WHERE id = $1', [id]);
  return rows[0] || null;
}

// Fetch payment for a specific booking.
export async function getByBookingId(bookingId) {
  const { rows } = await query('SELECT * FROM payments WHERE booking_id = $1', [bookingId]);
  return rows[0] || null;
}

// Fetch payment by Chapa transaction reference (for webhook lookup).
export async function getByReference(reference) {
  const { rows } = await query('SELECT * FROM payments WHERE reference = $1', [reference]);
  return rows[0] || null;
}

// Atomically update payment status with optional raw payload storage.
// Only transitions from pending/awaiting_review to paid/failed (idempotent).
export async function updateStatus(id, status, raw = null) {
  const { rows } = await query(
    `UPDATE payments
     SET status = $2,
         raw = COALESCE($3, raw),
         updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'awaiting_review')
     RETURNING *`,
    [id, status, raw ? JSON.stringify(raw) : null]
  );
  return rows[0] || null;
}

// List all paid payments for a host's spots (for payout calculations).
export async function listByHost(hostId, limit = 50) {
  const { rows } = await query(
    `SELECT p.*, b.start_time, b.end_time
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     JOIN spots s ON s.id = b.spot_id
     WHERE s.owner_id = $1
       AND p.status = 'paid'
     ORDER BY p.created_at DESC
     LIMIT $2`,
    [hostId, limit]
  );
  return rows;
}

// Create a refund record for a payment.
export async function createRefund(paymentId, amount, reason = '') {
  const { rows } = await query(
    `INSERT INTO refunds (payment_id, amount, reason)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [paymentId, amount, reason]
  );
  return rows[0];
}
