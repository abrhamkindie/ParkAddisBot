#!/usr/bin/env node
// Unit test for in-chat map/directions helpers and keyboards (no DB/network).
import assert from 'node:assert/strict';
import { directionsUrl } from '../src/utils/maps.js';

function ok(msg) { console.log('  ✓ ' + msg); }

// Stub translator: returns the key, so we can find buttons by label/url.
const t = (k) => k;

console.log('\n[maps util]');
assert.equal(
  directionsUrl(8.99, 38.79),
  'https://www.google.com/maps/dir/?api=1&destination=8.99,38.79',
  'directionsUrl builds the Google Maps deep link'
);
ok('directionsUrl');

console.log('\n[keyboards]');
const { nearbyResultsKeyboard, spotDetailKeyboard } = await import('../src/bot/keyboards.js');

// Helper: flatten all buttons from an InlineKeyboard markup.
const buttons = (kb) => kb.inline_keyboard.flat();
const dir = 'https://www.google.com/maps/dir/?api=1&destination=8.9,38.7';

const resultsKb = nearbyResultsKeyboard(t, [{ id: 1, lat: 8.9, lng: 38.7 }], {});
assert.ok(buttons(resultsKb).some((b) => b.callback_data === 'spot:view:1'), 'results has a view button');
assert.ok(buttons(resultsKb).some((b) => b.url === dir), 'results has a directions URL button');
ok('nearbyResultsKeyboard adds a directions button');

const detailKb = spotDetailKeyboard(t, { id: 1, lat: 8.9, lng: 38.7 });
assert.ok(buttons(detailKb).some((b) => b.callback_data === 'book:start:1'), 'detail has book button');
assert.ok(buttons(detailKb).some((b) => b.url === dir), 'detail has a directions URL button');
assert.ok(buttons(detailKb).some((b) => b.callback_data === 'nearby:back'), 'detail has back button');
ok('spotDetailKeyboard adds a directions button');

const { venuePinKeyboard, welcomeKeyboard } = await import('../src/bot/keyboards.js');
const pinKb = venuePinKeyboard(t, { id: 7, lat: 8.9, lng: 38.7 });
assert.ok(buttons(pinKb).some((b) => b.callback_data === 'book:start:7'), 'pin has book button');
assert.ok(buttons(pinKb).some((b) => b.url === dir), 'pin has directions URL');
assert.ok(buttons(pinKb).some((b) => b.callback_data === 'spot:view:7'), 'pin has details button');
ok('venuePinKeyboard: book + directions + details');

assert.ok(
  buttons(welcomeKeyboard(t)).some((b) => b.callback_data === 'nearby:find'),
  'welcome keyboard triggers a find'
);
ok('welcomeKeyboard: find-parking CTA');

console.log('\n[geo walkMinutes]');
const { walkMinutes } = await import('../src/utils/geo.js');
assert.equal(walkMinutes(null), null, 'null distance → null');
assert.equal(walkMinutes(0), 1, 'across the street → at least 1 min');
assert.equal(walkMinutes(80), 1, '80 m → 1 min');
assert.equal(walkMinutes(800), 10, '800 m → 10 min');
ok('walkMinutes rounds up at ~80 m/min');

console.log('\n[buildNearbyPresentation]');
const { buildNearbyPresentation } = await import('../src/bot/views/spot.js');
const mkSpot = (id, extra = {}) => ({
  id,
  lat: 8.9 + id / 1000,
  lng: 38.7,
  price_per_hour: 40,
  distance_m: id * 100,
  rating_count: 0,
  ...extra,
});
const many = [1, 2, 3, 4, 5, 6, 7].map((id) => mkSpot(id));
const plan = buildNearbyPresentation(t, many, { mapUrl: 'https://x/map', maxPins: 5, headerText: 'HEADER' });
assert.equal(plan.pins.length, 5, 'caps pins at maxPins');
assert.equal(plan.lead.moreCount, 2, 'reports the remaining count');
assert.equal(plan.lead.mapUrl, 'https://x/map', 'carries the map url');
assert.ok(plan.lead.text.startsWith('HEADER'), 'lead starts with the header');
assert.ok(plan.pins.every((p) => p.title && p.address && Number.isFinite(p.lat)), 'pins are well-formed');
assert.equal(plan.pins[0].spotId, 1, 'pin carries the spot id');
ok('caps pins, reports overflow, keeps map url');

// Spots without coordinates can't be pinned and are dropped.
const noCoords = buildNearbyPresentation(t, [{ id: 9, price_per_hour: 10, distance_m: 50, rating_count: 0 }], {
  maxPins: 5,
  headerText: 'H',
});
assert.equal(noCoords.pins.length, 0, 'drops spots missing lat/lng');
assert.equal(noCoords.lead.mapUrl, null, 'no map url defaults to null');
ok('drops coordinate-less spots');

console.log('\nMAPS CHECKS PASSED ✅\n');
