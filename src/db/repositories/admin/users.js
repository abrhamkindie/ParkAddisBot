import { query } from '../../index.js';

// List all users with pagination and filters.
export async function listAll({ role, isBanned, limit = 20, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (role) {
    conditions.push(`role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }

  if (isBanned !== undefined) {
    conditions.push(`is_banned = $${paramIndex}`);
    params.push(isBanned);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: users } = await query(
    `SELECT id, telegram_id, name, username, phone, role, language_pref, is_banned, ban_reason, created_at
     FROM users
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const { rows: count } = await query(
    `SELECT COUNT(*) FROM users ${whereClause}`,
    params
  );

  return {
    users,
    total: parseInt(count[0].count, 10),
  };
}

// Get user details with booking statistics.
export async function getById(id) {
  const { rows } = await query(
    `SELECT u.*,
            (SELECT COUNT(*) FROM bookings WHERE driver_id = u.id) AS total_bookings,
            (SELECT COUNT(*) FROM bookings WHERE driver_id = u.id AND status = 'completed') AS completed_bookings
     FROM users u
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Ban a user.
export async function ban(id, reason) {
  const { rows } = await query(
    `UPDATE users SET is_banned = true, ban_reason = $2, updated_at = now()
     WHERE id = $1 RETURNING id, telegram_id, name, is_banned, ban_reason`,
    [id, reason]
  );
  return rows[0] || null;
}

// Unban a user.
export async function unban(id) {
  const { rows } = await query(
    `UPDATE users SET is_banned = false, ban_reason = NULL, updated_at = now()
     WHERE id = $1 RETURNING id, telegram_id, name, is_banned, ban_reason`,
    [id]
  );
  return rows[0] || null;
}

// Change user role.
export async function setRole(id, role) {
  const { rows } = await query(
    `UPDATE users SET role = $2, updated_at = now() WHERE id = $1
     RETURNING id, telegram_id, name, role`,
    [id, role]
  );
  return rows[0] || null;
}
