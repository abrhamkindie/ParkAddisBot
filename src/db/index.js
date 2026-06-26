/**
 * @file PostgreSQL connection pool and query helpers.
 *
 * Exposes a shared {@link pool}, a convenience {@link query} function, and a
 * {@link withTransaction} helper for atomic multi-step operations.
 *
 * NUMERIC columns are automatically parsed as JavaScript numbers instead of
 * strings (safe for the money ranges used in this application).
 *
 * @example
 * import { query, withTransaction } from '../db/index.js';
 *
 * const { rows } = await query('SELECT * FROM spots WHERE id = $1', [id]);
 *
 * await withTransaction(async (client) => {
 *   await client.query('UPDATE bookings SET status = $1', ['confirmed']);
 *   await client.query('INSERT INTO payments ...');
 * });
 */

import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Return NUMERIC (oid 1700) as JS numbers instead of strings.
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

/**
 * Shared PostgreSQL connection pool.
 * Configured via `DATABASE_URL` and `PGSSL` env vars.
 *
 * @type {pg.Pool}
 */
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  logger.error('Unexpected idle pg client error', { error: err.message });
});

/**
 * Execute a parameterised SQL query against the pool.
 *
 * @param {string}  text   SQL statement with `$1`, `$2`, … placeholders.
 * @param {Array}   [params] Values for the placeholders.
 * @returns {Promise<pg.QueryResult>}
 *
 * @example
 * const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Execute `fn` inside a database transaction.
 *
 * - Acquires a dedicated client from the pool.
 * - Begins a transaction, runs `fn(client)`, and commits on success.
 * - Rolls back if `fn` throws, and always releases the client.
 *
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} fn Async function that
 *   receives the transaction client and returns a value.
 * @returns {Promise<T>} The return value of `fn`.
 *
 * @example
 * const result = await withTransaction(async (client) => {
 *   const { rows } = await client.query('...');
 *   return rows[0];
 * });
 */
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

/**
 * Quick database health check — runs `SELECT 1`.
 *
 * @returns {Promise<boolean>} `true` if the database responded.
 */
export async function healthcheck() {
  const { rows } = await query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

/**
 * Gracefully close all pool connections. Call during shutdown.
 *
 * @returns {Promise<void>}
 */
export async function close() {
  await pool.end();
}
