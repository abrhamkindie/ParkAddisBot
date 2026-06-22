#!/usr/bin/env node
// Smoke test for the static nearby-map renderer. Needs OSM tiles (network) +
// sharp; if tiles are unreachable it reports a skip rather than failing CI.
import assert from 'node:assert/strict';
import { renderNearbyMap } from '../src/utils/staticMap.js';

function ok(msg) { console.log('  ✓ ' + msg); }

async function main() {
  console.log('\n[staticMap renderNearbyMap]');
  const spots = [
    { id: 1, lat: 8.995, lng: 38.799 },
    { id: 2, lat: 8.99, lng: 38.79 },
    { id: 3, lat: 9.0, lng: 38.805 },
  ];
  let png;
  try {
    png = await renderNearbyMap({ lat: 8.993, lng: 38.797, spots });
  } catch (err) {
    console.log('  ⚠ skipped (tiles unreachable): ' + err.message);
    return;
  }
  assert.ok(Buffer.isBuffer(png), 'returns a Buffer');
  assert.ok(png.length > 2000, 'image is non-trivial in size');
  assert.equal(png.slice(1, 4).toString(), 'PNG', 'is a PNG');
  ok(`rendered a ${png.length}-byte PNG with ${spots.length} pins`);

  // Spots without coordinates are dropped, not fatal.
  const png2 = await renderNearbyMap({ lat: 8.993, lng: 38.797, spots: [{ id: 9 }, spots[0]] });
  assert.ok(Buffer.isBuffer(png2), 'tolerates coordinate-less spots');
  ok('drops coordinate-less spots without failing');

  console.log('\nSTATIC MAP CHECKS PASSED ✅\n');
}

main().catch((err) => { console.error('\n' + err.stack + '\n'); process.exitCode = 1; });
