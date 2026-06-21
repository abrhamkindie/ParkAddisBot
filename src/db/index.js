// PostgreSQL connection pool + helpers.
import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Return NUMERIC as JS numbers (safe for our money ranges) instead of strings.
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  logger.error('Unexpected idle pg client error', { error: err.message });
});

export function query(text, params) {
  return pool.query(text, params);
}

// Run fn inside a transaction with a dedicated client. Commits on success,
// rolls back on throw, always releases the client.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function healthcheck() {
  const { rows } = await query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

export async function close() {
  await pool.end();
}
