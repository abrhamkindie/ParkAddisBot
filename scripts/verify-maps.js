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

const { welcomeKeyboard } = await import('../src/bot/keyboards.js');
assert.ok(
  buttons(welcomeKeyboard(t)).some((b) => b.callback_data === 'nearby:find'),
  'welcome keyboard triggers a find'
);
ok('welcomeKeyboard: find-parking CTA');

// Map results keyboard: a view button per spot + the interactive map web-app button.
const mapKb = nearbyResultsKeyboard(t, [{ id: 1, lat: 8.9, lng: 38.7 }, { id: 2, lat: 9, lng: 38.8 }], {
  miniAppUrl: 'https://example.com/miniapp/',
});
assert.ok(buttons(mapKb).some((b) => b.callback_data === 'spot:view:1'), 'has view for spot 1');
assert.ok(buttons(mapKb).some((b) => b.callback_data === 'spot:view:2'), 'has view for spot 2');
assert.ok(buttons(mapKb).some((b) => b.web_app), 'has an interactive map web-app button');
ok('nearbyResultsKeyboard wires per-spot + map button');

console.log('\n[geo walkMinutes]');
const { walkMinutes } = await import('../src/utils/geo.js');
assert.equal(walkMinutes(null), null, 'null distance → null');
assert.equal(walkMinutes(0), 1, 'across the street → at least 1 min');
assert.equal(walkMinutes(80), 1, '80 m → 1 min');
assert.equal(walkMinutes(800), 10, '800 m → 10 min');
ok('walkMinutes rounds up at ~80 m/min');

console.log('\n[buildMapCaption]');
const { buildMapCaption } = await import('../src/bot/views/spot.js');
// Real translator so spot_line interpolation is exercised.
const { getTranslator } = await import('../src/i18n/index.js');
const te = getTranslator('en');
const spots = [
  { id: 1, address: 'Bole', price_per_hour: 40, distance_m: 200, rating_count: 0 },
  { id: 2, address: 'Piassa', price_per_hour: 30, distance_m: 900, rating_count: 0, covered: true },
];
const caption = buildMapCaption(te, spots, { headerText: 'HEADER' });
assert.ok(caption.startsWith('HEADER'), 'caption leads with the header');
assert.ok(caption.includes('\n1. Bole'), 'numbered line 1 matches first pin');
assert.ok(caption.includes('\n2. Piassa'), 'numbered line 2 matches second pin');
ok('buildMapCaption numbers spots to match the map pins');

console.log('\nMAPS CHECKS PASSED ✅\n');
