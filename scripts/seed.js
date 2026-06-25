#!/usr/bin/env node
// Runs all seed files in order. Idempotent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { config } from '../src/config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFiles = [
  '003_seed_dev.sql',
  '012_seed_more_spots.sql',
];

async function main() {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl: config.pgSsl });
  try {
    for (const file of seedFiles) {
      const filePath = join(__dirname, '..', 'migrations', file);
      const sql = readFileSync(filePath, 'utf8');
      await pool.query(sql);
      console.log(`✓ Seed applied: ${file}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
