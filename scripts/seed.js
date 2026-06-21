#!/usr/bin/env node
// Runs the development seed (003_seed_dev.sql). Idempotent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { config } from '../src/config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFile = join(__dirname, '..', 'migrations', '003_seed_dev.sql');

async function main() {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl: config.pgSsl });
  try {
    const sql = readFileSync(seedFile, 'utf8');
    await pool.query(sql);
    console.log('✓ Seed data applied.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
