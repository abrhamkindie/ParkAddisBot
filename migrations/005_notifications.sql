-- Migration 005: Add notification tracking columns to bookings table
-- This enables the smart notification system to track which notifications have been sent.

-- Add notification tracking columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notification_start_reminder BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notification_payment_warning BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notification_checkin_prompt BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notification_host_alert BOOLEAN DEFAULT false;

-- Add indexes for notification queries (performance optimization)
CREATE INDEX IF NOT EXISTS idx_bookings_notification_start_reminder 
  ON bookings (notification_start_reminder, status, start_time) 
  WHERE notification_start_reminder = false;

CREATE INDEX IF NOT EXISTS idx_bookings_notification_payment_warning 
  ON bookings (notification_payment_warning, payment_status, created_at) 
  WHERE notification_payment_warning = false;

CREATE INDEX IF NOT EXISTS idx_bookings_notification_checkin_prompt 
  ON bookings (notification_checkin_prompt, status, start_time) 
  WHERE notification_checkin_prompt = false;

CREATE INDEX IF NOT EXISTS idx_bookings_notification_host_alert 
  ON bookings (notification_host_alert, status, start_time) 
  WHERE notification_host_alert = false;

-- Add comment for documentation
COMMENT ON COLUMN bookings.notification_start_reminder IS 'True when 30-min start reminder sent to driver';
COMMENT ON COLUMN bookings.notification_payment_warning IS 'True when payment expiry warning sent to driver';
COMMENT ON COLUMN bookings.notification_checkin_prompt IS 'True when check-in prompt with QR sent to driver';
COMMENT ON COLUMN bookings.notification_host_alert IS 'True when upcoming booking alert sent to host';
