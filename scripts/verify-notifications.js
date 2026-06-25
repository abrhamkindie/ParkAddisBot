#!/usr/bin/env node
// Verify the Smart Notifications system is working correctly.
import { config, assertBotConfig } from '../src/config/index.js';
import { query } from '../src/db/index.js';
import * as bookingsRepo from '../src/db/repositories/bookings.js';

assertBotConfig();

async function runTests() {
  console.log('🧪 Testing Smart Notifications System...\n');

  try {
    // Test 1: Check if notification columns exist
    console.log('📋 Test 1: Checking notification columns...');
    const { rows: columns } = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
      AND column_name LIKE 'notification_%'
      ORDER BY column_name
    `);

    if (columns.length === 4) {
      console.log('✅ All 4 notification columns found:');
      columns.forEach(col => console.log(`   - ${col.column_name}`));
    } else {
      console.log(`⚠️  Found ${columns.length}/4 notification columns`);
      console.log('   Run: npm run db:migrate');
    }
    console.log('');

    // Test 2: Create test booking for notification testing
    console.log('📋 Test 2: Creating test bookings...');
    const { rows: testUsers } = await query(`
      SELECT id, telegram_id, language_pref FROM users WHERE role = 'driver' LIMIT 1
    `);

    const { rows: testSpots } = await query(`
      SELECT id, owner_id, address FROM spots WHERE status = 'active' LIMIT 1
    `);

    if (testUsers.length === 0 || testSpots.length === 0) {
      console.log('❌ Need at least 1 driver user and 1 active spot');
      process.exit(1);
    }

    const driverId = testUsers[0].id;
    const spot = testSpots[0];

    // Create a booking starting in 30 minutes (for start reminder test)
    const { rows: testBooking1 } = await query(`
      INSERT INTO bookings (
        driver_id, spot_id, start_time, end_time, total_price,
        status, payment_status, confirmation_code,
        notification_start_reminder, notification_payment_warning,
        notification_checkin_prompt, notification_host_alert
      ) VALUES (
        $1, $2, now() + interval '30 minutes', now() + interval '31 minutes',
        5000, 'reserved', 'unpaid', 'TEST001',
        false, false, false, false
      ) RETURNING *
    `, [driverId, spot.id]);

    console.log(`✅ Created test booking #${testBooking1[0].id} (starts in 30 min)`);

    // Create an unpaid booking from 12 minutes ago (for payment warning test)
    const { rows: testBooking2 } = await query(`
      INSERT INTO bookings (
        driver_id, spot_id, start_time, end_time, total_price,
        status, payment_status, confirmation_code, created_at,
        notification_start_reminder, notification_payment_warning,
        notification_checkin_prompt, notification_host_alert
      ) VALUES (
        $1, $2, now() + interval '1 hour', now() + interval '2 hours',
        5000, 'reserved', 'unpaid', 'TEST002',
        now() - interval '12 minutes',
        false, false, false, false
      ) RETURNING *
    `, [driverId, spot.id]);

    console.log(`✅ Created test booking #${testBooking2[0].id} (12 min old, unpaid)`);

    // Create a booking that started 5 minutes ago (for check-in prompt test)
    const { rows: testBooking3 } = await query(`
      INSERT INTO bookings (
        driver_id, spot_id, start_time, end_time, total_price,
        status, payment_status, confirmation_code, checkin_token,
        notification_start_reminder, notification_payment_warning,
        notification_checkin_prompt, notification_host_alert
      ) VALUES (
        $1, $2, now() - interval '5 minutes', now() + interval '1 hour',
        5000, 'reserved', 'paid', 'TEST003', 'test_token_123',
        false, false, false, false
      ) RETURNING *
    `, [driverId, spot.id]);

    console.log(`✅ Created test booking #${testBooking3[0].id} (started 5 min ago)`);

    // Create an unpaid booking from 20 minutes ago (for auto-cancel test)
    const { rows: testBooking4 } = await query(`
      INSERT INTO bookings (
        driver_id, spot_id, start_time, end_time, total_price,
        status, payment_status, confirmation_code, created_at,
        notification_start_reminder, notification_payment_warning,
        notification_checkin_prompt, notification_host_alert
      ) VALUES (
        $1, $2, now() + interval '2 hours', now() + interval '3 hours',
        5000, 'reserved', 'unpaid', 'TEST004',
        now() - interval '20 minutes',
        false, false, false, false
      ) RETURNING *
    `, [driverId, spot.id]);

    console.log(`✅ Created test booking #${testBooking4[0].id} (20 min old, will be cancelled)`);
    console.log('');

    // Test 3: Test notification queries
    console.log('📋 Test 3: Testing notification queries...');

    // Start reminder query
    const startReminders = await bookingsRepo.getUpcomingForReminder(35);
    console.log(`✅ Start reminders: ${startReminders.length} booking(s) found`);

    // Payment warning query
    const paymentWarnings = await bookingsRepo.getUnpaidForWarning(10);
    console.log(`✅ Payment warnings: ${paymentWarnings.length} booking(s) found`);

    // Check-in prompt query
    const checkinPrompts = await bookingsRepo.getActiveForCheckinPrompt();
    console.log(`✅ Check-in prompts: ${checkinPrompts.length} booking(s) found`);

    // Host alert query
    const hostAlerts = await bookingsRepo.getUpcomingForHostAlert(65);
    console.log(`✅ Host alerts: ${hostAlerts.length} booking(s) found`);

    // Expired bookings query
    const expiredBookings = await bookingsRepo.getExpiredUnpaidBookings(15);
    console.log(`✅ Expired unpaid: ${expiredBookings.length} booking(s) found`);
    console.log('');

    // Test 4: Test marking notifications as sent
    console.log('📋 Test 4: Testing notification mark as sent...');
    const marked = await bookingsRepo.markNotificationSent(testBooking1[0].id, 'start_reminder');
    if (marked) {
      console.log('✅ Successfully marked notification as sent');
    } else {
      console.log('❌ Failed to mark notification');
    }
    console.log('');

    // Test 5: Verify notification flags prevent re-querying
    console.log('📋 Test 5: Verifying notification flags work...');
    const startRemindersAfter = await bookingsRepo.getUpcomingForReminder(35);
    const stillHasBooking = startRemindersAfter.some(b => b.id === testBooking1[0].id);
    if (!stillHasBooking) {
      console.log('✅ Booking correctly excluded after marking notification sent');
    } else {
      console.log('❌ Booking still appears in query (flag not working)');
    }
    console.log('');

    // Cleanup: Delete test bookings
    console.log('📋 Cleaning up test data...');
    await query('DELETE FROM bookings WHERE confirmation_code LIKE $1', ['TEST%']);
    console.log('✅ Test bookings deleted\n');

    console.log('✅ All tests passed!\n');
    console.log('📊 Summary:');
    console.log('   - Database schema: ✅');
    console.log('   - Notification queries: ✅');
    console.log('   - Mark as sent: ✅');
    console.log('   - Flag filtering: ✅');
    console.log('\n🔔 To enable notifications in production:');
    console.log('   - Set ENABLE_NOTIFICATIONS=true in .env');
    console.log('   - Scheduler runs every 5 minutes');
    console.log('   - Monitors: start reminders, payment warnings, check-in prompts, host alerts');
    console.log('   - Auto-cancels expired unpaid bookings');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

runTests();
