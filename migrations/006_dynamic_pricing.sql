-- Migration 006: Dynamic Pricing System
-- Allows hosts to set different prices based on time, day, or demand

CREATE TABLE IF NOT EXISTS pricing_rules (
  id BIGSERIAL PRIMARY KEY,
  spot_id BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday (NULL = all days)
  start_hour SMALLINT CHECK (start_hour BETWEEN 0 AND 23), -- NULL = all day
  end_hour SMALLINT CHECK (end_hour BETWEEN 0 AND 23),
  price_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.0 CHECK (price_multiplier > 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_spot ON pricing_rules (spot_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_day_hour ON pricing_rules (day_of_week, start_hour, end_hour);

-- Function to get price multiplier for a specific time
CREATE OR REPLACE FUNCTION get_price_multiplier(
  p_spot_id BIGINT,
  p_timestamp TIMESTAMPTZ
) RETURNS DECIMAL AS $$
DECLARE
  multiplier DECIMAL;
  v_day_of_week INT;
  v_hour INT;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_timestamp);
  v_hour := EXTRACT(HOUR FROM p_timestamp);
  
  -- Find matching rule (most specific first)
  SELECT price_multiplier INTO multiplier
  FROM pricing_rules
  WHERE spot_id = p_spot_id
    AND (day_of_week IS NULL OR day_of_week = v_day_of_week)
    AND (start_hour IS NULL OR start_hour <= v_hour)
    AND (end_hour IS NULL OR end_hour > v_hour)
  ORDER BY 
    CASE WHEN day_of_week IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN start_hour IS NOT NULL THEN 0 ELSE 1 END
  LIMIT 1;
  
  RETURN COALESCE(multiplier, 1.0);
END;
$$ LANGUAGE plpgsql;
