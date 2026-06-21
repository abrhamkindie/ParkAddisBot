# ParkAddis — Telegram parking bot (Ethiopia)

Find and book parking spots in Addis Ababa over Telegram. Lightweight by
design (works from inline buttons without opening the Mini App), bilingual
(English / አማርኛ), and built for slow/unstable connections.

## Tech stack

- **Backend:** Node.js + Express
- **Bot:** [grammY](https://grammy.dev)
- **DB:** PostgreSQL + PostGIS (geo radius search)
- **Payments:** Chapa + manual transfer fallback _(added in a later step)_
- **Mini App:** HTML/JS + Telegram WebApp SDK + Leaflet/OSM _(later step)_
- **Admin dashboard:** React + Tailwind _(later step)_

## Project layout

```
migrations/        SQL schema (001), functions (002), dev seed (003)
scripts/           migrate.js · seed.js · verify-core.js
src/
  config/          env loading + validation
  db/              pg pool, transactions, repositories/
  i18n/            translator + locales/{en,am}.json   (no hardcoded text)
  services/        pricing, bookingService (business logic)
  bot/             grammY bot: handlers/ keyboards views/ middlewares/
  utils/           logger, code, geo, format
  server.js        Express (health/ready now; admin API later)
  index.js         entrypoint — starts bot + server
```

## Getting started

Requires Node ≥ 20 and Docker (for PostGIS).

```bash
cp .env.example .env          # then set BOT_TOKEN from @BotFather
npm install

npm run db:up                 # start PostGIS  (needs docker access; see note)
npm run db:migrate            # apply schema + functions
npm run db:seed               # sample Addis Ababa spots

npm start                     # boots Express + bot (long polling)
```

> **Docker note:** if `docker` needs sudo on your machine, either
> `sudo usermod -aG docker $USER` (then re-login) or run the compose command
> with sudo. The DB is published on host port **5433** (host 5432 is often
> taken by a native Postgres) — `DATABASE_URL` already points there.

Health checks: `GET /health` and `GET /ready` (the latter pings the DB).

### Verify the core works

```bash
node scripts/verify-core.js
```

Exercises the PostGIS nearby search, an atomic reservation, and the
capacity-based double-booking guard.

## What works today (build steps 1–2)

- `/start` → language selection (EN/AM), persisted per user
- "Find parking" → share location → PostGIS radius search → results as inline
  buttons, sorted by distance then price
- Spot detail → pick start time → duration → summary → **reserve**
  (atomic, capacity-aware, no double-booking) → confirmation code
- Host gets a Telegram notification on each reservation
- "My bookings" list

> No payment yet — confirming a booking just **reserves** the spot. Payment
> (Chapa + manual fallback) is the next build step.

## Roadmap (build order)

1. ✅ PostgreSQL schema + PostGIS
2. ✅ Bot core: language, location, nearby search, reserve flow
3. ⏳ Host onboarding + admin approval
4. ⏳ Chapa payment integration + manual fallback
5. ⏳ Mini App map UI (Leaflet/OSM)
6. ⏳ Admin dashboard (React): approvals, bookings map, revenue, payouts
7. ⏳ Cron jobs: booking expiry + rating prompt, reminders

## Configuration

All runtime config is in `.env` (see `.env.example`). Commission % is stored in
the `settings` table (key `commission_percent`) so it can change without a
redeploy; it falls back to `DEFAULT_COMMISSION_PERCENT`.

All user-facing text lives in `src/i18n/locales/*.json` — never hardcoded.
```
