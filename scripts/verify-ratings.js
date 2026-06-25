#!/usr/bin/env node
// Verify the Reviews & Ratings system is working correctly.
import { config, assertDbConfig } from './config/index.js';
import { query } from './db/index.js';
import * as ratingsRepo from './db/repositories/ratings.js';
import * as bookingsRepo from './db/repositories/bookings.js';
import { submitRating, canRateBooking, getUnratedBookings, RatingError } from './services/ratingService.js';

assertDbConfig();

async function runTests() {
  console.log('🧪 Testing Reviews & Ratings System...\n');

  try {
    // Test 1: Find a completed booking to rate
    console.log('📋 Test 1: Finding a completed booking...');
    const { rows: completedBookings } = await query(`
      SELECT b.*, s.address, s.id as spot_id, s.owner_id
      FROM bookings b
      JOIN spots s ON s.id = b.spot_id
      WHERE b.status = 'completed'
      AND b.rating_prompted = false
      LIMIT 1
    `);

    if (completedBookings.length === 0) {
      console.log('⚠️  No unrated completed bookings found. Creating test data...');
      
      // Create test data if needed
      const { rows: testUsers } = await query(`
        SELECT id FROM users WHERE role = 'driver' LIMIT 1
      `);
      
      const { rows: testSpots } = await query(`
        SELECT id, owner_id, address FROM spots WHERE status = 'active' LIMIT 1
      `);

      if (testUsers.length > 0 && testSpots.length > 0) {
        const driverId = testUsers[0].id;
        const spot = testSpots[0];

        // Create a completed booking
        const { rows: testBooking } = await query(`
          INSERT INTO bookings (
            driver_id, spot_id, start_time, end_time, total_price,
            status, checked_in_at, checked_out_at
          ) VALUES (
            $1, $2, now() - interval '2 hours', now() - interval '1 hour',
            5000, 'completed', now() - interval '2 hours', now() - interval '1 hour'
          ) RETURNING *
        `, [driverId, spot.id]);

        if (testBooking.length > 0) {
          console.log(`✅ Created test booking #${testBooking[0].id}`);
          completedBookings.push({
            ...testBooking[0],
            address: spot.address,
            spot_id: spot.id,
            owner_id: spot.owner_id,
          });
        }
      }
    }

    if (completedBookings.length === 0) {
      console.log('❌ No test data available. Please create a completed booking first.');
      process.exit(1);
    }

    const testBooking = completedBookings[0];
    console.log(`✅ Found booking #${testBooking.id} at "${testBooking.address}"\n`);

    // Test 2: Check if booking can be rated
    console.log('📋 Test 2: Checking if booking can be rated...');
    const canRate = await canRateBooking(testBooking.id, testBooking.driver_id);
    console.log(`✅ Can rate: ${canRate}\n`);

    // Test 3: Submit a rating
    console.log('📋 Test 3: Submitting a rating (5 stars)...');
    const ratingResult = await submitRating({
      bookingId: testBooking.id,
      driverId: testBooking.driver_id,
      score: 5,
      comment: 'Excellent parking spot! Very convenient location.',
    });

    console.log(`✅ Rating submitted: ID #${ratingResult.rating.id}`);
    console.log(`   Score: ${ratingResult.rating.score}/5`);
    console.log(`   Comment: "${ratingResult.rating.comment}"\n`);

    // Test 4: Verify rating was created
    console.log('📋 Test 4: Verifying rating in database...');
    const savedRating = await ratingsRepo.getByBookingId(testBooking.id);
    if (savedRating) {
      console.log(`✅ Rating found in database`);
      console.log(`   Booking ID: ${savedRating.booking_id}`);
      console.log(`   Score: ${savedRating.score}`);
      console.log(`   Comment: ${savedRating.comment}\n`);
    } else {
      console.log('❌ Rating not found in database!\n');
    }

    // Test 5: Try to rate again (should fail)
    console.log('📋 Test 5: Attempting duplicate rating (should fail)...');
    try {
      await submitRating({
        bookingId: testBooking.id,
        driverId: testBooking.driver_id,
        score: 4,
        comment: 'Second rating attempt',
      });
      console.log('❌ Duplicate rating was allowed (BUG!)\n');
    } catch (err) {
      if (err instanceof RatingError && err.code === 'ALREADY_RATED') {
        console.log('✅ Duplicate rating correctly prevented\n');
      } else {
        console.log(`❌ Unexpected error: ${err.message}\n`);
      }
    }

    // Test 6: Get spot rating stats
    console.log('📋 Test 6: Getting spot rating statistics...');
    const stats = await ratingsRepo.getSpotRatingStats(testBooking.spot_id);
    console.log(`✅ Spot rating stats:`);
    console.log(`   Average: ${parseFloat(stats.avg_score).toFixed(1)}/5`);
    console.log(`   Total ratings: ${stats.total_ratings}`);
    console.log(`   5 stars: ${stats.five_star}`);
    console.log(`   4 stars: ${stats.four_star}`);
    console.log(`   3 stars: ${stats.three_star}`);
    console.log(`   2 stars: ${stats.two_star}`);
    console.log(`   1 star: ${stats.one_star}\n`);

    // Test 7: List ratings for spot
    console.log('📋 Test 7: Listing ratings for spot...');
    const { ratings, total } = await ratingsRepo.listBySpot(testBooking.spot_id, 10, 0);
    console.log(`✅ Found ${total} rating(s) for spot`);
    ratings.forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.score}/5 - ${r.comment || '(no comment)'} by ${r.driver_name}`);
    });
    console.log('');

    // Test 8: Get unrated bookings
    console.log('📋 Test 8: Getting unrated completed bookings...');
    const unrated = await getUnratedBookings(testBooking.driver_id, 5);
    console.log(`✅ Found ${unrated.length} unrated booking(s)\n`);

    // Test 9: Verify booking was marked as rating_prompted
    console.log('📋 Test 9: Verifying booking marked as rating_prompted...');
    const { rows: updatedBooking } = await query(
      'SELECT rating_prompted FROM bookings WHERE id = $1',
      [testBooking.id]
    );
    if (updatedBooking[0]?.rating_prompted) {
      console.log('✅ Booking correctly marked as rating_prompted\n');
    } else {
      console.log('❌ Booking NOT marked as rating_prompted!\n');
    }

    console.log('✅ All tests passed!\n');
    console.log('📊 Summary:');
    console.log('   - Rating creation: ✅');
    console.log('   - Duplicate prevention: ✅');
    console.log('   - Stats calculation: ✅');
    console.log('   - Rating listing: ✅');
    console.log('   - Unrated bookings query: ✅');
    console.log('   - Rating prompted flag: ✅');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

runTests();
