import { query } from '../../index.js';

// List all bookings with pagination and filters.
export async function listAll({
  status,
  paymentStatus,
  dateFrom,
  dateTo,
  limit = 20,
  offset = 0,
} = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`b.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (paymentStatus) {
    conditions.push(`b.payment_status = $${paramIndex}`);
    params.push(paymentStatus);
    paramIndex++;
  }

  if (dateFrom) {
    conditions.push(`b.start_time >= $${paramIndex}`);
    params.push(dateFrom);
    paramIndex++;
  }

  if (dateTo) {
    conditions.push(`b.start_time <= $${paramIndex}`);
    params.push(dateTo);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: bookings } = await query(
    `SELECT b.*, s.address, s.owner_id,
            d.name AS driver_name, d.telegram_id AS driver_telegram_id
     FROM bookings b
     JOIN spots s ON s.id = b.spot_id
     JOIN users d ON d.id = b.driver_id
     ${whereClause}
     ORDER BY b.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const { rows: count } = await query(
    `SELECT COUNT(*) FROM bookings b ${whereClause}`,
    params
  );

  return {
    bookings,
    total: parseInt(count[0].count, 10),
  };
}

// Get booking details with parties and payment.
export async function getById(id) {
  const { rows } = await query(
    `SELECT b.*, s.address, s.owner_id,
            d.name AS driver_name, d.telegram_id AS driver_telegram_id,
            o.name AS owner_name, o.telegram_id AS owner_telegram_id,
            p.id AS payment_id, p.method AS payment_method, p.status AS payment_status,
            p.amount AS payment_amount, p.reference AS payment_reference
     FROM bookings b
     JOIN spots s ON s.id = b.spot_id
     JOIN users d ON d.id = b.driver_id
     JOIN users o ON o.id = s.owner_id
     LEFT JOIN payments p ON p.booking_id = b.id
     WHERE b.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Cancel booking with reason.
export async function cancel(id, reason) {
  const { rows } = await query(
    `UPDATE bookings SET status = 'cancelled', cancelled_reason = $2, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, reason]
  );
  return rows[0] || null;
}

// Mark payment as refunded.
export async function refundPayment(paymentId) {
  const { rows } = await query(
    `UPDATE payments SET status = 'refunded', updated_at = now()
     WHERE id = $1 RETURNING *`,
    [paymentId]
  );
  return rows[0] || null;
}

// List all payments with pagination.
export async function listPayments({ status, method, limit = 20, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`p.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (method) {
    conditions.push(`p.method = $${paramIndex}`);
    params.push(method);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: payments } = await query(
    `SELECT p.*, b.confirmation_code, s.address, d.name AS driver_name
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     JOIN spots s ON s.id = b.spot_id
     JOIN users d ON d.id = b.driver_id
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const { rows: count } = await query(
    `SELECT COUNT(*) FROM payments p ${whereClause}`,
    params
  );

  return {
    payments,
    total: parseInt(count[0].count, 10),
  };
}
