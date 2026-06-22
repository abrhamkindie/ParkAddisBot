# Design: Friendlier bot + auto-map of nearby available spots

**Date:** 2026-06-22
**Status:** Approved
**Branch:** feature/checkin-qr-scanner

## Goal

When a driver shares their location, the bot should **immediately** show the
nearby **available** spots on a map *in the chat* — no extra tap — while keeping
the interactive Mini App map as a one-tap bonus. Alongside this, tighten the
overall experience: skip re-asking language for returning users, clearer spot
cards, friendlier fallbacks, and light booking navigation.

## Decisions (from brainstorming)

- **Auto native pins + map button** (chosen approach). Telegram cannot
  auto-open a Mini App, so the immediate in-chat map is rendered as native
  Telegram **venue** pins (one per spot), which also work without the https
  tunnel. The Mini App stays behind a one-tap **🗺️ Open map view** button.
- **Pin cap = 5** (`MAX_INLINE_PINS`, configurable). One message per pin, so a
  cap avoids flooding; the map button covers the full set when there are more.
- Show **all four** friendliness areas: first-time flow, clearer spots,
  robustness, light booking nav.

## Components

### Data — already correct
`find_nearby_spots` (and `findNearestAny`) already return only `status='active'
AND is_available=true`, ordered by distance. No data-layer change needed.

### `src/utils/geo.js`
- Add `walkTime(meters)` → `"6 min walk"` (`ceil(m/80)` min, ~80 m/min walking
  pace; returns `''` when meters is null).

### `src/db/repositories/users.js`
- `upsertUser` returns `is_new` via `(xmax = 0) AS is_new` so `/start` can tell a
  brand-new user from a returning one. (On `INSERT`, `xmax = 0`; on `UPDATE` it
  is non-zero.)

### `src/bot/views/spot.js`
- New **pure** `buildNearbyPresentation(t, spots, { mapUrl, maxPins })` returning
  a plain plan object:
  ```
  {
    lead: { text, mapUrl|null, extraCount },   // header msg + optional map button
    pins: [{ lat, lng, title, address, spotId }],  // up to maxPins, nearest first
  }
  ```
  - `title` = `"{price} {currency}/hr · {walk}{rating}"` (rating appended only
    when `rating_count > 0`).
  - `address` = spot address + amenity badges (reuses `amenityBadges`).
  - Pure + deterministic → unit-testable without a bot/DB.
- `spotDetail` gains a `✅ Available now` line and a walk-time line.

### `src/bot/keyboards.js`
- `venuePinKeyboard(t, spot)` → inline `[📅 Book] [🧭 Directions] [ℹ️ Details]`
  per pin (`book:start:<id>`, directions url, `spot:view:<id>`).
- `welcomeKeyboard(t)` → inline `[🅿️ Find parking]` (`nearby:find`) for the
  welcome message.
- Booking keyboards gain light **« Back** steps: duration → start-time
  (`book:start:<id>`), summary → duration (`book:start_at:<id>:<offset>`).

### `src/bot/handlers/nearby.js`
- `presentResults` rewritten to use `buildNearbyPresentation`:
  1. Send the **lead** message (header + optional `🗺️ Open map view` webApp
     button; "+N more on the map" note when `spots.length > maxPins`).
  2. Send a **venue pin per spot** (`replyWithVenue`) with `venuePinKeyboard`.
  - Wrapped in try/catch: if venue sends fail, fall back to the existing text
    list (`nearbyResultsKeyboard`) so results are never lost.
- New callback `nearby:find` → same as the "Find parking" menu tap (asks for
  location). Lets the welcome button work.

### `src/bot/handlers/start.js`
- `/start` (no payload): if `ctx.dbUser.is_new` → ask language; else send the
  welcome straight away. `sendMainMenu` adds the inline `welcomeKeyboard`
  alongside the persistent reply menu.

### i18n — `en.json`, `am.json`
New keys: `nearby.pins_header` ("🅿️ Found {count} available spot(s) near you.
Tap a pin to book or get directions 👇"), `nearby.pins_more`
("➕ {count} more — open the map to see them all"), `spot.walk_time`
("🚶 {walk} away"), `spot.available_now` ("✅ Available now"),
`spot.details_button` ("ℹ️ Details"), `start.find_parking_cta`
("🅿️ Find parking near me"), `common.back` already exists.

### Config — `src/config/index.js`, `.env.example`
- `search.maxInlinePins = int(MAX_INLINE_PINS, 5)`.

## Testing (existing `scripts/verify-*.js` style, run via `node`)
- `scripts/verify-maps.js`: extend with `walkTime` cases and
  `buildNearbyPresentation` shape assertions (lead text, pin count capped at
  `maxPins`, pin title/address content, `extraCount`). Pure, no DB.
- `scripts/verify-core.js`: assert `upsertUser` exposes `is_new` (guarded to
  skip cleanly if no DB).
- Bot load test: `createBot()` with a stub token still wires without throwing.

## Out of scope
Server-rendered static map image, marker clustering, Mini App initData auth,
payments, host onboarding, live-location tracking.
