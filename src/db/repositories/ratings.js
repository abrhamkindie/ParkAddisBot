import { query } from '../index.js';

// Create a new rating for a booking.
export async function createRating({ bookingId, driverId, spotId, hostId, score, comment }) {
  const { rows } = await query(
    `INSERT INTO ratings (booking_id, driver_id, spot_id, host_id, score, comment)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [bookingId, driverId, spotId, hostId, score, comment || null]
  );
  return rows[0];
}

// Get rating by booking ID (to check if already rated).
export async function getByBookingId(bookingId) {
  const { rows } = await query('SELECT * FROM ratings WHERE booking_id = $1', [bookingId]);
  return rows[0] || null;
}

// List ratings for a spot with pagination.
export async function listBySpot(spotId, limit = 10, offset = 0) {
  const { rows } = await query(
    `SELECT r.*, u.name AS driver_name
     FROM ratings r
     JOIN users u ON u.id = r.driver_id
     WHERE r.spot_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [spotId, limit, offset]
  );

  const { rows: count } = await query(
    'SELECT COUNT(*) FROM ratings WHERE spot_id = $1',
    [spotId]
  );

  return {
    ratings: rows,
    total: parseInt(count[0].count, 10),
  };
}

// List ratings for a host's spots with pagination.
export async function listByHost(hostId, limit = 10, offset = 0) {
  const { rows } = await query(
    `SELECT r.*, u.name AS driver_name, s.address
     FROM ratings r
     JOIN users u ON u.id = r.driver_id
     JOIN spots s ON s.id = r.spot_id
     WHERE s.owner_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [hostId, limit, offset]
  );

  const { rows: count } = await query(
    `SELECT COUNT(*) FROM ratings r
     JOIN spots s ON s.id = r.spot_id
     WHERE s.owner_id = $1`,
    [hostId]
  );

  return {
    ratings: rows,
    total: parseInt(count[0].count, 10),
  };
}

// Get rating statistics for a spot.
export async function getSpotRatingStats(spotId) {
  const { rows } = await query(
    `SELECT 
       COALESCE(AVG(score), 0) AS avg_score,
       COUNT(*) AS total_ratings,
       COUNT(*) FILTER (WHERE score = 5) AS five_star,
       COUNT(*) FILTER (WHERE score = 4) AS four_star,
       COUNT(*) FILTER (WHERE score = 3) AS three_star,
       COUNT(*) FILTER (WHERE score = 2) AS two_star,
       COUNT(*) FILTER (WHERE score = 1) AS one_star
     FROM ratings
     WHERE spot_id = $1`,
    [spotId]
  );
  return rows[0];
}

// Get rating by ID.
export async function getById(id) {
  const { rows } = await query(
    `SELECT r.*, u.name AS driver_name, s.address
     FROM ratings r
     JOIN users u ON u.id = r.driver_id
     JOIN spots s ON s.id = r.spot_id
     WHERE r.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Delete a rating (admin only).
export async function deleteById(id) {
  const { rows } = await query(
    'DELETE FROM ratings WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0] || null;
}
