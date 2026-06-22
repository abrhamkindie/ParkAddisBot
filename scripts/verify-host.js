#!/usr/bin/env node
// Host onboarding checks: pure validators + a DB round-trip of the spot lifecycle
// (create → searchable → has bookings → pause hides it → price update → delete).
import assert from 'node:assert/strict';
import { parsePrice, parseCapacity } from '../src/utils/listing.js';
import * as spotsRepo from '../src/db/repositories/spots.js';
import * as bookingsRepo from '../src/db/repositories/bookings.js';
import * as usersRepo from '../src/db/repositories/users.js';
import { query, close } from '../src/db/index.js';

function ok(msg) { console.log('  ✓ ' + msg); }

console.log('\n[listing validators]');
assert.equal(parsePrice('40'), 40, 'plain price');
assert.equal(parsePrice('40 ETB'), 40, 'price with unit');
assert.equal(parsePrice('40.5'), 40.5, 'decimal price');
assert.equal(parsePrice('0'), null, 'zero rejected');
assert.equal(parsePrice('-5'), null, 'negative rejected');
assert.equal(parsePrice('abc'), null, 'non-numeric rejected');
assert.equal(parseCapacity('3'), 3, 'capacity');
assert.equal(parseCapacity('0'), null, 'capacity 0 rejected');
assert.equal(parseCapacity('2000'), null, 'capacity over cap rejected');
assert.equal(parseCapacity('two'), null, 'non-numeric capacity rejected');
ok('parsePrice / parseCapacity');

async function main() {
  console.log('\n[spot lifecycle]');
  // Isolated test user + a location far from seed data so findNearby is clean.
  const tgId = 990000777;
  const user = await usersRepo.upsertUser({ telegramId: tgId, name: 'Host Test', username: 'hosttest' });
  const lat = 8.5001;
  const lng = 38.5001;

  const spot = await spotsRepo.create({
    ownerId: user.id, lat, lng, address: 'Test Lot',
    pricePerHour: 40, capacity: 2, covered: true, guarded: false, evCharging: false,
  });
  assert.ok(spot.id, 'spot created');
  assert.equal(spot.status, 'active', 'created spot is active');
  assert.ok(Math.abs(Number(spot.lat) - lat) < 1e-6 && Math.abs(Number(spot.lng) - lng) < 1e-6, 'geom round-trips');
  ok(`created active spot #${spot.id} with correct geom`);

  let near = await spotsRepo.findNearby({ lat, lng, radiusM: 500, limit: 8 });
  assert.ok(near.some((s) => String(s.id) === String(spot.id)), 'new spot is searchable');
  ok('appears in findNearby');

  const bId = await bookingsRepo.createBooking({
    driverId: user.id, spotId: spot.id,
    start: new Date(Date.now() + 3600e3), end: new Date(Date.now() + 7200e3),
    totalPrice: 40, confirmationCode: `HT-${Date.now()}`,
  });
  const bks = await bookingsRepo.listBySpot(spot.id, 10);
  assert.ok(bks.some((b) => String(b.id) === String(bId)), 'listBySpot shows the booking');
  assert.ok(bks[0].driver_name, 'booking line has driver name');
  ok('listBySpot returns upcoming booking with driver');

  const priced = await spotsRepo.updatePrice(spot.id, user.id, 75);
  assert.equal(Number(priced.price_per_hour), 75, 'price updated');
  ok('updatePrice');

  await spotsRepo.setAvailability(spot.id, user.id, false);
  near = await spotsRepo.findNearby({ lat, lng, radiusM: 500, limit: 8 });
  assert.ok(!near.some((s) => String(s.id) === String(spot.id)), 'paused spot hidden from search');
  ok('paused spot disappears from findNearby');

  // Ownership: a different owner can't mutate it.
  const notRemoved = await spotsRepo.remove(spot.id, user.id + 999999);
  assert.equal(notRemoved, null, 'remove is owner-scoped');
  ok('remove rejects non-owner');

  const removed = await spotsRepo.remove(spot.id, user.id);
  assert.ok(removed, 'owner can remove');
  assert.equal(await spotsRepo.getById(spot.id), null, 'spot is gone');
  ok('remove deletes the spot (cascades its booking)');

  // Cleanup the test user.
  await query('DELETE FROM users WHERE telegram_id = $1', [tgId]);
  await close();
  console.log('\nHOST CHECKS PASSED ✅\n');
}

main().catch((err) => { console.error('\n' + err.stack + '\n'); process.exitCode = 1; });
