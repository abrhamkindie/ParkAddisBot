-- ============================================================
-- 001_init.sql  —  Core schema for the parking bot
-- Requires: PostgreSQL 14+ with PostGIS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- lets us combine ints + ranges in exclusion constraints
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role        AS ENUM ('driver', 'host', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE language_pref    AS ENUM ('en', 'am');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE spot_status      AS ENUM ('pending_approval', 'active', 'suspended', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status   AS ENUM ('pending', 'reserved', 'confirmed', 'active', 'completed', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status   AS ENUM ('unpaid', 'pending', 'awaiting_review', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method   AS ENUM ('chapa', 'manual', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payout_status    AS ENUM ('pending', 'sent', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dispute_status   AS ENUM ('open', 'resolved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- updated_at helper
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- users  (Telegram users: drivers & hosts; admins are separate)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  telegram_id   BIGINT      NOT NULL UNIQUE,
  name          TEXT,
  username      TEXT,
  phone         TEXT,
  role          user_role   NOT NULL DEFAULT 'driver',
  language_pref language_pref NOT NULL DEFAULT 'en',
  is_banned     BOOLEAN     NOT NULL DEFAULT false,
  ban_reason    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- admin_users  (dashboard login via email + password / JWT)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'admin',   -- 'admin' | 'superadmin'
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_admin_users_updated ON admin_users;
CREATE TRIGGER trg_admin_users_updated BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- spots
--   geom is geography(Point) so ST_DWithin / ST_Distance work in METERS.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spots (
  id              BIGSERIAL PRIMARY KEY,
  owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  geom            geography(Point, 4326) NOT NULL,
  address         TEXT,
  price_per_hour  NUMERIC(10,2) NOT NULL CHECK (price_per_hour >= 0),
  capacity        INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  photos          TEXT[] NOT NULL DEFAULT '{}',     -- Telegram file_ids
  covered         BOOLEAN NOT NULL DEFAULT false,
  guarded         BOOLEAN NOT NULL DEFAULT false,
  ev_charging     BOOLEAN NOT NULL DEFAULT false,
  amenities       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          spot_status NOT NULL DEFAULT 'pending_approval',
  is_available    BOOLEAN NOT NULL DEFAULT true,    -- host manual on/off toggle
  rating_avg      NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spots_geom   ON spots USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_spots_owner  ON spots (owner_id);
CREATE INDEX IF NOT EXISTS idx_spots_status ON spots (status);

DROP TRIGGER IF EXISTS trg_spots_updated ON spots;
CREATE TRIGGER trg_spots_updated BEFORE UPDATE ON spots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- availability_windows  (recurring weekly hours; none = 24/7)
--   day_of_week: 0=Sunday .. 6=Saturday
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS availability_windows (
  id          BIGSERIAL PRIMARY KEY,
  spot_id     BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_avail_spot ON availability_windows (spot_id);

-- ------------------------------------------------------------
-- bookings
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id                BIGSERIAL PRIMARY KEY,
  driver_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id           BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,
  status            booking_status NOT NULL DEFAULT 'pending',
  total_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status    payment_status NOT NULL DEFAULT 'unpaid',
  confirmation_code TEXT,
  cancelled_reason  TEXT,
  rating_prompted   BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_bookings_spot     ON bookings (spot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_driver   ON bookings (driver_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_timerange ON bookings USING GIST (
  tstzrange(start_time, end_time)
);
-- Active bookings that consume capacity, used by the overlap/conflict check.
CREATE INDEX IF NOT EXISTS idx_bookings_active_window ON bookings (spot_id, start_time, end_time)
  WHERE status IN ('reserved', 'confirmed', 'active');

DROP TRIGGER IF EXISTS trg_bookings_updated ON bookings;
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_confcode
  ON bookings (confirmation_code) WHERE confirmation_code IS NOT NULL;

-- ------------------------------------------------------------
-- payments
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                 BIGSERIAL PRIMARY KEY,
  booking_id         BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  method             payment_method NOT NULL DEFAULT 'none',
  amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  host_payout_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status             payment_status NOT NULL DEFAULT 'pending',
  reference          TEXT,               -- Chapa tx_ref OR manual bank/Telebirr reference
  checkout_url       TEXT,               -- Chapa hosted checkout link
  screenshot_file_id TEXT,               -- Telegram file_id of manual transfer receipt
  raw                JSONB,              -- raw gateway / verification payload
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments (status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_reference
  ON payments (reference) WHERE reference IS NOT NULL;

DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- ratings  (one per completed booking)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  driver_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id     BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  host_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score       SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ratings_spot ON ratings (spot_id);
CREATE INDEX IF NOT EXISTS idx_ratings_host ON ratings (host_id);

-- ------------------------------------------------------------
-- payouts  (manual host payouts marked by admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payouts (
  id         BIGSERIAL PRIMARY KEY,
  host_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status     payout_status NOT NULL DEFAULT 'pending',
  note       TEXT,
  marked_by  BIGINT REFERENCES admin_users(id),
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payouts_host ON payouts (host_id);

DROP TRIGGER IF EXISTS trg_payouts_updated ON payouts;
CREATE TRIGGER trg_payouts_updated BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- disputes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disputes (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  raised_by   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  status      dispute_status NOT NULL DEFAULT 'open',
  resolution  TEXT,
  resolved_by BIGINT REFERENCES admin_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);

DROP TRIGGER IF EXISTS trg_disputes_updated ON disputes;
CREATE TRIGGER trg_disputes_updated BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- settings  (runtime config; e.g. commission_percent)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- host_balances view  (payout balance per host)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW host_balances AS
SELECT
  u.id AS host_id,
  u.name,
  COALESCE(earned.total, 0)                              AS total_earned,
  COALESCE(sent.total, 0)                                AS total_paid_out,
  COALESCE(earned.total, 0) - COALESCE(sent.total, 0)    AS balance
FROM users u
LEFT JOIN (
  SELECT s.owner_id AS host_id, SUM(p.host_payout_amount) AS total
  FROM payments p
  JOIN bookings b ON b.id = p.booking_id
  JOIN spots s    ON s.id = b.spot_id
  WHERE p.status = 'paid'
  GROUP BY s.owner_id
) earned ON earned.host_id = u.id
LEFT JOIN (
  SELECT host_id, SUM(amount) AS total
  FROM payouts
  WHERE status = 'sent'
  GROUP BY host_id
) sent ON sent.host_id = u.id
WHERE u.role = 'host';
