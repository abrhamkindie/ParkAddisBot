# Design: Check-in subsystem — QR on reservation + owner scanner

**Date:** 2026-06-21
**Status:** Approved (pending spec review)
**Phase:** A of 2 (Phase B = interactive Mini App map + offer comparison, specced separately)

## Goal

When a driver reserves a parking spot, the bot gives them a **QR code**. The spot
owner **scans that QR** (with any phone camera or Telegram's built-in scanner) to
**check the driver in**. No custom camera app and no public HTTPS are required —
the QR encodes a Telegram deep link that opens the bot.

## Why this approach

- **Deep-link QR** (`t.me/<bot>?start=checkin_<token>`) means the owner uses any
  camera; scanning opens the bot, which performs the check-in. Works with the bot
  on local long-polling — no Mini App, no HTTPS, no camera permissions.
- Reuses the existing booking lifecycle (`reserved → active → completed`) and the
  existing `bookings` table; only additive schema changes.

## Decisions (resolved during brainstorming)

- "Multiple offers" = compare & pick from several spots (Phase B; not in scope here).
- Scanner mechanism = QR deep link scanned by any camera (not an in-app camera app).
- Checkout step ("Mark complete") = **included**.
- Who may check in = the **spot owner** OR an **admin** (`users.role = 'admin'`).

## Data model — `migrations/004_checkin.sql`

Additive, idempotent (matches existing `IF NOT EXISTS` style):

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_token  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at  TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_checkin_token
  ON bookings (checkin_token) WHERE checkin_token IS NOT NULL;
```

- `checkin_token` — the QR secret; random, unguessable, unique.
- `checked_in_at` / `checked_out_at` — lifecycle timestamps.

## New utilities

- `src/utils/code.js` → add `generateCheckinToken()`:
  `crypto.randomBytes(16).toString('base64url')` (~22 chars; deep-link-safe; the
  `start` payload allows `A–Z a–z 0–9 _ -`, max 64 chars).
- `src/utils/qr.js` (new) → `async checkinQrPng(text): Buffer` using the `qrcode`
  npm package (`qrcode.toBuffer(text, { width, margin })`).
- `src/utils/deeplink.js` (new) → `checkinLink(token)`:
  `https://t.me/${config.botUsername}?start=checkin_${token}`.

## Reservation flow changes

**`src/db/repositories/bookings.js`**
- Add `attachCheckinToken(id, token)` — `UPDATE bookings SET checkin_token=$2 WHERE id=$1 RETURNING *`.
- Add `getByCheckinToken(token)` — booking joined with spot (address, owner_id) and
  driver (name); also the owner's `telegram_id`, `language_pref`, `role`.
- Add `markCheckedIn(id)` — atomic transition (see service).
- Add `markCompleted(id)` — `UPDATE … SET status='completed', checked_out_at=now()
  WHERE id=$1 AND status='active' RETURNING *`.

**`src/services/bookingService.js`**
- `reserve()` generates a token, persists it via `attachCheckinToken`, and returns
  it on the `booking` object. (`create_booking` SQL function is left unchanged.)

**`src/bot/handlers/booking.js`** (`book:confirm`)
- After the existing reserved-confirmation text, send the QR as a photo:
  `ctx.replyWithPhoto(new InputFile(png), { caption, parse_mode: 'Markdown' })`.
- Caption: spot address, start–end, total, and the human-readable
  `confirmation_code` as a fallback if the QR can't be scanned.

## Scanner / check-in

**`src/services/checkinService.js`** (new)
```
checkIn({ scannerTelegramId, token }) -> { booking, spot, driver }
```
- Load booking via `getByCheckinToken`. Throw `CheckinError('NOT_FOUND')` if none.
- Authorize: scanner must be the spot owner's `telegram_id` OR a user with
  `role='admin'`. Else `CheckinError('NOT_OWNER')`.
- State checks (in this exact order, so every status is handled):
  - status `active` → `ALREADY_CHECKED_IN`
  - status NOT in (`reserved`, `confirmed`) → `INVALID_STATE`
    (covers `cancelled`, `completed`, `pending`, `expired`)
  - `now > end_time` → `EXPIRED`
- Transition atomically: `markCheckedIn(id)` =
  `UPDATE bookings SET status='active', checked_in_at=now()
   WHERE id=$1 AND status IN ('reserved','confirmed') RETURNING *`.
  If it returns no row (lost race), re-read and raise `ALREADY_CHECKED_IN`.
- `CheckinError` class with `.code` (mirrors `BookingError`).

**`src/bot/handlers/checkin.js`** (new) — `registerCheckin(bot)`
- Entry from `start.js`: when the `/start` payload matches `^checkin_(.+)$`, call
  `handleCheckin(ctx, token)`; otherwise the existing language-picker behavior runs.
- Success:
  - Reply to the **owner/admin**: driver name, address, start–end, total, plus a
    **"✅ Mark complete"** inline button → `checkin:complete:<bookingId>`.
  - Notify the **driver** via `ctx.api.sendMessage(driver.telegram_id, …)`
    ("✅ You're checked in at {address}"). Wrapped in try/catch (never fails the check-in).
- Errors: map each `CheckinError` code to a localized message.
- `checkin:complete:<id>` callback → `markCompleted(id)`; confirm to owner; if it
  returns no row, report it's not in a completable state.

**`src/bot/handlers/start.js`**
- Read the start payload from `ctx.match`. Branch to check-in when it matches
  `checkin_<token>`; keep the current behavior otherwise. (Single `start` command
  handler — no second registration.)

## "My bookings" polish — `src/bot/handlers/bookingsList.js`

- Continue listing recent bookings with their localized status.
- For `reserved`/`confirmed`/`active` bookings, add a **"📲 Show QR"** inline
  button (`booking:qr:<id>`) that re-sends that booking's QR photo (owner can scan
  anytime). Handler verifies the requester is the booking's driver.

## i18n — `src/i18n/locales/en.json` + `am.json`

New keys (English shown; Amharic mirrored):
- `booking.qr_caption` — "📲 Show this QR to the host at the entrance.\nSpot: {address}\n{start} → {end}\nTotal: {total} {currency}\nCode: *{code}*"
- `checkin.success_owner` — "✅ Checked in!\nDriver: {driver}\n{address}\n{start} → {end}\nTotal: {total} {currency}"
- `checkin.driver_notified` — "✅ You've been checked in at {address}. Enjoy your parking!"
- `checkin.complete_button` — "✅ Mark complete"
- `checkin.completed_owner` — "✅ Booking completed. Thank you!"
- `checkin.not_completable` — "This booking can't be completed (already closed or not checked in)."
- `checkin.err_not_found` — "This code is invalid or has expired."
- `checkin.err_not_owner` — "Only the spot's owner can check this booking in."
- `checkin.err_already` — "This booking is already checked in."
- `checkin.err_invalid_state` — "This booking is cancelled or already completed."
- `checkin.err_expired` — "This booking has expired."
- `booking.show_qr_button` — "📲 Show QR"
- `status.active` already exists ("Active"); add `status` coverage if any missing.

## Wiring — `src/bot/index.js`

- Register `registerCheckin(bot)` alongside the other handlers. Order: it owns the
  `checkin:*` callbacks; the `start` payload branch lives in `start.js`.

## Testing — `scripts/verify-checkin.js` (DB-backed smoke test)

Following `scripts/verify-core.js` conventions:
1. Seed/find an active spot + its owner; create a driver; `reserve()` → assert a
   `checkin_token` is present.
2. `checkIn({ scannerTelegramId: owner.telegram_id, token })` → assert status
   `active` and `checked_in_at` set.
3. `checkIn(...)` again → `ALREADY_CHECKED_IN`.
4. `checkIn` with a non-owner telegram id → `NOT_OWNER`.
5. A booking whose `end_time` is in the past → `EXPIRED`.
6. `markCompleted` → status `completed`, `checked_out_at` set.

## Out of scope (Phase B / later)

- Interactive Mini App map + offer comparison cards (Phase B).
- Payments / payment-gated check-in (existing later step).
- Ratings prompt after completion (schema already supports it).

## Risks / notes

- `BOT_USERNAME` must be set (it is: `ParkAddisBot`) for the deep link.
- Repo is currently **not** a git repository, so this spec is saved but not committed.
- `qrcode` is a small pure-JS dependency; no native build.
