-- Migration 0188: Merchant Account Settings
-- Adds operational settings and supplemental credential fields to payment_merchant_accounts
-- for the unified Merchant Account Setup page.

-- ── New columns on payment_merchant_accounts ──

ALTER TABLE payment_merchant_accounts
  ADD COLUMN IF NOT EXISTS hsn TEXT,
  ADD COLUMN IF NOT EXISTS ach_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS funding_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS use_for_card_swipe BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reader_beep BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_production BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_manual_entry BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tip_on_device BOOLEAN NOT NULL DEFAULT false;

-- Note: Additional credential fields (authorizationKey, achUsername, achPassword,
-- fundingUsername, fundingPassword) are stored in the encrypted credentials JSON
-- blob on payment_provider_credentials. No schema change needed for those.
