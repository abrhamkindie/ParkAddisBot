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

console.log('\nMAPS CHECKS PASSED ✅\n');
