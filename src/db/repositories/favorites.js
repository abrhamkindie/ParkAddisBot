import { query } from '../index.js';

// Add a spot to user's favorites.
export async function addFavorite(userId, spotId) {
  const { rows } = await query(
    `INSERT INTO favorite_spots (user_id, spot_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, spot_id) DO NOTHING
     RETURNING *`,
    [userId, spotId]
  );
  return rows[0] || null;
}

// Remove a spot from user's favorites.
export async function removeFavorite(userId, spotId) {
  const { rows } = await query(
    `DELETE FROM favorite_spots
     WHERE user_id = $1 AND spot_id = $2
     RETURNING *`,
    [userId, spotId]
  );
  return rows[0] || null;
}

// Get all favorite spots for a user.
export async function getUserFavorites(userId) {
  const { rows } = await query(
    `SELECT f.*, s.address, s.price_per_hour, s.rating_avg, s.rating_count
     FROM favorite_spots f
     JOIN spots s ON s.id = f.spot_id
     WHERE f.user_id = $1 AND s.status = 'active'
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return rows;
}

// Check if a spot is favorited by user.
export async function isFavorite(userId, spotId) {
  const { rows } = await query(
    `SELECT 1 FROM favorite_spots WHERE user_id = $1 AND spot_id = $2`,
    [userId, spotId]
  );
  return rows.length > 0;
}
