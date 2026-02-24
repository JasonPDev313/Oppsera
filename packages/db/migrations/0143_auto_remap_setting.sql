-- Migration 0143: Add auto-remap toggle to accounting settings
-- When enabled, saving a GL mapping automatically voids and reposts
-- affected transactions with corrected accounts.

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS enable_auto_remap BOOLEAN NOT NULL DEFAULT false;
