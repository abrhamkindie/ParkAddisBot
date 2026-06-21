#!/usr/bin/env node
// Integration + unit smoke test for the check-in subsystem.
import assert from 'node:assert/strict';
import { generateCheckinToken } from '../src/utils/code.js';
import { checkinLink } from '../src/utils/deeplink.js';
import { checkinQrPng } from '../src/utils/qr.js';

function section(name) { console.log('\n[' + name + ']'); }
function ok(msg) { console.log('  ✓ ' + msg); }

async function main() {
  // Idempotency: remove rows left by previous runs of this script.
  const _db = await import('../src/db/index.js');
  await _db.query(
    "DELETE FROM bookings WHERE driver_id IN (SELECT id FROM users WHERE telegram_id IN (999000111, 999000222))"
  );

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

  section('checkinService');
  const { checkIn, complete, CheckinError } = await import('../src/services/checkinService.js');

  const ownerId = (await spots.getById(near[0].id)).owner_id;
  const owner = await usersRepo.getById(ownerId);

  // Non-owner cannot check in.
  await assert.rejects(
    () => checkIn({ scannerTelegramId: 123456789, scannerRole: 'driver', token: booking.checkin_token }),
    (e) => e instanceof CheckinError && e.code === 'NOT_OWNER',
    'non-owner is rejected'
  );
  ok('NOT_OWNER enforced');

  // Owner checks in successfully.
  const res = await checkIn({ scannerTelegramId: owner.telegram_id, scannerRole: owner.role, token: booking.checkin_token });
  assert.equal(res.booking.status, 'active', 'status becomes active');
  assert.ok(res.booking.checked_in_at, 'checked_in_at is set');
  ok('owner check-in transitions to active');

  // Second check-in is rejected.
  await assert.rejects(
    () => checkIn({ scannerTelegramId: owner.telegram_id, scannerRole: owner.role, token: booking.checkin_token }),
    (e) => e instanceof CheckinError && e.code === 'ALREADY_CHECKED_IN',
    'already-checked-in rejected'
  );
  ok('ALREADY_CHECKED_IN enforced');

  // Unknown token.
  await assert.rejects(
    () => checkIn({ scannerTelegramId: owner.telegram_id, scannerRole: owner.role, token: 'nope-not-real' }),
    (e) => e instanceof CheckinError && e.code === 'NOT_FOUND',
    'unknown token rejected'
  );
  ok('NOT_FOUND enforced');

  // Expired booking (end_time in the past).
  const expDriver = await usersRepo.upsertUser({ telegramId: 999000222, name: 'Exp Driver' });
  const past = new Date(Date.now() - 5 * 3600 * 1000);
  const { booking: expB } = await reserve({ driverId: expDriver.id, spotId: near[0].id, start: past, hours: 1 });
  await assert.rejects(
    () => checkIn({ scannerTelegramId: owner.telegram_id, scannerRole: owner.role, token: expB.checkin_token }),
    (e) => e instanceof CheckinError && e.code === 'EXPIRED',
    'expired rejected'
  );
  ok('EXPIRED enforced');

  // Complete the active booking.
  const done = await complete({ bookingId: res.booking.id, scannerTelegramId: owner.telegram_id, scannerRole: owner.role });
  assert.equal(done.status, 'completed', 'status becomes completed');
  assert.ok(done.checked_out_at, 'checked_out_at is set');
  ok('complete transitions to completed');

  console.log('\nALL CHECK-IN CHECKS PASSED ✅\n');
  const db = await import('../src/db/index.js');
  await db.close();
}

main().catch((err) => { console.error('\n' + err.stack + '\n'); process.exitCode = 1; });
