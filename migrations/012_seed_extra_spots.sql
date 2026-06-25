-- ============================================================
-- 012_seed_extra_spots.sql  —  Extra dev seed: more parking spots
-- spread across Addis Ababa neighborhoods for realistic testing.
-- Idempotent (ON CONFLICT DO NOTHING).
-- ============================================================

-- Extra hosts
INSERT INTO users (telegram_id, name, role, language_pref) VALUES
  (900000004, 'CMC Host',           'host', 'en'),
  (900000005, 'Sarbet Host',        'host', 'am'),
  (900000006, 'Mexico Host',        'host', 'en'),
  (900000007, 'Stadium Host',       'host', 'am'),
  (900000008, 'Gerji Host',         'host', 'en'),
  (900000009, 'Hayahulet Host',     'host', 'am'),
  (900000010, 'Gotera Host',        'host', 'en'),
  (900000011, 'Lebu Host',          'host', 'am'),
  (900000012, 'Saris Host',         'host', 'en'),
  (900000013, 'Lamberet Host',      'host', 'am')
ON CONFLICT (telegram_id) DO NOTHING;

-- ── Bole area (extra) ────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8010, 8.9920)::geography,
  'Bole Atlas Hotel area', 55.00, 6, true, true, true, 'active', true
FROM users u WHERE u.telegram_id = 900000004
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7960, 8.9880)::geography,
  'Bole Rwanda junction, gated compound', 45.00, 4, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000004
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7900, 8.9910)::geography,
  'Bole – Dembel City Center underground', 70.00, 20, true, true, true, 'active', true
FROM users u WHERE u.telegram_id = 900000004
ON CONFLICT DO NOTHING;

-- ── CMC / Airport road ───────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8340, 9.0350)::geography,
  'CMC Michael roundabout, open lot', 25.00, 15, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000004
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8280, 9.0390)::geography,
  'CMC – behind Kidane Mehret church', 20.00, 8, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000004
ON CONFLICT DO NOTHING;

-- ── Sarbet / Jomo Kenyatta ────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7560, 8.9980)::geography,
  'Sarbet, near Kenyatta Ave intersection', 30.00, 5, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000005
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7610, 8.9960)::geography,
  'Sarbet – shaded residential compound', 35.00, 3, true, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000005
ON CONFLICT DO NOTHING;

-- ── Mexico Square ────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7470, 9.0120)::geography,
  'Mexico Square, street-level lot', 25.00, 10, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000006
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7490, 9.0090)::geography,
  'Mexico – Haya Hulet road, gated', 40.00, 6, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000006
ON CONFLICT DO NOTHING;

-- ── Addis Ababa Stadium ──────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7620, 9.0210)::geography,
  'Abebe Bikila Stadium east gate', 20.00, 25, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000007
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7580, 9.0240)::geography,
  'Stadium area – hotel basement', 50.00, 12, true, true, true, 'active', true
FROM users u WHERE u.telegram_id = 900000007
ON CONFLICT DO NOTHING;

-- ── Gerji ────────────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8200, 9.0050)::geography,
  'Gerji Imperial, open compound', 25.00, 8, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000008
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8240, 9.0020)::geography,
  'Gerji – beside Total fuel station', 30.00, 5, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000008
ON CONFLICT DO NOTHING;

-- ── Hayahulet (22 roundabout) ────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7700, 9.0050)::geography,
  '22 Mazoria, rooftop parking', 45.00, 18, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000009
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7730, 9.0080)::geography,
  'Hayahulet – office tower basement', 60.00, 30, true, true, true, 'active', true
FROM users u WHERE u.telegram_id = 900000009
ON CONFLICT DO NOTHING;

-- ── Gotera interchange ───────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7780, 8.9810)::geography,
  'Gotera – roadside guarded lot', 20.00, 12, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000010
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7810, 8.9840)::geography,
  'Gotera cloverleaf, wholesale market side', 15.00, 20, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000010
ON CONFLICT DO NOTHING;

-- ── Lebu ─────────────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7200, 8.9580)::geography,
  'Lebu market, paved open lot', 15.00, 30, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000011
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7230, 8.9610)::geography,
  'Lebu – residential private compound', 20.00, 4, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000011
ON CONFLICT DO NOTHING;

-- ── Saris ────────────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7890, 8.9680)::geography,
  'Saris Total station adjacent lot', 20.00, 10, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000012
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7870, 8.9650)::geography,
  'Saris – covered mall parking', 35.00, 15, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000012
ON CONFLICT DO NOTHING;

-- ── Lamberet / Ring Road ──────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8450, 9.0500)::geography,
  'Lamberet, ring road service road lot', 20.00, 20, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000013
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8410, 9.0470)::geography,
  'Lamberet – behind Sunshine mall', 30.00, 8, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000013
ON CONFLICT DO NOTHING;

-- ── Arat Kilo / University area ───────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7630, 9.0420)::geography,
  'Arat Kilo – near Addis Ababa University main gate', 25.00, 7, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000006
ON CONFLICT DO NOTHING;

-- ── Lideta / Mercato ──────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7380, 9.0230)::geography,
  'Mercato – warehouse district, large open lot', 15.00, 40, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000006
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7350, 9.0180)::geography,
  'Lideta sub-city, covered compound', 30.00, 6, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000005
ON CONFLICT DO NOTHING;
