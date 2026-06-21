# Design: B1 — In-chat map pins + directions

**Date:** 2026-06-21
**Status:** Approved (pending spec review)
**Phase:** B1 of Phase B (B2 = interactive Mini App map, specced separately)

## Goal

Show parking spots on a map and give directions to them **inside the chat**, with
no Mini App / ngrok dependency. A driver searching for parking should be able to
(a) tap a real Telegram map pin for a spot and (b) get turn-by-turn directions in
their phone's maps app.

## Why this approach

Telegram natively renders a **location** message as a tappable map card, and a URL
button can hand off to Google/native maps for navigation. Both work with the bot
on local long-polling — no hosting, no API key, no frontend. This is the robust
fallback that stays working even when the B2 Mini App / ngrok is down.

## Decisions (from brainstorming)

- Directions = open Google/native maps via a `🧭 Directions` URL button
  (`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`). (The in-map
  route line is a B2 concern.)
- Booking still flows through the existing chat flow (unchanged here).
- Native pins: yes — a Telegram location pin on the spot detail view.

## Scope (files)

| File | Responsibility | Action |
|------|----------------|--------|
| `src/utils/maps.js` | Build a Google Maps directions URL | Create |
| `src/bot/keyboards.js` | Add Directions buttons to results + detail keyboards | Modify |
| `src/bot/handlers/nearby.js` | Send a native location pin on spot detail; pass spot to detail keyboard | Modify |
| `src/i18n/locales/en.json`, `am.json` | `common.directions` string | Modify |
| `scripts/verify-maps.js` | Unit test for the URL + keyboard shape | Create |

## Details

### `src/utils/maps.js` (new)
```js
// Google Maps directions deep link to a destination. Opens the user's default
// maps app with turn-by-turn nav (origin = the user's current location).
export function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
```

### `src/bot/keyboards.js`
- Import `directionsUrl` from `../utils/maps.js`.
- `nearbyResultsKeyboard(t, spots, { miniAppUrl })`: per spot, put the existing
  `View/Book #n` button (`spot:view:<id>`) and, when the spot has coords, a
  `🧭 Directions` **URL button** on the same row, then `.row()`. Keep the optional
  `webApp` map-view button at the bottom.
- `spotDetailKeyboard` signature changes from `(t, spotId)` to `(t, spot)` so it
  can build the Directions URL. Layout: `📅 Book this spot` (`book:start:<spot.id>`)
  / `🧭 Directions` (URL, when coords present) / `« Back` (`nearby:back`).

### `src/bot/handlers/nearby.js`
- The `spot:view` handler already loads the spot via `spotsRepo.getById` (which
  returns `lat`/`lng`). Update the call to `spotDetailKeyboard(ctx.t, spot)`.
- After sending the detail text, also send a native pin:
  `if (spot.lat != null && spot.lng != null) await ctx.replyWithLocation(spot.lat, spot.lng);`

### i18n (`en.json`, `am.json`)
- `common.directions`: `"🧭 Directions"` (en) / `"🧭 አቅጣጫ"` (am).

## Testing — `scripts/verify-maps.js`
- `directionsUrl(8.99, 38.79)` equals
  `https://www.google.com/maps/dir/?api=1&destination=8.99,38.79`.
- `nearbyResultsKeyboard(t, [{id:1,lat:8.9,lng:38.7}], {})` produces an inline
  keyboard containing a URL button whose `url` matches the directions link
  (assert by scanning `kb.inline_keyboard` for a button with that `url`).
- `spotDetailKeyboard(t, {id:1,lat:8.9,lng:38.7})` contains a `book:start:1`
  callback button and a directions URL button.
- Uses a stub translator `t = (k) => k` (no DB, no network).

## Out of scope (B2)
Interactive Leaflet map, Express `/miniapp/` + `/api/spots/nearby`, in-map route
line (OSRM), map→chat book hand-off via `start=book_<id>`.

## Risks / notes
- `replyWithLocation` sends a separate message (the pin) in addition to the detail
  text — acceptable; it's the native "map card".
- All coordinate values come straight from PostGIS (`ST_Y`/`ST_X`); already present
  on `findNearby` rows and `getById`.
