# Design: Host onboarding ("List your spot") + My spots

**Date:** 2026-06-22
**Status:** Approved
**Branch:** feature/checkin-qr-scanner

## Goal

Let a user list their parking spot through a guided chat wizard and manage their
listings. Replaces the `host.coming_soon` placeholder. Listed spots go **live
immediately** (`status='active'`) so they appear in driver searches right away
(there is no admin approval tool yet).

## Decisions (from brainstorming)

- Spots go live immediately on creation.
- Collect: location (required), name/address, price (required), capacity,
  amenities (covered/guarded/EV), photo.
- My spots actions: pause/resume, edit price, delete, view bookings.

## State management

New `src/bot/session.js`: an in-memory `Map<telegramId, session>` with
`getSession/setSession/clearSession`. Session shape:
`{ flow: 'list_spot' | 'edit_price', step, draft }`. In-memory is acceptable —
the flows are short; a bot restart just drops a half-finished draft.

An **early flow-router middleware** (registered right after `userMiddleware`,
before `registerNearby`) intercepts `message:location|text|photo` **only when the
user is mid-flow**, so e.g. sharing a location while listing doesn't trigger a
parking search. Rules:
- Cancel button → clear session, confirm, show menu.
- Any main-menu button (find parking, my bookings, …) → clear session, `next()`
  so the tapped button runs (tapping a menu item aborts the wizard).
- Otherwise route the message to the current step handler.
Callbacks (capacity/amenity/continue/manage) are normal `callbackQuery`
handlers that read/update the session; they don't need interception.

## Listing flow (steps)

1. `location` — reply keyboard with a request-location button + Cancel. On
   `message:location` → save lat/lng → step `address`. Non-location → nudge.
2. `address` — free text or Skip → save (or null) → step `price`.
3. `price` — parse number; must be > 0 and < 100000, else re-prompt → step
   `capacity`.
4. `capacity` — inline [1][2][3][5][10] or typed int (1..1000) → step
   `amenities`.
5. `amenities` — inline toggle keyboard (Covered/Guarded/EV) editing the draft in
   place, plus Continue → step `photo`.
6. `photo` — `message:photo` (largest size `file_id`) or Skip → **finalize**.

**Finalize:** `spotsRepo.create(...)` with `status='active'`; if the user's role
is `driver`, `usersRepo.setRole(id,'host')`; clear session; send a summary +
`replyWithLocation`; restore the main menu. Best-effort photo echo in summary.

## My spots

`hears(menu.my_spots)` → `spotsRepo.listByOwner`. Empty → prompt to list one.
Each spot → a message with address, price, capacity, amenities, availability
(✅ live / ⏸ paused), rating, and an inline keyboard:
- `host:toggle:<id>` → `setAvailability` (flip), re-render.
- `host:price:<id>` → start `edit_price` flow (ask new price → `updatePrice`).
- `host:del:<id>` → confirm (`host:delok:<id>` / `host:delno:<id>`) → `remove`.
- `host:bk:<id>` → upcoming bookings via `bookingsRepo.listBySpot`.
Every manage callback re-checks `spot.owner_id === ctx.dbUser.id`.

Also wire `menu.my_spots` into the main menu keyboard (currently only
`become_host` is shown).

## Repositories

- `spotsRepo.create({ ownerId, lat, lng, address, pricePerHour, capacity,
  covered, guarded, evCharging, photoFileId })` → INSERT, geom from
  `ST_MakePoint(lng,lat)::geography`, `photos` = `[file_id]` or `{}`,
  `status='active'`. Returns the row with lat/lng.
- `spotsRepo.remove(id, ownerId)` → DELETE … WHERE id AND owner_id RETURNING.
- `spotsRepo.updatePrice(id, ownerId, price)` → UPDATE … WHERE id AND owner_id.
- `bookingsRepo.listBySpot(spotId, limit)` → upcoming
  (`status IN reserved/confirmed/active AND end_time >= now()`) with driver name,
  ordered by start_time.

## i18n

New `host.*` keys in `en.json` + `am.json` for every prompt, validation message,
button, summary, and empty state. Reuses `common.cancel`, `common.back`,
`spot.covered/guarded/ev_charging`.

## Testing (`scripts/verify-*.js`)

- `scripts/verify-host.js`: against the DB — `create` a spot (active, correct
  geom → appears in `findNearby`), `updatePrice`, `setAvailability` hides it from
  search, `listBySpot` shows a booking, `remove` deletes it. Cleanup after.
- Bot load test still wires.
- Pure: a `validatePrice`/`validateCapacity` helper unit-tested.

## Out of scope

Admin approval queue, payments/payouts, availability windows (24/7 assumed),
editing location/amenities after creation, multiple photos.
