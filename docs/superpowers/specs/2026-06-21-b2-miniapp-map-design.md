# Design: B2 — Interactive Mini App map (map-first location flow)

**Date:** 2026-06-21
**Status:** Approved
**Phase:** B2 of Phase B (B1 = in-chat pins+directions, already shipped)

## Goal

When a driver shares their location, the bot leads with a one-tap **🗺️ View spots
on map** button that opens a Telegram Mini App showing all nearby spots on an
interactive map (with distances), where the driver can tap a spot for directions
and continue to booking. The text list remains as a fallback below.

## Decisions (from brainstorming)

- Map-first: a prominent map button is the primary CTA; compact list kept as fallback.
- Tiles: Leaflet + OpenStreetMap (free, no key).
- Tunnel: ngrok at `https://spiritual-whomever-recollect.ngrok-free.dev` (`PUBLIC_URL`).
- Directions = "both": draw an OSRM route line in-map AND a Google Maps button.
- Booking from map hands back to the existing chat flow via `start=book_<id>`.
- API is public read-only (parking data); no initData auth in this phase.

## Components

### Backend — `src/server.js`
- Serve static Mini App at **`/miniapp/`** from `src/miniapp/` (express.static).
- **`GET /api/spots/nearby?lat&lng&radius`** → `{ fallback, spots: [...] }`, each spot:
  `{ id, address, price_per_hour, lat, lng, distance_m, rating_avg, rating_count,
  covered, guarded, ev_charging }`. Uses `spotsRepo.findNearby`, falling back to
  `findNearestAny` when nothing is within radius. 400 on bad coords; 500 on error.

### Frontend — `src/miniapp/{index.html,app.js,style.css}`
- Telegram WebApp SDK + Leaflet (CDN) + OSM tiles.
- Reads `lat`, `lng`, `bot` from the URL query.
- Renders the user's location + a price-labeled marker per spot.
- Tap a marker → bottom card: address, distance, price, rating, **📅 Book** + **🧭 Directions**.
- **Book** → `tg.openTelegramLink('https://t.me/<bot>?start=book_<id>')` then `tg.close()`.
- **Directions** → fetch OSRM route (`router.project-osrm.org`), draw a polyline, and
  show an "Open in Google Maps" link (`tg.openLink(directionsUrl)`).
- API fetches send header `ngrok-skip-browser-warning: true`.

### Bot — `src/bot/handlers/booking.js`, `start.js`, `nearby.js`
- `booking.js`: extract `beginBooking(ctx, spotId)` (loads spot, replies with the
  start-time keyboard); the `book:start:<id>` callback calls it. DRY.
- `start.js`: `/start book_<id>` → `beginBooking(ctx, spotId)`.
- `nearby.js`: `miniAppUrl(lat,lng)` also sets `bot=<botUsername>`. `runSearch` sends
  a **map CTA** message (webApp button) first when a Mini App URL exists, then the
  list (its keyboard no longer carries the map button to avoid duplication). Both the
  in-radius and the "nearest" fallback paths go through a shared `presentResults`.

### i18n — `en.json`, `am.json`
- `nearby.map_cta`: "🅿️ Found {count} spot(s) near you — tap to see them on the map:"

### Config — `.env`
- `PUBLIC_URL=https://spiritual-whomever-recollect.ngrok-free.dev`

## Testing
- `scripts/verify-api.js`: start the Express app (no bot), hit `/api/spots/nearby`
  for Bole coords, assert JSON shape + at least one spot with numeric lat/lng/distance.
- Bot wiring load test (`createBot()` with stub token).
- Live: `ngrok http 3000`, share location in Telegram, open map, tap a spot, test
  Directions + Book.

## Risks
- ngrok-free interstitial may block the initial Mini App HTML load; mitigation:
  swap `PUBLIC_URL` to a cloudflared tunnel (no interstitial).
- OSRM public demo server is rate-limited (dev only); route line degrades to the
  Google Maps button if the OSRM call fails.

## Out of scope
initData auth/hardening, in-app full booking UI, offline tiles, clustering.
