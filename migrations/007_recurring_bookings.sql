-- Migration 007: Recurring Bookings
-- Allows drivers to book same spot weekly/monthly (e.g., daily commuters)

CREATE TABLE IF NOT EXISTS recurring_bookings (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  pattern VARCHAR(20) NOT NULL CHECK (pattern IN ('daily', 'weekly', 'monthly')),
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6), -- For weekly pattern
  start_time TIME NOT NULL,
  duration_hours INT NOT NULL CHECK (duration_hours > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  last_generated_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_bookings_driver ON recurring_bookings (driver_id);
CREATE INDEX IF NOT EXISTS idx_recurring_bookings_active ON recurring_bookings (active, last_generated_date);
