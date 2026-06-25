#!/usr/bin/env node
// Test suite for Professional Platform Enhancements

import { query } from '../src/db/index.js';
import * as favoritesRepo from '../src/db/repositories/favorites.js';
import * as pricingRulesRepo from '../src/db/repositories/pricingRules.js';
import * as recurringRepo from '../src/db/repositories/recurringBookings.js';
import * as waitlistRepo from '../src/db/repositories/waitlist.js';
import * as promoRepo from '../src/db/repositories/promoCodes.js';
import * as availabilityRepo from '../src/db/repositories/hostAvailability.js';
import { applyPromoCode } from '../src/services/promoService.js';
import { extendBooking, cancelBooking } from '../src/services/bookingModificationService.js';
import fs from 'fs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => {
      console.log(`✅ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`❌ ${name}: ${err.message}`);
      failed++;
    });
}

async function runTests() {
  console.log('\n🧪 Testing Professional Platform Enhancements...\n');

  // Test 1: Favorites
  await test('Favorites: Add and retrieve favorite', async () => {
    const userId = 1; // Assuming test user exists
    const spotId = 1; // Assuming test spot exists
    
    await favoritesRepo.addFavorite(userId, spotId);
    const favorites = await favoritesRepo.getUserFavorites(userId);
    const isFav = await favoritesRepo.isFavorite(userId, spotId);
    
    if (!isFav || favorites.length === 0) {
      throw new Error('Favorite not found');
    }
    
    await favoritesRepo.removeFavorite(userId, spotId);
  });

  // Test 2: Pricing Rules
  await test('Pricing Rules: Create and retrieve rules', async () => {
    const spotId = 1;
    
    const rule = await pricingRulesRepo.createRule({
      spotId,
      dayOfWeek: 1, // Monday
      startHour: 8,
      endHour: 18,
      multiplier: 1.5,
      description: 'Peak hours',
    });
    
    if (!rule || rule.price_multiplier !== 1.5) {
      throw new Error('Rule not created correctly');
    }
    
    const rules = await pricingRulesRepo.getRulesBySpotId(spotId);
    if (rules.length === 0) {
      throw new Error('Rules not retrieved');
    }
    
    await pricingRulesRepo.deleteRule(rule.id);
  });

  // Test 3: Promo Codes
  await test('Promo Codes: Create and validate', async () => {
    const uniqueCode = 'TEST' + Date.now();
    const code = await promoRepo.createPromoCode({
      code: uniqueCode,
      discountType: 'percent',
      discountValue: 20,
      maxUses: 100,
      minBookingAmount: 50,
    });
    
    if (!code || code.code !== uniqueCode) {
      throw new Error('Promo code not created');
    }
    
    const validation = await promoRepo.validatePromoCode(uniqueCode, 100);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }
    
    const result = await applyPromoCode(uniqueCode, 100);
    if (!result.success || result.discountAmount !== 20) {
      throw new Error('Discount calculation wrong');
    }
    
    await promoRepo.deactivatePromoCode(code.id);
  });

  // Test 4: Waitlist
  await test('Waitlist: Add and retrieve', async () => {
    const userId = 1;
    const spotId = 1;
    
    const entry = await waitlistRepo.addToWaitlist({
      userId,
      spotId,
      preferredStart: '09:00',
      preferredDuration: 2,
    });
    
    if (!entry) {
      throw new Error('Waitlist entry not created');
    }
    
    const isOn = await waitlistRepo.isOnWaitlist(userId, spotId);
    if (!isOn) {
      throw new Error('Waitlist check failed');
    }
    
    await waitlistRepo.removeFromWaitlist(userId, spotId);
  });

  // Test 5: Recurring Bookings
  await test('Recurring Bookings: Create pattern', async () => {
    const pattern = await recurringRepo.createPattern({
      driverId: 1,
      spotId: 1,
      pattern: 'weekly',
      dayOfWeek: 1,
      startTime: '09:00',
      durationHours: 2,
    });
    
    if (!pattern || pattern.pattern !== 'weekly') {
      throw new Error('Pattern not created');
    }
    
    const patterns = await recurringRepo.getDriverPatterns(1);
    if (patterns.length === 0) {
      throw new Error('Patterns not retrieved');
    }
    
    await recurringRepo.deactivatePattern(pattern.id, 1);
  });

  // Test 6: Host Availability
  await test('Host Availability: Set and check', async () => {
    const hostId = 1;
    const spotId = 1;
    const date = '2026-07-01';
    
    const avail = await availabilityRepo.setAvailability({
      hostId,
      spotId,
      date,
      available: false,
      reason: 'Vacation',
    });
    
    if (!avail) {
      throw new Error('Availability not set');
    }
    
    const isAvail = await availabilityRepo.isAvailable(spotId, date);
    if (isAvail) {
      throw new Error('Availability check failed');
    }
    
    await availabilityRepo.deleteAvailability(avail.id, hostId);
  });

  // Test 7: Database Functions
  await test('Database: Dynamic pricing function exists', async () => {
    const { rows } = await query(
      `SELECT get_price_multiplier(1, now()) as multiplier`
    );
    
    if (!rows[0] || rows[0].multiplier === undefined) {
      throw new Error('Function not found');
    }
  });

  // Test 8: JSON Locales
  await test('Locales: English translations valid', async () => {
    const en = JSON.parse(fs.readFileSync('./src/i18n/locales/en.json', 'utf-8'));
    
    if (!en.favorites || !en.modification || !en.waitlist) {
      throw new Error('Missing translation sections');
    }
  });

  await test('Locales: Amharic translations valid', async () => {
    const am = JSON.parse(fs.readFileSync('./src/i18n/locales/am.json', 'utf-8'));
    
    if (!am.favorites || !am.modification || !am.waitlist) {
      throw new Error('Missing Amharic translation sections');
    }
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  console.log('='.repeat(50) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
