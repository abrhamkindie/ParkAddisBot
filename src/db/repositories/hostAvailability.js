import { query } from '../index.js';

// Set availability for a specific date.
export async function setAvailability({ hostId, spotId, date, available, reason }) {
  const { rows } = await query(
    `INSERT INTO host_availability (host_id, spot_id, date, available, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (spot_id, date) DO UPDATE
     SET available = $4, reason = $5
     RETURNING *`,
    [hostId, spotId, date, available, reason || null]
  );
  return rows[0];
}

// Check if spot is available on a date.
export async function isAvailable(spotId, date) {
  const { rows } = await query(
    `SELECT available FROM host_availability
     WHERE spot_id = $1 AND date = $2`,
    [spotId, date]
  );
  
  // If no record exists, assume available (default)
  if (rows.length === 0) return true;
  return rows[0].available;
}

// Get availability for a date range.
export async function getAvailabilityRange(spotId, startDate, endDate) {
  const { rows } = await query(
    `SELECT * FROM host_availability
     WHERE spot_id = $1 AND date BETWEEN $2 AND $3
     ORDER BY date ASC`,
    [spotId, startDate, endDate]
  );
  return rows;
}

// Get all availability settings for a host's spot.
export async function getHostSpotAvailability(hostId, spotId) {
  const { rows } = await query(
    `SELECT * FROM host_availability
     WHERE host_id = $1 AND spot_id = $2
     ORDER BY date DESC`,
    [hostId, spotId]
  );
  return rows;
}

// Delete availability record.
export async function deleteAvailability(id, hostId) {
  const { rows } = await query(
    `DELETE FROM host_availability WHERE id = $1 AND host_id = $2 RETURNING *`,
    [id, hostId]
  );
  return rows[0] || null;
}
