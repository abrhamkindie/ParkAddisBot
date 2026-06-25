import { query } from '../index.js';

// Get price multiplier for a specific time (calls database function).
export async function getPriceMultiplier(spotId, timestamp) {
  const { rows } = await query(
    `SELECT get_price_multiplier($1, $2) as multiplier`,
    [spotId, timestamp]
  );
  return parseFloat(rows[0].multiplier);
}

// Get pricing rules for a spot.
export async function getRulesBySpotId(spotId) {
  const { rows } = await query(
    `SELECT * FROM pricing_rules
     WHERE spot_id = $1
     ORDER BY day_of_week NULLS LAST, start_hour NULLS LAST`,
    [spotId]
  );
  return rows;
}

// Create a new pricing rule.
export async function createRule({ spotId, dayOfWeek, startHour, endHour, multiplier, description }) {
  const { rows } = await query(
    `INSERT INTO pricing_rules (spot_id, day_of_week, start_hour, end_hour, price_multiplier, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [spotId, dayOfWeek || null, startHour || null, endHour || null, multiplier, description || null]
  );
  return rows[0];
}

// Update a pricing rule.
export async function updateRule(id, updates) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (updates.dayOfWeek !== undefined) {
    fields.push(`day_of_week = $${idx++}`);
    values.push(updates.dayOfWeek || null);
  }
  if (updates.startHour !== undefined) {
    fields.push(`start_hour = $${idx++}`);
    values.push(updates.startHour || null);
  }
  if (updates.endHour !== undefined) {
    fields.push(`end_hour = $${idx++}`);
    values.push(updates.endHour || null);
  }
  if (updates.multiplier !== undefined) {
    fields.push(`price_multiplier = $${idx++}`);
    values.push(updates.multiplier);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(updates.description);
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await query(
    `UPDATE pricing_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
}

// Delete a pricing rule.
export async function deleteRule(id) {
  const { rows } = await query(
    `DELETE FROM pricing_rules WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// Delete all rules for a spot.
export async function deleteRulesBySpotId(spotId) {
  const { rowCount } = await query(
    `DELETE FROM pricing_rules WHERE spot_id = $1`,
    [spotId]
  );
  return rowCount;
}
