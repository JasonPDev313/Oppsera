-- Migration 0179: Add wallet_type column to tenders for analytics
-- Tracks whether a payment was made via apple_pay, google_pay, or standard card

ALTER TABLE tenders ADD COLUMN IF NOT EXISTS wallet_type TEXT;
COMMENT ON COLUMN tenders.wallet_type IS 'apple_pay, google_pay, or NULL for standard card/cash';

-- Index for analytics queries filtering by wallet type
CREATE INDEX IF NOT EXISTS idx_tenders_wallet_type
  ON tenders (tenant_id, wallet_type)
  WHERE wallet_type IS NOT NULL;
