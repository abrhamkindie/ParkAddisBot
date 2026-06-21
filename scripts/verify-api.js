#!/usr/bin/env node
// Smoke test for the Mini App backend: boots Express (no bot) and hits the
// nearby spots API against the seeded DB.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { close } from '../src/db/index.js';

function ok(msg) { console.log('  ✓ ' + msg); }

async function main() {
  const app = createServer();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s)); // ephemeral port
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  console.log('\n[api/spots/nearby]');
  // Bole Medhanialem area — seeded spots are here.
  const res = await fetch(`${base}/api/spots/nearby?lat=8.995&lng=38.799`);
  assert.equal(res.status, 200, 'returns 200');
  const body = await res.json();
  assert.ok(Array.isArray(body.spots), 'has a spots array');
  assert.ok(body.spots.length >= 1, 'returns at least one spot');
  const s = body.spots[0];
  assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lng), 'spot has numeric lat/lng');
  assert.ok(Number.isFinite(s.price_per_hour), 'spot has numeric price');
  assert.ok(s.distance_m == null || Number.isFinite(s.distance_m), 'distance_m numeric or null');
  ok(`returned ${body.spots.length} spots; nearest "${s.address}" at ${s.distance_m} m`);

  console.log('\n[bad coords → 400]');
  const bad = await fetch(`${base}/api/spots/nearby?lat=abc`);
  assert.equal(bad.status, 400, 'bad coords returns 400');
  ok('400 on missing/invalid coords');

  server.close();
  await close();
  console.log('\nAPI CHECKS PASSED ✅\n');
}

main().catch((err) => { console.error('\n' + err.stack + '\n'); process.exitCode = 1; });
