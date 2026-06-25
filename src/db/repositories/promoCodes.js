import { query } from '../index.js';

// Create a new promo code.
export async function createPromoCode({ code, discountType, discountValue, maxUses, minBookingAmount, validFrom, validUntil }) {
  const { rows } = await query(
    `INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, min_booking_amount, valid_from, valid_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [code.toUpperCase(), discountType, discountValue, maxUses || null, minBookingAmount || null, validFrom || null, validUntil || null]
  );
  return rows[0];
}

// Get promo code by code string.
export async function getByCode(code) {
  const { rows } = await query(
    `SELECT * FROM promo_codes WHERE code = $1 AND active = true`,
    [code.toUpperCase()]
  );
  return rows[0] || null;
}

// Validate promo code and check if it can be used.
export async function validatePromoCode(code, bookingAmount) {
  const promo = await getByCode(code);
  
  if (!promo) {
    return { valid: false, error: 'INVALID_CODE' };
  }

  // Check validity period
  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    return { valid: false, error: 'NOT_YET_ACTIVE' };
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    return { valid: false, error: 'EXPIRED' };
  }

  // Check usage limit
  if (promo.max_uses && promo.used_count >= promo.max_uses) {
    return { valid: false, error: 'MAX_USES_REACHED' };
  }

  // Check minimum booking amount
  if (promo.min_booking_amount && bookingAmount < promo.min_booking_amount) {
    return { valid: false, error: 'MINIMUM_NOT_MET' };
  }

  return { valid: true, promo };
}

// Increment usage count.
export async function incrementUsage(id) {
  const { rows } = await query(
    `UPDATE promo_codes SET used_count = used_count + 1, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return rows[0];
}

// List all promo codes (for admin).
export async function listAll(limit = 50, offset = 0) {
  const { rows } = await query(
    `SELECT * FROM promo_codes
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

// Update promo code.
export async function updatePromoCode(id, updates) {
  const fields = [];
  const values = [];
  let idx = 1;

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${idx++}`);
      values.push(updates[key]);
    }
  });

  if (fields.length === 0) return null;

  fields.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await query(
    `UPDATE promo_codes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
}

// Deactivate promo code.
export async function deactivatePromoCode(id) {
  const { rows } = await query(
    `UPDATE promo_codes SET active = false, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return rows[0] || null;
}
