-- Migration 009: Waitlist System
-- Allows users to join waitlist when spot is fully booked

CREATE TABLE IF NOT EXISTS spot_waitlist (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  preferred_start TIME,
  preferred_duration INT CHECK (preferred_duration > 0),
  notified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spot_waitlist_spot ON spot_waitlist (spot_id, active);
CREATE INDEX IF NOT EXISTS idx_spot_waitlist_user ON spot_waitlist (user_id, active);
CREATE INDEX IF NOT EXISTS idx_spot_waitlist_expires ON spot_waitlist (active, expires_at) WHERE expires_at IS NOT NULL;
