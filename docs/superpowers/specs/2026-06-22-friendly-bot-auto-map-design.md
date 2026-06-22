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

- **Single map image with all pins** (revised approach). Like Google Maps search
  results: one map showing every nearby spot at once, rather than a stack of
  individual pin messages. Telegram's native location/venue message only shows
  ONE pin, so the multi-pin map is rendered server-side as a **static PNG** (all
  spots numbered + the driver's location) and sent as a single photo in chat.
- **Free OSM tiles, no API key** — rendered with `staticmaps` (composes the same
  OpenStreetMap tiles the Mini App uses) + `sharp` for the numbered pin icons.
- The interactive **Mini App** map stays behind a one-tap **🗺️ Open interactive
  map** button under the photo; the numbered caption + per-spot Book/Directions
  buttons line up with the pins. Falls back to the text list if rendering fails.
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

### `src/utils/staticMap.js` (new)
- `renderNearbyMap({ lat, lng, spots })` → PNG `Buffer`. Plots every spot with a
  numbered red teardrop pin (order = `spots`, 1-based) and a blue "you are here"
  dot, auto-fitting all points. Pin/dot icons are tiny SVGs rasterised once with
  `sharp` and cached under the OS temp dir. Throws if tiles/render fail so callers
  can fall back to the text list.

### `src/bot/views/spot.js`
- New **pure** `buildMapCaption(t, spots, { headerText })` → header + numbered
  list (`spotLine` per spot) whose numbers match the map pins. Unit-testable.
- `spotDetail` gains a `✅ Available now` line and a walk-time line.

### `src/bot/keyboards.js`
- `welcomeKeyboard(t)` → inline `[🅿️ Find parking]` (`nearby:find`) for the
  welcome message.
- Booking keyboards gain light **« Back** steps: duration → start-time
  (`book:to_start:<id>`), summary → duration (`book:start_at:<id>:<offset>`).

### `src/bot/handlers/nearby.js`
- `presentResults` renders the static map and sends ONE photo
  (`replyWithPhoto`) with the numbered caption and a `nearbyResultsKeyboard`
  (per-spot Book + Directions, plus the `🗺️ Open interactive map` web-app button
  when https is configured). Wrapped in try/catch → falls back to the text list
  (`presentList`) if rendering fails, so results are never lost.
- New callback `nearby:find` → same as the "Find parking" menu tap (asks for
  location). Lets the welcome button work.

### `src/bot/handlers/start.js`
- `/start` (no payload): if `ctx.dbUser.is_new` → ask language; else send the
  welcome straight away. `sendMainMenu` adds the inline `welcomeKeyboard`
  alongside the persistent reply menu.

### i18n — `en.json`, `am.json`
New keys: `nearby.map_header` ("🅿️ Found {count} available spot(s) near you.
Numbers below match the map 👇"), `nearby.map_header_far` (the "nearest" variant),
`spot.walk_time`, `spot.available_now`, `start.welcome_back`,
`start.find_parking_cta`, `start.menu_ready`. `nearby.open_map` reworded to
"Open interactive map". `common.back` already exists.

### Dependencies
- `staticmaps` (OSM static map composition) + `sharp` (icon rasterisation).

## Testing (existing `scripts/verify-*.js` style, run via `node`)
- `scripts/verify-maps.js`: `walkMinutes` cases, `buildMapCaption` numbering, and
  `nearbyResultsKeyboard`/`welcomeKeyboard` wiring. Pure, no DB.
- `scripts/verify-staticmap.js`: render a 3-pin map and assert a PNG buffer;
  skips cleanly if OSM tiles are unreachable.
- DB check: `upsertUser` exposes `is_new` (true on insert, false on update).
- Bot load test: `createBot()` with a stub token still wires without throwing.

## Out of scope
Marker clustering, Mini App initData auth, payments, host onboarding,
live-location tracking.
