# Check-in Subsystem (QR + Owner Scanner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a driver reserves a spot, the bot sends a QR code; the spot owner (or an admin) scans it to check the driver in, advancing the booking through `reserved → active → completed`.

**Architecture:** The QR encodes a Telegram deep link (`t.me/<bot>?start=checkin_<token>`). Scanning it with any camera opens the bot, whose `/start` handler routes the payload to a check-in service that authorizes the scanner, validates booking state atomically, and notifies both parties. No HTTPS / Mini App required — works on local long-polling.

**Tech Stack:** Node 20 ESM, grammY, PostgreSQL (PostGIS), `qrcode` (new), `node:crypto`. Tests are DB-backed node scripts run with `node` + `node:assert` (the project's existing pattern: `scripts/verify-core.js`, `scripts/verify-triggers.js`).

---

## Notes before starting

- **Git:** this repo is **not** git-initialized. Either complete **Task 0** to enable the `git commit` steps, or skip every "Commit" step if you prefer not to use git. The rest of the plan is unaffected.
- **DB must be up:** `npm run db:up` (Postgres on host port 5433). The dev data is seeded via `npm run db:seed`.
- **Live bot:** a background instance may be running (`pgrep -f "node src/index.js"`). Restart it (Task 12) only after the code changes are in, to avoid running stale code.
- **pg returns BIGINT as strings.** Always compare ids with `String(a) === String(b)`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `migrations/004_checkin.sql` | Add `checkin_token`, `checked_in_at`, `checked_out_at` to `bookings` | Create |
| `src/utils/code.js` | Add `generateCheckinToken()` | Modify |
| `src/utils/deeplink.js` | Build the `t.me` check-in deep link | Create |
| `src/utils/qr.js` | Render a PNG QR buffer | Create |
| `src/db/repositories/bookings.js` | Token attach, parties lookups, status transitions | Modify |
| `src/services/bookingService.js` | Generate + attach token on reserve | Modify |
| `src/services/checkinService.js` | Authorize + validate + transition (check-in/complete) | Create |
| `src/bot/handlers/checkin.js` | Check-in entry + `checkin:complete` callback | Create |
| `src/bot/handlers/start.js` | Route `checkin_<token>` start payload | Modify |
| `src/bot/handlers/booking.js` | Send QR photo after `book:confirm` | Modify |
| `src/bot/handlers/bookingsList.js` | "Show QR" button + handler | Modify |
| `src/bot/index.js` | Register `registerCheckin` | Modify |
| `src/i18n/locales/en.json`, `am.json` | New strings | Modify |
| `scripts/verify-checkin.js` | DB-backed integration test | Create |

---

## Task 0 (optional): Initialize git for commit steps

**Files:** none (repo root)

- [ ] **Step 1: Init and make a baseline commit**

```bash
cd /home/abrham/Documents/Projects/parking-bot
git init
printf "node_modules\n.env\n*.log\n" >> .gitignore
git add -A
git commit -m "chore: baseline before check-in subsystem"
```

If you skip this task, also skip the "Commit" step in every task below.

---

## Task 1: Add the `qrcode` dependency

**Files:** Modify `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
npm install qrcode@^1.5.4
```

- [ ] **Step 2: Verify it resolves**

Run:
```bash
node -e "import('qrcode').then(m => console.log('qrcode ok', typeof m.default.toBuffer))"
```
Expected: `qrcode ok function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add qrcode dependency"
```

---

## Task 2: Database migration

**Files:** Create `migrations/004_checkin.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 004_checkin.sql  —  Check-in / QR support for bookings
-- Additive + idempotent.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_token  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at  TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;

-- The QR secret must be unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_checkin_token
  ON bookings (checkin_token) WHERE checkin_token IS NOT NULL;
```

- [ ] **Step 2: Apply it**

Run:
```bash
npm run db:migrate
```
Expected: a line `→ apply  004_checkin.sql` then `✓ done   004_checkin.sql` (and `All migrations applied.`).

- [ ] **Step 3: Verify the columns exist**

Run:
```bash
node -e "import('./src/db/index.js').then(async d => { const r = await d.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name IN ('checkin_token','checked_in_at','checked_out_at') ORDER BY column_name\"); console.log(r.rows.map(x=>x.column_name)); await d.close(); })"
```
Expected: `[ 'checked_in_at', 'checked_out_at', 'checkin_token' ]`

- [ ] **Step 4: Commit**

```bash
git add migrations/004_checkin.sql
git commit -m "feat(db): add check-in columns to bookings"
```

---

## Task 3: Token + deep link + QR utilities

**Files:** Modify `src/utils/code.js`; Create `src/utils/deeplink.js`, `src/utils/qr.js`; Test `scripts/verify-checkin.js`

- [ ] **Step 1: Write the failing test** (create `scripts/verify-checkin.js`)

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/verify-checkin.js`
Expected: FAIL — `does not provide an export named 'generateCheckinToken'` (or missing module `deeplink.js`).

- [ ] **Step 3: Add `generateCheckinToken` to `src/utils/code.js`**

Change the import line at the top and append the function:

```js
import { randomBytes, randomInt } from 'node:crypto';
```

```js
// Opaque, unguessable token for QR check-in deep links (~22 url-safe chars).
export function generateCheckinToken() {
  return randomBytes(16).toString('base64url');
}
```

- [ ] **Step 4: Create `src/utils/deeplink.js`**

```js
import { config } from '../config/index.js';

// Deep link the owner scans to check a booking in. Opens the bot with the
// payload, which start.js routes to the check-in handler.
export function checkinLink(token) {
  return `https://t.me/${config.botUsername}?start=checkin_${token}`;
}
```

- [ ] **Step 5: Create `src/utils/qr.js`**

```js
import QRCode from 'qrcode';

// Render `text` as a PNG QR code, returned as a Buffer (sent via InputFile).
export async function checkinQrPng(text) {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node scripts/verify-checkin.js`
Expected: PASS — ends with `UTILS CHECKS PASSED ✅`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/code.js src/utils/deeplink.js src/utils/qr.js scripts/verify-checkin.js
git commit -m "feat(utils): check-in token, deep link, and QR rendering"
```

---

## Task 4: Booking repository — token attach, parties lookup, transitions

**Files:** Modify `src/db/repositories/bookings.js`

- [ ] **Step 1: Append the new repo functions** (after the existing `updateStatus`)

```js
// Shared SELECT that joins a booking with its spot, driver, and owner.
const PARTIES_SELECT = `
  SELECT b.*, s.address, s.owner_id,
         d.name        AS driver_name,
         d.telegram_id AS driver_telegram_id,
         d.language_pref AS driver_language_pref,
         o.telegram_id AS owner_telegram_id,
         o.language_pref AS owner_language_pref,
         o.role        AS owner_role
  FROM bookings b
  JOIN spots s ON s.id = b.spot_id
  JOIN users d ON d.id = b.driver_id
  JOIN users o ON o.id = s.owner_id`;

// Store the QR secret on a booking.
export async function attachCheckinToken(id, token) {
  const { rows } = await query(
    `UPDATE bookings SET checkin_token = $2 WHERE id = $1 RETURNING *`,
    [id, token]
  );
  return rows[0] || null;
}

// Booking (with parties) by its QR token, or null.
export async function getByCheckinToken(token) {
  const { rows } = await query(`${PARTIES_SELECT} WHERE b.checkin_token = $1`, [token]);
  return rows[0] || null;
}

// Booking (with parties) by id, or null.
export async function getByIdWithParties(id) {
  const { rows } = await query(`${PARTIES_SELECT} WHERE b.id = $1`, [id]);
  return rows[0] || null;
}

// Atomic check-in: only succeeds from a pre-check-in state. Returns the updated
// row, or null if it wasn't in a check-in-able state (lost race / already done).
export async function markCheckedIn(id) {
  const { rows } = await query(
    `UPDATE bookings SET status = 'active', checked_in_at = now()
     WHERE id = $1 AND status IN ('reserved','confirmed') RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// Atomic completion: only from 'active'. Returns updated row or null.
export async function markCompleted(id) {
  const { rows } = await query(
    `UPDATE bookings SET status = 'completed', checked_out_at = now()
     WHERE id = $1 AND status = 'active' RETURNING *`,
    [id]
  );
  return rows[0] || null;
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/db/repositories/bookings.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/bookings.js
git commit -m "feat(db): booking parties lookup + check-in/complete transitions"
```

---

## Task 5: Reserve attaches a check-in token

**Files:** Modify `src/services/bookingService.js`; Test `scripts/verify-checkin.js`

- [ ] **Step 1: Add the reserve-token assertions to the test** (append a new section inside `main()` in `scripts/verify-checkin.js`, before the final success log)

```js
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
```

- [ ] **Step 2: Add the DB close at the end of `main()`** (so the script exits). Replace the final success block with:

```js
  console.log('\nALL CHECK-IN CHECKS PASSED ✅\n');
  const db = await import('../src/db/index.js');
  await db.close();
```

- [ ] **Step 3: Run to verify it fails**

Run: `node scripts/verify-checkin.js`
Expected: FAIL at `reserve() returns a checkin_token` (token is currently undefined).

- [ ] **Step 4: Update `reserve()` in `src/services/bookingService.js`**

Add the import at the top:

```js
import { generateConfirmationCode, generateCheckinToken } from '../utils/code.js';
```

Replace the tail of `reserve()` (from `const booking = await bookingsRepo.getById(bookingId);`) with:

```js
  const checkinToken = generateCheckinToken();
  await bookingsRepo.attachCheckinToken(bookingId, checkinToken);

  const booking = await bookingsRepo.getById(bookingId);
  return { booking, spot };
```

- [ ] **Step 5: Run to verify it passes**

Run: `node scripts/verify-checkin.js`
Expected: PASS through the reserve section.

- [ ] **Step 6: Commit**

```bash
git add src/services/bookingService.js scripts/verify-checkin.js
git commit -m "feat(booking): attach a check-in token on reserve"
```

---

## Task 6: Check-in service (authorize, validate, transition)

**Files:** Create `src/services/checkinService.js`; Test `scripts/verify-checkin.js`

- [ ] **Step 1: Add the check-in service assertions to the test** (append inside `main()` before the final success log; reuses `booking`, `near`, `usersRepo`, `spots` from Task 5)

```js
  section('checkinService');
  const { checkIn, complete, CheckinError } = await import('../src/services/checkinService.js');
  const bookingsRepo = await import('../src/db/repositories/bookings.js');

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/verify-checkin.js`
Expected: FAIL — cannot find module `../src/services/checkinService.js`.

- [ ] **Step 3: Create `src/services/checkinService.js`**

```js
import * as bookingsRepo from '../db/repositories/bookings.js';

export class CheckinError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // NOT_FOUND | NOT_OWNER | ALREADY_CHECKED_IN | INVALID_STATE | EXPIRED | NOT_COMPLETABLE
  }
}

function authorize(booking, scannerTelegramId, scannerRole) {
  const isOwner = String(booking.owner_telegram_id) === String(scannerTelegramId);
  const isAdmin = scannerRole === 'admin';
  if (!isOwner && !isAdmin) throw new CheckinError('NOT_OWNER');
}

// Check a booking in by its QR token. Returns { booking } (with joined parties).
export async function checkIn({ scannerTelegramId, scannerRole, token }) {
  const booking = await bookingsRepo.getByCheckinToken(token);
  if (!booking) throw new CheckinError('NOT_FOUND');

  authorize(booking, scannerTelegramId, scannerRole);

  if (booking.status === 'active') throw new CheckinError('ALREADY_CHECKED_IN');
  if (!['reserved', 'confirmed'].includes(booking.status)) throw new CheckinError('INVALID_STATE');
  if (new Date(booking.end_time).getTime() < Date.now()) throw new CheckinError('EXPIRED');

  const updated = await bookingsRepo.markCheckedIn(booking.id);
  if (!updated) throw new CheckinError('ALREADY_CHECKED_IN'); // lost a concurrent race

  // Keep joined fields (address, driver_name, …) and overlay the new status/timestamp.
  return { booking: { ...booking, ...updated } };
}

// Mark an active booking complete (owner/admin only).
export async function complete({ bookingId, scannerTelegramId, scannerRole }) {
  const booking = await bookingsRepo.getByIdWithParties(bookingId);
  if (!booking) throw new CheckinError('NOT_FOUND');

  authorize(booking, scannerTelegramId, scannerRole);

  const updated = await bookingsRepo.markCompleted(bookingId);
  if (!updated) throw new CheckinError('NOT_COMPLETABLE');
  return updated;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node scripts/verify-checkin.js`
Expected: PASS — ends with `ALL CHECK-IN CHECKS PASSED ✅`.

- [ ] **Step 5: Commit**

```bash
git add src/services/checkinService.js scripts/verify-checkin.js
git commit -m "feat(checkin): authorize + validate + transition service"
```

---

## Task 7: i18n strings

**Files:** Modify `src/i18n/locales/en.json`, `src/i18n/locales/am.json`

- [ ] **Step 1: Add to the `booking` object in `en.json`** (after `"none": ...`)

```json
    "qr_caption": "📲 Show this QR to the host at the entrance.\nSpot: {address}\n{start} → {end}\nTotal: {total} {currency}\nCode: *{code}*",
    "show_qr_button": "📲 Show QR",
```

- [ ] **Step 2: Add a new top-level `checkin` object in `en.json`** (e.g., after the `host` object)

```json
  "checkin": {
    "success_owner": "✅ Checked in!\nDriver: {driver}\n{address}\n{start} → {end}\nTotal: {total} {currency}",
    "driver_notified": "✅ You've been checked in at {address}. Enjoy your parking!",
    "complete_button": "✅ Mark complete",
    "completed_owner": "✅ Booking completed. Thank you!",
    "not_completable": "This booking can't be completed (already closed or not checked in).",
    "err_not_found": "This code is invalid or has expired.",
    "err_not_owner": "Only the spot's owner can check this booking in.",
    "err_already": "This booking is already checked in.",
    "err_invalid_state": "This booking is cancelled or already completed.",
    "err_expired": "This booking has expired."
  }
```

- [ ] **Step 3: Add the same keys to `am.json`** — `booking.qr_caption`, `booking.show_qr_button`, and a `checkin` object:

```json
    "qr_caption": "📲 ይህን QR በመግቢያው ላይ ለአስተናጋጁ ያሳዩ።\nቦታ: {address}\n{start} → {end}\nጠቅላላ: {total} {currency}\nኮድ: *{code}*",
    "show_qr_button": "📲 QR አሳይ",
```

```json
  "checkin": {
    "success_owner": "✅ ገብቷል!\nሹፌር: {driver}\n{address}\n{start} → {end}\nጠቅላላ: {total} {currency}",
    "driver_notified": "✅ በ{address} ገብተዋል። መልካም ማቆሚያ!",
    "complete_button": "✅ ጨርስ",
    "completed_owner": "✅ ቦታ ማስያዙ ተጠናቋል። እናመሰግናለን!",
    "not_completable": "ይህ ማስያዝ ሊጠናቀቅ አይችልም (አስቀድሞ ተዘግቷል ወይም አልገባም)።",
    "err_not_found": "ይህ ኮድ ልክ ያልሆነ ወይም ጊዜው ያለፈበት ነው።",
    "err_not_owner": "ይህን ማስያዝ ማስገባት የሚችለው የቦታው ባለቤት ብቻ ነው።",
    "err_already": "ይህ ማስያዝ አስቀድሞ ገብቷል።",
    "err_invalid_state": "ይህ ማስያዝ ተሰርዟል ወይም አስቀድሞ ተጠናቋል።",
    "err_expired": "የዚህ ማስያዝ ጊዜ አልፏል።"
  }
```

- [ ] **Step 4: Validate JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json')); JSON.parse(require('fs').readFileSync('src/i18n/locales/am.json')); console.log('JSON ok')"
```
Expected: `JSON ok`

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/am.json
git commit -m "feat(i18n): check-in + QR strings (en, am)"
```

---

## Task 8: Check-in handler + start routing + wiring

**Files:** Create `src/bot/handlers/checkin.js`; Modify `src/bot/handlers/start.js`, `src/bot/index.js`

- [ ] **Step 1: Create `src/bot/handlers/checkin.js`**

```js
import { InlineKeyboard } from 'grammy';
import { checkIn, complete, CheckinError } from '../../services/checkinService.js';
import { getTranslator } from '../../i18n/index.js';
import { formatDateTime, formatMoney, currency } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';

function errMessage(t, code) {
  switch (code) {
    case 'NOT_FOUND': return t('checkin.err_not_found');
    case 'NOT_OWNER': return t('checkin.err_not_owner');
    case 'ALREADY_CHECKED_IN': return t('checkin.err_already');
    case 'INVALID_STATE': return t('checkin.err_invalid_state');
    case 'EXPIRED': return t('checkin.err_expired');
    default: return t('common.error_generic');
  }
}

// Entry from start.js when the /start payload is checkin_<token>.
export async function handleCheckin(ctx, token) {
  const t = ctx.t;
  let booking;
  try {
    ({ booking } = await checkIn({
      scannerTelegramId: ctx.from.id,
      scannerRole: ctx.dbUser?.role,
      token,
    }));
  } catch (err) {
    if (err instanceof CheckinError) return ctx.reply(errMessage(t, err.code));
    logger.error('checkin failed', { error: err.message });
    return ctx.reply(t('common.error_generic'));
  }

  const kb = new InlineKeyboard().text(t('checkin.complete_button'), `checkin:complete:${booking.id}`);
  await ctx.reply(
    t('checkin.success_owner', {
      driver: booking.driver_name || '—',
      address: booking.address || '—',
      start: formatDateTime(booking.start_time),
      end: formatDateTime(booking.end_time),
      total: formatMoney(booking.total_price),
      currency,
    }),
    { reply_markup: kb }
  );

  // Notify the driver in their own language (best-effort).
  try {
    const dt = getTranslator(booking.driver_language_pref || 'en');
    await ctx.api.sendMessage(
      Number(booking.driver_telegram_id),
      dt('checkin.driver_notified', { address: booking.address || '—' })
    );
  } catch (err) {
    logger.warn('driver notify failed', { error: err.message });
  }
}

export function registerCheckin(bot) {
  bot.callbackQuery(/^checkin:complete:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const bookingId = Number(ctx.match[1]);
    try {
      await complete({
        bookingId,
        scannerTelegramId: ctx.from.id,
        scannerRole: ctx.dbUser?.role,
      });
      await ctx.reply(ctx.t('checkin.completed_owner'));
    } catch (err) {
      if (err instanceof CheckinError) {
        const msg = err.code === 'NOT_OWNER' ? ctx.t('checkin.err_not_owner') : ctx.t('checkin.not_completable');
        return ctx.reply(msg);
      }
      logger.error('complete failed', { error: err.message });
      return ctx.reply(ctx.t('common.error_generic'));
    }
  });
}
```

- [ ] **Step 2: Route the start payload in `src/bot/handlers/start.js`**

Add the import at the top:

```js
import { handleCheckin } from './checkin.js';
```

Replace the body of the `bot.command('start', …)` handler with:

```js
  bot.command('start', async (ctx) => {
    const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (payload.startsWith('checkin_')) {
      return handleCheckin(ctx, payload.slice('checkin_'.length));
    }
    const t = ctx.t;
    // First-time-ish: always offer language on /start, it's cheap and clear.
    await ctx.reply(t('start.choose_language', { app: config.appName }), {
      reply_markup: languageKeyboard(t),
    });
  });
```

- [ ] **Step 3: Register the handler in `src/bot/index.js`**

Add the import alongside the other handler imports:

```js
import { registerCheckin } from './handlers/checkin.js';
```

Add the registration call right after `registerBookingsList(bot);`:

```js
  registerCheckin(bot);
```

- [ ] **Step 4: Syntax check**

Run:
```bash
node --check src/bot/handlers/checkin.js && node --check src/bot/handlers/start.js && node --check src/bot/index.js && echo ok
```
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add src/bot/handlers/checkin.js src/bot/handlers/start.js src/bot/index.js
git commit -m "feat(checkin): owner scan handler + start deep-link routing"
```

---

## Task 9: Send the QR after a confirmed reservation

**Files:** Modify `src/bot/handlers/booking.js`

- [ ] **Step 1: Add imports at the top of `src/bot/handlers/booking.js`**

```js
import { InputFile } from 'grammy';
import { checkinQrPng } from '../../utils/qr.js';
import { checkinLink } from '../../utils/deeplink.js';
```

- [ ] **Step 2: Send the QR inside the `book:confirm` handler**

Locate, in the `book:confirm` handler, the line:

```js
      await ctx.editMessageText(text, { parse_mode: 'Markdown' });
      await notifyHost(ctx, spot, booking);
```

Replace it with:

```js
      await ctx.editMessageText(text, { parse_mode: 'Markdown' });

      // Send the scannable QR for entrance check-in (best-effort).
      try {
        if (booking.checkin_token) {
          const png = await checkinQrPng(checkinLink(booking.checkin_token));
          await ctx.replyWithPhoto(new InputFile(png, 'checkin.png'), {
            caption: ctx.t('booking.qr_caption', {
              address: spot.address || '—',
              start: formatDateTime(booking.start_time),
              end: formatDateTime(booking.end_time),
              total: formatMoney(booking.total_price),
              currency,
              code: booking.confirmation_code,
            }),
            parse_mode: 'Markdown',
          });
        }
      } catch (err) {
        logger.warn('qr send failed', { error: err.message });
      }

      await notifyHost(ctx, spot, booking);
```

- [ ] **Step 3: Syntax check**

Run: `node --check src/bot/handlers/booking.js && echo ok`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add src/bot/handlers/booking.js
git commit -m "feat(booking): send check-in QR after reservation"
```

---

## Task 10: "Show QR" button in My Bookings

**Files:** Modify `src/bot/handlers/bookingsList.js`

- [ ] **Step 1: Replace the contents of `src/bot/handlers/bookingsList.js`**

```js
import { InlineKeyboard, InputFile } from 'grammy';
import * as bookingsRepo from '../../db/repositories/bookings.js';
import * as spotsRepo from '../../db/repositories/spots.js';
import { formatDateTime, formatMoney, currency } from '../../utils/format.js';
import { allTranslations } from '../../i18n/index.js';
import { checkinQrPng } from '../../utils/qr.js';
import { checkinLink } from '../../utils/deeplink.js';
import { logger } from '../../utils/logger.js';

const QR_STATUSES = new Set(['reserved', 'confirmed', 'active']);

// "My bookings" menu button → list recent bookings for this driver.
export function registerBookingsList(bot) {
  bot.hears(allTranslations('menu.my_bookings'), async (ctx) => {
    const t = ctx.t;
    const rows = await bookingsRepo.listByDriver(ctx.dbUser.id, 10);
    if (!rows.length) return ctx.reply(t('booking.none'));

    const items = rows.map((b) =>
      t('booking.list_item', {
        code: b.confirmation_code || '—',
        address: b.address || '—',
        start: formatDateTime(b.start_time),
        end: formatDateTime(b.end_time),
        status: t(`status.${b.status}`),
        total: formatMoney(b.total_price),
        currency,
      })
    );

    // One "Show QR" button per still-scannable booking.
    const kb = new InlineKeyboard();
    for (const b of rows) {
      if (QR_STATUSES.has(b.status) && b.checkin_token) {
        kb.text(`${t('booking.show_qr_button')} · ${b.confirmation_code || b.id}`, `booking:qr:${b.id}`).row();
      }
    }
    const hasButtons = kb.inline_keyboard.length > 0;

    await ctx.reply(items.join('\n\n'), hasButtons ? { reply_markup: kb } : undefined);
  });

  // Re-send a booking's QR (driver-only).
  bot.callbackQuery(/^booking:qr:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = Number(ctx.match[1]);
    const b = await bookingsRepo.getById(id);
    if (!b || String(b.driver_id) !== String(ctx.dbUser.id) || !b.checkin_token) {
      return ctx.reply(ctx.t('common.error_generic'));
    }
    try {
      const spot = await spotsRepo.getById(b.spot_id);
      const png = await checkinQrPng(checkinLink(b.checkin_token));
      await ctx.replyWithPhoto(new InputFile(png, 'checkin.png'), {
        caption: ctx.t('booking.qr_caption', {
          address: spot?.address || '—',
          start: formatDateTime(b.start_time),
          end: formatDateTime(b.end_time),
          total: formatMoney(b.total_price),
          currency,
          code: b.confirmation_code,
        }),
        parse_mode: 'Markdown',
      });
    } catch (err) {
      logger.warn('show qr failed', { error: err.message });
      await ctx.reply(ctx.t('common.error_generic'));
    }
  });
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/bot/handlers/bookingsList.js && echo ok`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/bot/handlers/bookingsList.js
git commit -m "feat(bookings): show-QR button in My Bookings"
```

---

## Task 11: Full regression run

**Files:** none (runs `scripts/verify-checkin.js` and the existing checks)

- [ ] **Step 1: Run the check-in test**

Run: `node scripts/verify-checkin.js`
Expected: ends with `ALL CHECK-IN CHECKS PASSED ✅`.

- [ ] **Step 2: Run the existing core + trigger tests (no regressions)**

Run:
```bash
node scripts/verify-core.js && node scripts/verify-triggers.js
```
Expected: `ALL CHECKS PASSED ✅` and `ALL TRIGGER CHECKS PASSED ✅`.

- [ ] **Step 3: Commit** (only if anything changed)

```bash
git add -A && git commit -m "test: full check-in regression pass" || echo "nothing to commit"
```

---

## Task 12: Live manual verification

**Files:** none

- [ ] **Step 1: Restart the bot with the new code**

```bash
pkill -f "node src/index.js"; sleep 2
nohup node src/index.js > /tmp/parkbot.log 2>&1 &
sleep 4 && cat /tmp/parkbot.log
```
Expected: `database connected`, `HTTP listening`, `bot started (long polling)`, exactly one instance.

- [ ] **Step 2: Drive the flow in Telegram**

  1. `/start` → pick a language → **🅿️ Find parking** → share location → tap **Book #n** → choose start/duration → **Confirm**.
  2. Confirm you receive the **QR photo** with the caption (code, spot, time, total).
  3. From a **second Telegram account that owns the spot** (seeded owner, or set yourself as the spot owner), scan the QR with the phone camera / Telegram's scanner.
  4. Expected: the owner sees **"✅ Checked in!"** with a **Mark complete** button; the driver receives **"✅ You've been checked in…"**.
  5. Tap **Mark complete** → owner sees **"✅ Booking completed."**
  6. As the driver, open **📋 My bookings** → tap **📲 Show QR** → the QR is re-sent.

- [ ] **Step 3: Tail logs for errors**

Run: `grep -i error /tmp/parkbot.log || echo "no errors"`
Expected: `no errors` (or only expected ones).

---

## Self-Review (completed by plan author)

- **Spec coverage:** migration (Task 2), token/QR/deeplink utils (Task 3), reserve attaches token (Task 5), repo lookups/transitions (Task 4), check-in service with all 5 error codes + complete (Task 6), handler + start routing + wiring (Task 8), QR on confirm (Task 9), Show-QR in My Bookings (Task 10), i18n en+am (Task 7), tests (Tasks 3/5/6/11), live verify (Task 12). All spec sections mapped.
- **Type/name consistency:** `generateCheckinToken`, `checkinLink`, `checkinQrPng`, `attachCheckinToken`, `getByCheckinToken`, `getByIdWithParties`, `markCheckedIn`, `markCompleted`, `checkIn`, `complete`, `CheckinError`, `handleCheckin`, `registerCheckin` — used identically across tasks. Error codes: `NOT_FOUND | NOT_OWNER | ALREADY_CHECKED_IN | INVALID_STATE | EXPIRED | NOT_COMPLETABLE`.
- **No placeholders:** every code/test/command step contains full content.
- **BIGINT handling:** all id/telegram_id comparisons use `String(...) === String(...)`.
