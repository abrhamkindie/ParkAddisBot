import { query } from '../../index.js';

// Get all host balances (from the host_balances view).
export async function getHostBalances() {
  const { rows } = await query(
    `SELECT hb.*, u.telegram_id AS owner_telegram_id
     FROM host_balances hb
     JOIN users u ON u.id = hb.host_id
     WHERE hb.balance > 0
     ORDER BY hb.balance DESC`
  );
  return rows;
}

// Create a payout record.
export async function createPayout({ hostId, amount, note, markedBy }) {
  const { rows } = await query(
    `INSERT INTO payouts (host_id, amount, note, marked_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [hostId, amount, note, markedBy]
  );
  return rows[0];
}

// Mark payout as sent.
export async function markPayoutSent(id) {
  const { rows } = await query(
    `UPDATE payouts SET status = 'sent', sent_at = now(), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// List disputes with pagination and status filter.
export async function listDisputes({ status, limit = 20, offset = 0 } = {}) {
  const whereClause = status ? 'WHERE d.status = $3' : '';
  const params = status ? [limit, offset, status] : [limit, offset];

  const { rows: disputes } = await query(
    `SELECT d.*, b.confirmation_code, s.address,
            u.name AS raised_by_name, u.telegram_id AS raised_by_telegram_id
     FROM disputes d
     JOIN bookings b ON b.id = d.booking_id
     JOIN spots s ON s.id = b.spot_id
     JOIN users u ON u.id = d.raised_by
     ${whereClause}
     ORDER BY d.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const { rows: count } = await query(
    `SELECT COUNT(*) FROM disputes d ${status ? 'WHERE d.status = $1' : ''}`,
    status ? [status] : []
  );

  return {
    disputes,
    total: parseInt(count[0].count, 10),
  };
}

// Get dispute details.
export async function getDisputeById(id) {
  const { rows } = await query(
    `SELECT d.*, b.*, s.address, u.name AS raised_by_name
     FROM disputes d
     JOIN bookings b ON b.id = d.booking_id
     JOIN spots s ON s.id = b.spot_id
     JOIN users u ON u.id = d.raised_by
     WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Resolve a dispute.
export async function resolveDispute(id, resolution, resolvedBy) {
  const { rows } = await query(
    `UPDATE disputes SET status = 'resolved', resolution = $2, resolved_by = $3, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, resolution, resolvedBy]
  );
  return rows[0] || null;
}

// Reject a dispute.
export async function rejectDispute(id, resolution, resolvedBy) {
  const { rows } = await query(
    `UPDATE disputes SET status = 'rejected', resolution = $2, resolved_by = $3, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, resolution, resolvedBy]
  );
  return rows[0] || null;
}
