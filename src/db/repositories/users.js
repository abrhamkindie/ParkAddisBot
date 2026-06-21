import { query } from '../index.js';

// Insert the user if new, otherwise refresh name/username. Returns the row.
export async function upsertUser({ telegramId, name, username }) {
  const { rows } = await query(
    `INSERT INTO users (telegram_id, name, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, users.name),
           username = COALESCE(EXCLUDED.username, users.username)
     RETURNING *`,
    [telegramId, name || null, username || null]
  );
  return rows[0];
}

export async function getByTelegramId(telegramId) {
  const { rows } = await query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return rows[0] || null;
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function setLanguage(telegramId, lang) {
  const { rows } = await query(
    'UPDATE users SET language_pref = $2 WHERE telegram_id = $1 RETURNING *',
    [telegramId, lang]
  );
  return rows[0];
}

export async function setRole(telegramId, role) {
  const { rows } = await query(
    `UPDATE users SET role = $2 WHERE telegram_id = $1 RETURNING *`,
    [telegramId, role]
  );
  return rows[0];
}
