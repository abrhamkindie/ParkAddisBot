-- Migration 008: Favorite Spots
-- Allows users to save favorite spots for quick rebooking

CREATE TABLE IF NOT EXISTS favorite_spots (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, spot_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_spots_user ON favorite_spots (user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_spots_spot ON favorite_spots (spot_id);
