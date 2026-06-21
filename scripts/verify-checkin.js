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

  console.log('\nUTILS CHECKS PASSED ✅\n');
}

main().catch((err) => { console.error('\n' + err.stack + '\n'); process.exitCode = 1; });
