-- Migration 010: Promo Codes & Discounts
-- Admin creates promo codes, users apply at checkout

CREATE TABLE IF NOT EXISTS promo_codes (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value >= 0),
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  min_booking_amount DECIMAL(10,2),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes (active, code);

-- Add promo code fields to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS promo_code_id BIGINT REFERENCES promo_codes(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_payments_promo ON payments (promo_code_id) WHERE promo_code_id IS NOT NULL;
