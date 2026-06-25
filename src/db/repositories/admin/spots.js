import { query } from '../../index.js';

// List all spots with pagination and optional status filter.
export async function listAll({ status, limit = 20, offset = 0 } = {}) {
  let whereClause = '';
  const params = [limit, offset];
  
  if (status) {
    whereClause = 'WHERE s.status = $3';
    params.push(status);
  }

  const { rows: spots } = await query(
    `SELECT s.*, u.name AS owner_name, u.telegram_id AS owner_telegram_id
     FROM spots s
     JOIN users u ON u.id = s.owner_id
     ${whereClause}
     ORDER BY s.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const { rows: count } = await query(
    `SELECT COUNT(*) FROM spots s ${status ? 'WHERE s.status = $1' : ''}`,
    status ? [status] : []
  );

  return {
    spots,
    total: parseInt(count[0].count, 10),
  };
}

// Get spot details with owner and booking count.
export async function getById(id) {
  const { rows } = await query(
    `SELECT s.*, u.name AS owner_name, u.telegram_id AS owner_telegram_id,
            (SELECT COUNT(*) FROM bookings WHERE spot_id = s.id) AS booking_count
     FROM spots s
     JOIN users u ON u.id = s.owner_id
     WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Approve a pending spot.
export async function approve(id) {
  const { rows } = await query(
    `UPDATE spots SET status = 'active', updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// Reject a spot with reason.
export async function reject(id, reason) {
  const { rows } = await query(
    `UPDATE spots SET status = 'rejected', updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// Suspend an active spot.
export async function suspend(id) {
  const { rows } = await query(
    `UPDATE spots SET status = 'suspended', updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// Reactivate a suspended/rejected spot.
export async function reactivate(id) {
  const { rows } = await query(
    `UPDATE spots SET status = 'active', updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// Update spot price (admin override).
export async function updatePrice(id, price) {
  const { rows } = await query(
    `UPDATE spots SET price_per_hour = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, price]
  );
  return rows[0] || null;
}
