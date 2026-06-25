-- Migration 011: Host Availability Calendar
-- Hosts can set when their spot is available/unavailable

CREATE TABLE IF NOT EXISTS host_availability (
  id BIGSERIAL PRIMARY KEY,
  host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spot_id, date)
);

CREATE INDEX IF NOT EXISTS idx_host_availability_spot_date ON host_availability (spot_id, date);
CREATE INDEX IF NOT EXISTS idx_host_availability_host ON host_availability (host_id);
