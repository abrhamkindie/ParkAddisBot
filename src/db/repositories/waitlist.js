import { query } from '../index.js';

// Add user to waitlist for a spot.
export async function addToWaitlist({ userId, spotId, preferredStart, preferredDuration }) {
  const { rows } = await query(
    `INSERT INTO spot_waitlist (user_id, spot_id, preferred_start, preferred_duration)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [userId, spotId, preferredStart || null, preferredDuration || null]
  );
  return rows[0] || null;
}

// Remove user from waitlist.
export async function removeFromWaitlist(userId, spotId) {
  const { rows } = await query(
    `UPDATE spot_waitlist
     SET active = false
     WHERE user_id = $1 AND spot_id = $2 AND active = true
     RETURNING *`,
    [userId, spotId]
  );
  return rows[0] || null;
}

// Get active waitlist entries for a spot.
export async function getWaitlistForSpot(spotId) {
  const { rows } = await query(
    `SELECT w.*, u.telegram_id, u.language_pref
     FROM spot_waitlist w
     JOIN users u ON u.id = w.user_id
     WHERE w.spot_id = $1 AND w.active = true
       AND (w.expires_at IS NULL OR w.expires_at > now())
     ORDER BY w.created_at ASC`,
    [spotId]
  );
  return rows;
}

// Check if user is on waitlist for spot.
export async function isOnWaitlist(userId, spotId) {
  const { rows } = await query(
    `SELECT 1 FROM spot_waitlist
     WHERE user_id = $1 AND spot_id = $2 AND active = true
       AND (expires_at IS NULL OR expires_at > now())`,
    [userId, spotId]
  );
  return rows.length > 0;
}

// Mark waitlist entry as notified with expiration.
export async function markNotified(waitlistId, expiresMinutes = 15) {
  const { rows } = await query(
    `UPDATE spot_waitlist
     SET notified_at = now(), expires_at = now() + ($1 * interval '1 minute')
     WHERE id = $1
     RETURNING *`,
    [expiresMinutes, waitlistId]
  );
  return rows[0];
}

// Remove expired waitlist entries.
export async function removeExpired() {
  const { rowCount } = await query(
    `UPDATE spot_waitlist SET active = false
     WHERE active = true AND expires_at < now()`,
    []
  );
  return rowCount;
}

// Get user's active waitlist entries.
export async function getUserWaitlists(userId) {
  const { rows } = await query(
    `SELECT w.*, s.address
     FROM spot_waitlist w
     JOIN spots s ON s.id = w.spot_id
     WHERE w.user_id = $1 AND w.active = true
     ORDER BY w.created_at DESC`,
    [userId]
  );
  return rows;
}
