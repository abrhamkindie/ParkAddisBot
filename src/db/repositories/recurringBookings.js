import { query } from '../index.js';

// Create a new recurring booking pattern.
export async function createPattern({ driverId, spotId, pattern, dayOfWeek, startTime, durationHours }) {
  const { rows } = await query(
    `INSERT INTO recurring_bookings (driver_id, spot_id, pattern, day_of_week, start_time, duration_hours)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [driverId, spotId, pattern, dayOfWeek || null, startTime, durationHours]
  );
  return rows[0];
}

// Get active recurring patterns for a driver.
export async function getDriverPatterns(driverId) {
  const { rows } = await query(
    `SELECT rb.*, s.address, s.price_per_hour
     FROM recurring_bookings rb
     JOIN spots s ON s.id = rb.spot_id
     WHERE rb.driver_id = $1 AND rb.active = true
     ORDER BY rb.created_at DESC`,
    [driverId]
  );
  return rows;
}

// Get patterns that need booking generation (last generated > 7 days ago or never).
export async function getPatternsNeedingGeneration(daysAhead = 7) {
  const { rows } = await query(
    `SELECT * FROM recurring_bookings
     WHERE active = true
       AND (last_generated_date IS NULL OR last_generated_date < now() - interval '7 days')
     ORDER BY created_at ASC`,
    []
  );
  return rows;
}

// Update last generated date for a pattern.
export async function updateLastGenerated(id) {
  const { rows } = await query(
    `UPDATE recurring_bookings
     SET last_generated_date = now(), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return rows[0];
}

// Deactivate a recurring pattern.
export async function deactivatePattern(id, driverId) {
  const { rows } = await query(
    `UPDATE recurring_bookings
     SET active = false, updated_at = now()
     WHERE id = $1 AND driver_id = $2
     RETURNING *`,
    [id, driverId]
  );
  return rows[0] || null;
}

// Get a single pattern by ID.
export async function getById(id) {
  const { rows } = await query(
    `SELECT * FROM recurring_bookings WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}
