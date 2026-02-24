-- Migration: Add provider profile columns to customer_payment_methods for gateway integration
-- These columns link stored payment methods to provider-side profiles (e.g., CardPointe profileid/acctid)

ALTER TABLE customer_payment_methods
  ADD COLUMN IF NOT EXISTS provider_profile_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS billing_address JSONB;

-- Index for looking up payment methods by provider profile
CREATE INDEX IF NOT EXISTS idx_customer_pm_provider_profile
  ON customer_payment_methods (tenant_id, provider_profile_id)
  WHERE provider_profile_id IS NOT NULL;
