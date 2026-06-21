-- ============================================================
-- 002_functions.sql  —  Search + booking helpers
-- ============================================================

-- ------------------------------------------------------------
-- find_nearby_spots
--   Returns active, available spots within :radius_m metres of
--   (:lat,:lng), sorted by distance then price.
--   Distance is in metres (geography type).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_nearby_spots(
  p_lat      DOUBLE PRECISION,
  p_lng      DOUBLE PRECISION,
  p_radius_m DOUBLE PRECISION DEFAULT 2000,
  p_limit    INTEGER DEFAULT 8
)
RETURNS TABLE (
  id             BIGINT,
  owner_id       BIGINT,
  address        TEXT,
  price_per_hour NUMERIC,
  capacity       INTEGER,
  covered        BOOLEAN,
  guarded        BOOLEAN,
  ev_charging    BOOLEAN,
  rating_avg     NUMERIC,
  rating_count   INTEGER,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  distance_m     DOUBLE PRECISION
) AS $$
  SELECT
    s.id,
    s.owner_id,
    s.address,
    s.price_per_hour,
    s.capacity,
    s.covered,
    s.guarded,
    s.ev_charging,
    s.rating_avg,
    s.rating_count,
    ST_Y(s.geom::geometry) AS lat,
    ST_X(s.geom::geometry) AS lng,
    ST_Distance(s.geom, ST_MakePoint(p_lng, p_lat)::geography) AS distance_m
  FROM spots s
  WHERE s.status = 'active'
    AND s.is_available = true
    AND ST_DWithin(s.geom, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
  ORDER BY distance_m ASC, s.price_per_hour ASC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- count_overlapping_bookings
--   How many capacity-consuming bookings overlap [p_start, p_end)
--   for a given spot. Used inside create_booking under a row lock.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION count_overlapping_bookings(
  p_spot_id BIGINT,
  p_start   TIMESTAMPTZ,
  p_end     TIMESTAMPTZ
)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM bookings b
  WHERE b.spot_id = p_spot_id
    AND b.status IN ('reserved', 'confirmed', 'active')
    AND tstzrange(b.start_time, b.end_time) && tstzrange(p_start, p_end);
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- create_booking
--   Atomically creates a booking if capacity allows.
--   Locks the spot row (FOR UPDATE) so concurrent callers serialise
--   on the same spot, preventing double-booking beyond capacity.
--   Returns the new booking id, or raises 'CAPACITY_FULL' /
--   'SPOT_UNAVAILABLE'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_booking(
  p_driver_id   BIGINT,
  p_spot_id     BIGINT,
  p_start       TIMESTAMPTZ,
  p_end         TIMESTAMPTZ,
  p_total_price NUMERIC,
  p_conf_code   TEXT,
  p_status      booking_status DEFAULT 'reserved'
)
RETURNS BIGINT AS $$
DECLARE
  v_spot     spots%ROWTYPE;
  v_overlap  INTEGER;
  v_new_id   BIGINT;
BEGIN
  -- Lock the spot row; serialises concurrent bookings for this spot.
  SELECT * INTO v_spot FROM spots WHERE id = p_spot_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SPOT_NOT_FOUND';
  END IF;

  IF v_spot.status <> 'active' OR v_spot.is_available = false THEN
    RAISE EXCEPTION 'SPOT_UNAVAILABLE';
  END IF;

  SELECT count_overlapping_bookings(p_spot_id, p_start, p_end) INTO v_overlap;

  IF v_overlap >= v_spot.capacity THEN
    RAISE EXCEPTION 'CAPACITY_FULL';
  END IF;

  INSERT INTO bookings (driver_id, spot_id, start_time, end_time,
                        status, total_price, payment_status, confirmation_code)
  VALUES (p_driver_id, p_spot_id, p_start, p_end,
          p_status, p_total_price, 'unpaid', p_conf_code)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- recalc_spot_rating  — keep spots.rating_avg / rating_count fresh
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_spot_rating(p_spot_id BIGINT)
RETURNS VOID AS $$
  UPDATE spots s SET
    rating_avg   = COALESCE((SELECT ROUND(AVG(score)::numeric, 2) FROM ratings WHERE spot_id = p_spot_id), 0),
    rating_count = (SELECT COUNT(*) FROM ratings WHERE spot_id = p_spot_id)
  WHERE s.id = p_spot_id;
$$ LANGUAGE sql;
