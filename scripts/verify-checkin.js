#!/usr/bin/env node
// Integration + unit smoke test for the check-in subsystem.
import assert from 'node:assert/strict';
import { generateCheckinToken } from '../src/utils/code.js';
import { checkinLink } from '../src/utils/deeplink.js';
import { checkinQrPng } from '../src/utils/qr.js';

function section(name) { console.log('\n[' + name + ']'); }
function ok(msg) { console.log('  ✓ ' + msg); }

async function main() {
  section('utils');
  const tok = generateCheckinToken();
  assert.match(tok, /^[A-Za-z0-9_-]{20,}$/, 'token is url-safe and long enough');
  assert.notEqual(generateCheckinToken(), tok, 'tokens are unique');
  ok('generateCheckinToken produces unique url-safe tokens');

  const link = checkinLink('ABC123');
  assert.equal(link, 'https://t.me/ParkAddisBot?start=checkin_ABC123', 'deep link format');
  ok('checkinLink builds the t.me deep link');

  const png = await checkinQrPng(link);
  assert.ok(Buffer.isBuffer(png) && png.length > 100, 'QR is a non-trivial PNG buffer');
  assert.equal(png[0], 0x89, 'PNG magic byte');
  ok('checkinQrPng renders a PNG buffer');

  section('reserve attaches token');
  const spots = await import('../src/db/repositories/spots.js');
  const usersRepo = await import('../src/db/repositories/users.js');
  const { reserve } = await import('../src/services/bookingService.js');

  const near = await spots.findNearby({ lat: 8.995, lng: 38.799, radiusM: 5000, limit: 1 });
  assert.ok(near.length, 'have at least one active seeded spot (run npm run db:seed)');
  const driver = await usersRepo.upsertUser({ telegramId: 999000111, name: 'QR Driver' });
  const { booking } = await reserve({ driverId: driver.id, spotId: near[0].id, start: new Date(), hours: 1 });
  assert.match(booking.checkin_token || '', /^[A-Za-z0-9_-]{20,}$/, 'reserve() returns a checkin_token');
  ok('reserve() generates and persists a checkin_token');

  console.log('\nALL CHECK-IN CHECKS PASSED ✅\n');
  const db = await import('../src/db/index.js');
  await db.close();
}

main().catch((err) => { console.error('\n' + err.stack + '\n'); process.exitCode = 1; });
