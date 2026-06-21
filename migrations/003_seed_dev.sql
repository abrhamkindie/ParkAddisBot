-- ============================================================
-- 003_seed_dev.sql  —  Development seed data (idempotent)
-- Sample hosts + active parking spots around Addis Ababa.
-- ============================================================

-- Default runtime settings
INSERT INTO settings (key, value) VALUES
  ('commission_percent', '15'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Sample hosts
INSERT INTO users (telegram_id, name, role, language_pref) VALUES
  (900000001, 'Bole Host',      'host', 'en'),
  (900000002, 'Piassa Host',    'host', 'am'),
  (900000003, 'Megenagna Host', 'host', 'en')
ON CONFLICT (telegram_id) DO NOTHING;

-- Sample spots (lng, lat).  Addis Ababa landmarks.
-- Bole area
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7990, 8.9950)::geography, 'Bole Medhanialem, near the church', 40.00, 5, true, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000001
ON CONFLICT DO NOTHING;

INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7820, 8.9930)::geography, 'Edna Mall parking, Bole', 60.00, 10, true, true, true, 'active', true
FROM users u WHERE u.telegram_id = 900000001
ON CONFLICT DO NOTHING;

-- Piassa area
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7510, 9.0340)::geography, 'Piassa, near Cinema Empire', 30.00, 3, false, false, false, 'active', true
FROM users u WHERE u.telegram_id = 900000002
ON CONFLICT DO NOTHING;

-- Megenagna area
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.8000, 9.0200)::geography, 'Megenagna, near Zefmesh Grand Mall', 35.00, 8, false, true, false, 'active', true
FROM users u WHERE u.telegram_id = 900000003
ON CONFLICT DO NOTHING;

-- A pending one (to test the approval queue later)
INSERT INTO spots (owner_id, geom, address, price_per_hour, capacity, covered, guarded, ev_charging, status, is_available)
SELECT u.id, ST_MakePoint(38.7630, 9.0100)::geography, 'Kazanchis, behind the UN office', 50.00, 4, true, true, false, 'pending_approval', true
FROM users u WHERE u.telegram_id = 900000002
ON CONFLICT DO NOTHING;
