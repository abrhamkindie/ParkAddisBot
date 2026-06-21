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
