# B1 — In-chat Map Pins + Directions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each parking spot as a native Telegram map pin and give a 🧭 Directions button (Google/native maps turn-by-turn) directly in the chat — no Mini App / ngrok.

**Architecture:** A pure helper builds a Google Maps directions URL. The results and detail inline keyboards gain a Directions URL button; the spot-detail handler also sends a native `location` message (a tappable map card). All coordinates already come from PostGIS on `findNearby`/`getById` rows.

**Tech Stack:** Node 20 ESM, grammY (`InlineKeyboard.url`, `ctx.replyWithLocation`). Tests are plain `node` + `node:assert` scripts.

**Branch/git:** continue on `feature/checkin-qr-scanner` (or a new branch). Commit with `git -c user.name='ParkAddis Dev' -c user.email='dev@parkaddis.local' commit -m "..."`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/utils/maps.js` | Google Maps directions URL | Create |
| `scripts/verify-maps.js` | Unit test (url + keyboard shapes) | Create |
| `src/bot/keyboards.js` | Directions buttons on results + detail keyboards | Modify |
| `src/bot/handlers/nearby.js` | Pass spot to detail keyboard; send native pin | Modify |
| `src/i18n/locales/en.json`, `am.json` | `common.directions` | Modify |

---

## Task 1: Directions URL helper (TDD)

**Files:** Create `src/utils/maps.js`, `scripts/verify-maps.js`

- [ ] **Step 1: Write the failing test** — create `scripts/verify-maps.js`:

```js
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

console.log('\nMAPS CHECKS PASSED ✅\n');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/verify-maps.js`
Expected: FAIL — `Cannot find module '../src/utils/maps.js'`.

- [ ] **Step 3: Create `src/utils/maps.js`**

```js
// Google Maps directions deep link to a destination. Opens the user's default
// maps app with turn-by-turn nav (origin = the user's current location).
export function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node scripts/verify-maps.js`
Expected: PASS — ends with `MAPS CHECKS PASSED ✅`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/maps.js scripts/verify-maps.js
git -c user.name='ParkAddis Dev' -c user.email='dev@parkaddis.local' commit -m "feat(utils): directions URL helper"
```

---

## Task 2: Directions buttons in keyboards (TDD)

**Files:** Modify `src/bot/keyboards.js`; extend `scripts/verify-maps.js`

Current code (for reference):
```js
export function nearbyResultsKeyboard(t, spots, { miniAppUrl } = {}) {
  const kb = new InlineKeyboard();
  spots.forEach((s, i) => {
    kb.text(t('nearby.book_spot', { index: i + 1 }), `spot:view:${s.id}`).row();
  });
  if (miniAppUrl) {
    kb.webApp(t('nearby.open_map'), miniAppUrl);
  }
  return kb;
}

export function spotDetailKeyboard(t, spotId) {
  return new InlineKeyboard()
    .text(t('spot.book_now'), `book:start:${spotId}`)
    .row()
    .text(t('common.back'), 'nearby:back');
}
```

- [ ] **Step 1: Extend the test** — in `scripts/verify-maps.js`, REPLACE the final block:
```js
console.log('\nMAPS CHECKS PASSED ✅\n');
```
with:
```js
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
```
Also change the top-level so `await import` is allowed: the script body already runs at module top level (ESM supports top-level await), so no wrapper is needed.

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/verify-maps.js`
Expected: FAIL at `results has a directions URL button` (no URL button yet).

- [ ] **Step 3: Update `src/bot/keyboards.js`**

Add the import after the existing `grammy` import at the top:
```js
import { directionsUrl } from '../utils/maps.js';
```

Replace `nearbyResultsKeyboard` with:
```js
export function nearbyResultsKeyboard(t, spots, { miniAppUrl } = {}) {
  const kb = new InlineKeyboard();
  spots.forEach((s, i) => {
    kb.text(t('nearby.book_spot', { index: i + 1 }), `spot:view:${s.id}`);
    if (s.lat != null && s.lng != null) {
      kb.url(t('common.directions'), directionsUrl(s.lat, s.lng));
    }
    kb.row();
  });
  if (miniAppUrl) {
    kb.webApp(t('nearby.open_map'), miniAppUrl);
  }
  return kb;
}
```

Replace `spotDetailKeyboard` with (note: signature now takes the spot object):
```js
export function spotDetailKeyboard(t, spot) {
  const kb = new InlineKeyboard().text(t('spot.book_now'), `book:start:${spot.id}`).row();
  if (spot.lat != null && spot.lng != null) {
    kb.url(t('common.directions'), directionsUrl(spot.lat, spot.lng)).row();
  }
  kb.text(t('common.back'), 'nearby:back');
  return kb;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node scripts/verify-maps.js`
Expected: PASS — `MAPS CHECKS PASSED ✅`.

- [ ] **Step 5: Commit**

```bash
git add src/bot/keyboards.js scripts/verify-maps.js
git -c user.name='ParkAddis Dev' -c user.email='dev@parkaddis.local' commit -m "feat(keyboards): directions buttons on results + detail"
```

---

## Task 3: Native pin on detail + i18n + wiring

**Files:** Modify `src/bot/handlers/nearby.js`, `src/i18n/locales/en.json`, `src/i18n/locales/am.json`

Current `spot:view` handler (for reference):
```js
  bot.callbackQuery(/^spot:view:(\d+)$/, async (ctx) => {
    const spotId = Number(ctx.match[1]);
    const spot = await spotsRepo.getById(spotId);
    await ctx.answerCallbackQuery();
    if (!spot) return ctx.reply(ctx.t('booking.spot_unavailable'));

    await ctx.reply(spotDetail(ctx.t, spot), {
      reply_markup: spotDetailKeyboard(ctx.t, spotId),
    });
  });
```

- [ ] **Step 1: Add the `common.directions` i18n key**

In `src/i18n/locales/en.json`, inside the `common` object, add after `"back": "« Back",`:
```json
    "directions": "🧭 Directions",
```
In `src/i18n/locales/am.json`, inside its `common` object, add after its `back` entry:
```json
    "directions": "🧭 አቅጣጫ",
```

- [ ] **Step 2: Validate JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json')); JSON.parse(require('fs').readFileSync('src/i18n/locales/am.json')); console.log('JSON ok')"
```
Expected: `JSON ok`

- [ ] **Step 3: Update the `spot:view` handler in `src/bot/handlers/nearby.js`**

Replace the handler body with:
```js
  bot.callbackQuery(/^spot:view:(\d+)$/, async (ctx) => {
    const spotId = Number(ctx.match[1]);
    const spot = await spotsRepo.getById(spotId);
    await ctx.answerCallbackQuery();
    if (!spot) return ctx.reply(ctx.t('booking.spot_unavailable'));

    await ctx.reply(spotDetail(ctx.t, spot), {
      reply_markup: spotDetailKeyboard(ctx.t, spot),
    });

    // Native map card the driver can tap to open maps.
    if (spot.lat != null && spot.lng != null) {
      await ctx.replyWithLocation(spot.lat, spot.lng);
    }
  });
```

- [ ] **Step 4: Verify the bot wires up (load test)**

Run:
```bash
node --check src/bot/handlers/nearby.js && BOT_TOKEN=123:STUB node -e "import('./src/bot/index.js').then(m => { m.createBot(); console.log('bot wiring ok'); }).catch(e => { console.error('LOAD ERROR', e.message); process.exit(1); })"
```
Expected: `bot wiring ok`

- [ ] **Step 5: Full unit test still green**

Run: `node scripts/verify-maps.js`
Expected: `MAPS CHECKS PASSED ✅`

- [ ] **Step 6: Commit**

```bash
git add src/bot/handlers/nearby.js src/i18n/locales/en.json src/i18n/locales/am.json
git -c user.name='ParkAddis Dev' -c user.email='dev@parkaddis.local' commit -m "feat(nearby): native location pin + directions on spot detail"
```

---

## Task 4: Live verification

**Files:** none

- [ ] **Step 1: Restart the bot** (only ONE instance must poll)

If you run `npm run dev` yourself, just restart it (Ctrl-C then `npm run dev`). Otherwise:
```bash
# from the project dir; do NOT use a pkill pattern that matches this shell
PID=$(pgrep -f "src/index.js" | head -1); [ -n "$PID" ] && kill "$PID"; sleep 2
nohup node src/index.js > /tmp/parkbot.log 2>&1 &
sleep 4 && cat /tmp/parkbot.log
```
Expected: `bot started (long polling)`, one instance.

- [ ] **Step 2: In Telegram**
  1. 🅿️ Find parking → share location.
  2. In the results, confirm each spot row has a **🧭 Directions** button; tap one → Google/native maps opens with directions.
  3. Tap **View #n** on a spot → confirm the detail message, a **native map pin** below it, and **Book / Directions / Back** buttons.

- [ ] **Step 3: Check logs**

Run: `grep -i error /tmp/parkbot.log || echo "no errors"`
Expected: `no errors`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** directions URL helper (Task 1), Directions buttons on results + detail keyboards (Task 2), native location pin on detail + `common.directions` i18n (Task 3), live check (Task 4). All spec sections mapped.
- **Type/name consistency:** `directionsUrl(lat,lng)` used identically in keyboards; `spotDetailKeyboard(t, spot)` new signature matches its only caller (updated in Task 3). `nearbyResultsKeyboard` still `(t, spots, {miniAppUrl})`.
- **No placeholders:** all steps contain full code/commands.
- **Coords:** `findNearby` and `getById` both already return `lat`/`lng`; guarded with `!= null`.
