-- ============================================================
-- 012_seed_more_spots.sql  —  Extra dev seed: more parking spots
-- Covers ~10 distinct Addis Ababa neighborhoods for testing.
-- Idempotent: uses ON CONFLICT DO NOTHING on users,
-- and a unique address check to avoid duplicate spots.
-- ============================================================

-- Extra hosts
INSERT INTO users (telegram_id, name, role, language_pref) VALUES
  (900000004, 'CMC Host',          'host', 'en'),
  (900000005, 'Sarbet Host',       'host', 'am'),
  (900000006, 'Gerji Host',        'host', 'en'),
  (900000007, 'Lideta Host',       'host', 'am'),
  (900000008, 'Arat Kilo Host',    'host', 'en'),
  (900000009, 'Kality Host',       'host', 'am'),
  (900000010, 'Mexico Host',       'host', 'en')
ON CONFLICT (telegram_id) DO NOTHING;

-- ── Bole (extra) ─────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8050, 8.9930)::geography,
  'Bole Atlas Hotel side street', 45.00, 6, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000001
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7960, 8.9880)::geography,
  'Bole Dembel City Center basement', 70.00, 20, true, true, true, 'active', true
FROM users u WHERE u.telegram_id = 900000001
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7915, 8.9970)::geography,
  'Bole road, near Ethiopian Airlines HQ gate', 55.00, 8, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000001
ON CONFLICT DO NOTHING;

-- ── CMC ──────────────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8320, 9.0270)::geography,
  'CMC Michael, beside Zion Church', 30.00, 4, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000004
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8280, 9.0310)::geography,
  'CMC road, next to Dashen Bank branch', 35.00, 5, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000004
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8350, 9.0230)::geography,
  'CMC, behind Friendship supermarket', 25.00, 3, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000004
ON CONFLICT DO NOTHING;

-- ── Sarbet / Gofa ─────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7660, 8.9820)::geography,
  'Sarbet, near Genet Hotel', 30.00, 6, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000005
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7600, 8.9770)::geography,
  'Gofa Mebrat Haile junction, open lot', 20.00, 12, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000005
ON CONFLICT DO NOTHING;

-- ── Gerji / Imb ───────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8170, 9.0100)::geography,
  'Gerji, opposite Imb road mosque', 35.00, 7, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000006
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8210, 9.0150)::geography,
  'Gerji Condominium, building 12 parking', 25.00, 10, true, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000006
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8140, 9.0080)::geography,
  'Gerji market area, fenced lot', 30.00, 5, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000006
ON CONFLICT DO NOTHING;

-- ── Lideta / Stadium ──────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7430, 9.0150)::geography,
  'Lideta, near Addis Ababa Stadium south gate', 40.00, 15, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000007
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7380, 9.0180)::geography,
  'Lideta subcity office compound', 35.00, 8, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000007
ON CONFLICT DO NOTHING;

-- ── Arat Kilo / University area ───────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7630, 9.0430)::geography,
  'Arat Kilo, across from AAU main gate', 30.00, 6, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000008
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7580, 9.0460)::geography,
  'Sidist Kilo, National Museum side road', 25.00, 4, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000008
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7680, 9.0400)::geography,
  'Arat Kilo, Ministry of Health compound overflow', 20.00, 5, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000008
ON CONFLICT DO NOTHING;

-- ── Kality / Akaki ────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7780, 8.9380)::geography,
  'Kality, near Kality prison road junction', 15.00, 20, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000009
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7720, 8.9330)::geography,
  'Akaki Kaliti industrial zone, gated lot', 20.00, 30, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000009
ON CONFLICT DO NOTHING;

-- ── Mexico / Lancha ───────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7470, 9.0070)::geography,
  'Mexico Square, next to Gotera flyover ramp', 40.00, 10, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000010
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7510, 9.0010)::geography,
  'Lancha, behind Saris shopping area', 30.00, 6, true, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000010
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7440, 9.0030)::geography,
  'Mexico, CBE Mexico branch parking', 45.00, 8, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000010
ON CONFLICT DO NOTHING;

-- ── Megenagna (extra) ─────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8030, 9.0230)::geography,
  'Megenagna, Friendship Business Center basement', 65.00, 18, true, true, true, 'active', true
FROM users u WHERE u.telegram_id = 900000003
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7970, 9.0190)::geography,
  'Megenagna roundabout, east side open lot', 25.00, 10, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000003
ON CONFLICT DO NOTHING;

-- ── Piassa (extra) ────────────────────────────────────────────
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7490, 9.0370)::geography,
  'Piassa, Ras Hotel compound', 50.00, 5, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000002
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7530, 9.0310)::geography,
  'Piassa, Itege Taitu street side lot', 20.00, 4, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000002
ON CONFLICT DO NOTHING;
