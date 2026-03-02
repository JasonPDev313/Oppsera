-- Migration 0250: Add per-webapp customization JSONB columns to spa_booking_widget_config
-- These allow spas to override tenant-level business info (address, phone, branding, etc.)

ALTER TABLE spa_booking_widget_config
  ADD COLUMN IF NOT EXISTS business_identity JSONB NOT NULL DEFAULT '{}';

ALTER TABLE spa_booking_widget_config
  ADD COLUMN IF NOT EXISTS contact_location JSONB NOT NULL DEFAULT '{}';

ALTER TABLE spa_booking_widget_config
  ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}';

ALTER TABLE spa_booking_widget_config
  ADD COLUMN IF NOT EXISTS operational JSONB NOT NULL DEFAULT '{}';

ALTER TABLE spa_booking_widget_config
  ADD COLUMN IF NOT EXISTS legal JSONB NOT NULL DEFAULT '{}';

ALTER TABLE spa_booking_widget_config
  ADD COLUMN IF NOT EXISTS seo JSONB NOT NULL DEFAULT '{}';
