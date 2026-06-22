import { query } from '../index.js';

// Nearby active+available spots via the PostGIS function. radiusM in metres.
export async function findNearby({ lat, lng, radiusM, limit }) {
  const { rows } = await query(
    'SELECT * FROM find_nearby_spots($1, $2, $3, $4)',
    [lat, lng, radiusM, limit]
  );
  return rows;
}

// Nearest active+available spots IGNORING the radius. Dev convenience so a
// search always shows something (with the real distance) even when you're far
// from the seed data, instead of a bare "nothing found".
export async function findNearestAny({ lat, lng, limit }) {
  const { rows } = await query(
    `SELECT s.id, s.owner_id, s.address, s.price_per_hour, s.capacity,
            s.covered, s.guarded, s.ev_charging, s.rating_avg, s.rating_count,
            ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lng,
            ST_Distance(s.geom, ST_MakePoint($2, $1)::geography) AS distance_m
       FROM spots s
      WHERE s.status = 'active' AND s.is_available = true
      ORDER BY distance_m ASC, s.price_per_hour ASC
      LIMIT $3`,
    [lat, lng, limit]
  );
  return rows;
}

// Create a host's spot. geom is built from lng/lat; photos holds the optional
// Telegram file_id. Spots go live immediately (status 'active'). Returns the row
// with lat/lng projected out.
export async function create({
  ownerId,
  lat,
  lng,
  address,
  pricePerHour,
  capacity = 1,
  covered = false,
  guarded = false,
  evCharging = false,
  photoFileId = null,
  status = 'active',
}) {
  const photos = photoFileId ? [photoFileId] : [];
  const { rows } = await query(
    `INSERT INTO spots
       (owner_id, geom, address, price_per_hour, capacity,
        covered, guarded, ev_charging, photos, status, is_available)
     VALUES ($1, ST_MakePoint($3, $2)::geography, $4, $5, $6,
             $7, $8, $9, $10, $11, true)
     RETURNING *, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng`,
    [ownerId, lat, lng, address, pricePerHour, capacity, covered, guarded, evCharging, photos, status]
  );
  return rows[0];
}

// Update a spot's hourly price (owner-scoped). Returns the row or null.
export async function updatePrice(id, ownerId, pricePerHour) {
  const { rows } = await query(
    `UPDATE spots SET price_per_hour = $3
     WHERE id = $1 AND owner_id = $2 RETURNING *`,
    [id, ownerId, pricePerHour]
  );
  return rows[0] || null;
}

// Delete a spot (owner-scoped). Returns the deleted row or null.
export async function remove(id, ownerId) {
  const { rows } = await query(
    `DELETE FROM spots WHERE id = $1 AND owner_id = $2 RETURNING *`,
    [id, ownerId]
  );
  return rows[0] || null;
}

export async function getById(id) {
  const { rows } = await query(
    `SELECT s.*,
            ST_Y(s.geom::geometry) AS lat,
            ST_X(s.geom::geometry) AS lng
     FROM spots s WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function listByOwner(ownerId) {
  const { rows } = await query(
    `SELECT s.*, ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lng
     FROM spots s WHERE s.owner_id = $1 ORDER BY created_at DESC`,
    [ownerId]
  );
  return rows;
}

export async function setAvailability(spotId, ownerId, isAvailable) {
  const { rows } = await query(
    `UPDATE spots SET is_available = $3
     WHERE id = $1 AND owner_id = $2 RETURNING *`,
    [spotId, ownerId, isAvailable]
  );
  return rows[0] || null;
}
