#!/usr/bin/env node
// Smoke test for the core flow against the running DB. Not a unit test suite —
// just proves the PostGIS search + atomic booking work end to end.
import * as spotsRepo from '../src/db/repositories/spots.js';
import * as usersRepo from '../src/db/repositories/users.js';
import { reserve, BookingError } from '../src/services/bookingService.js';
import { close } from '../src/db/index.js';

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  console.log('  ✓ ' + msg);
}

async function main() {
  // Search from Bole Medhanialem (lat 8.9950, lng 38.7990)
  console.log('\n[1] Nearby search around Bole:');
  const near = await spotsRepo.findNearby({ lat: 8.995, lng: 38.799, radiusM: 5000, limit: 8 });
  near.forEach((s, i) =>
    console.log(`  ${i + 1}. ${s.address} — ${s.price_per_hour} ETB/hr · ${Math.round(s.distance_m)} m`)
  );
  assert(near.length >= 1, 'returns at least one active spot');
  assert(near[0].distance_m <= near[near.length - 1].distance_m, 'sorted by distance ascending');
  assert(!near.some((s) => s.address.includes('Kazanchis')), 'pending spot is excluded');

  // Create a test driver
  const driver = await usersRepo.upsertUser({ telegramId: 999999999, name: 'Test Driver' });

  // Reserve the nearest spot for 2 hours starting now
  console.log('\n[2] Reserve nearest spot for 2h:');
  const spotId = near[0].id;
  const start = new Date();
  const { booking } = await reserve({ driverId: driver.id, spotId, start, hours: 2 });
  assert(!!booking.confirmation_code, `got confirmation code ${booking.confirmation_code}`);
  assert(Number(booking.total_price) === Number(near[0].price_per_hour) * 2, 'total = price * hours');

  // Capacity guard: fill the spot to capacity at the same time window.
  console.log('\n[3] Double-booking guard (capacity enforcement):');
  const spot = await spotsRepo.getById(spotId);
  console.log(`  spot capacity = ${spot.capacity}, one booking already placed`);
  let placed = 1;
  let blocked = false;
  for (let i = 0; i < spot.capacity + 2; i++) {
    const d = await usersRepo.upsertUser({ telegramId: 999990000 + i, name: `D${i}` });
    try {
      await reserve({ driverId: d.id, spotId, start, hours: 2 });
      placed++;
    } catch (err) {
      if (err instanceof BookingError && err.code === 'CAPACITY_FULL') {
        blocked = true;
        break;
      }
      throw err;
    }
  }
  assert(placed === spot.capacity, `exactly capacity (${spot.capacity}) overlapping bookings allowed`);
  assert(blocked, 'further overlapping booking rejected with CAPACITY_FULL');

  // A non-overlapping window should still succeed.
  console.log('\n[4] Non-overlapping window still bookable:');
  const later = new Date(start.getTime() + 5 * 3600 * 1000);
  const { booking: b2 } = await reserve({ driverId: driver.id, spotId, start: later, hours: 1 });
  assert(!!b2.id, 'booking 5h later succeeds');

  console.log('\nALL CHECKS PASSED ✅\n');
}

main()
  .catch((err) => {
    console.error('\n' + err.message + '\n');
    process.exitCode = 1;
  })
  .finally(() => close());
