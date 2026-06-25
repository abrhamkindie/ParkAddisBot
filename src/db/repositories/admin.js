import { query } from '../index.js';

// Get admin user by email.
export async function getByEmail(email) {
  const { rows } = await query('SELECT * FROM admin_users WHERE email = $1 AND is_active = true', [email]);
  return rows[0] || null;
}

// Get admin user by ID.
export async function getById(id) {
  const { rows } = await query('SELECT id, email, name, role, is_active, created_at FROM admin_users WHERE id = $1', [id]);
  return rows[0] || null;
}

// Create a new admin user (for bootstrapping).
export async function createAdmin({ email, passwordHash, name, role = 'admin' }) {
  const { rows } = await query(
    `INSERT INTO admin_users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, is_active, created_at`,
    [email, passwordHash, name, role]
  );
  return rows[0];
}

// Update last login timestamp.
export async function updateLastLogin(id) {
  await query(
    `UPDATE admin_users SET updated_at = now() WHERE id = $1`,
    [id]
  );
}
