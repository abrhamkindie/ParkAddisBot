import { query } from '../index.js';
import { config } from '../../config/index.js';

export async function get(key, fallback = null) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function set(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

// Commission percent: runtime setting, falling back to env default.
export async function getCommissionPercent() {
  const v = await get('commission_percent', null);
  const n = v == null ? config.business.defaultCommissionPercent : Number(v);
  return Number.isFinite(n) ? n : config.business.defaultCommissionPercent;
}
