-- 0180: Payment Response Enrichment
-- Adds structured decline categorization, user-safe messages, and AVS/CVV
-- interpretation to payment_transactions for gateway response handling.
-- All nullable columns with no defaults → instant metadata-only ALTER (no table rewrite).

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS decline_category TEXT,
  ADD COLUMN IF NOT EXISTS user_message TEXT,
  ADD COLUMN IF NOT EXISTS suggested_action TEXT,
  ADD COLUMN IF NOT EXISTS retryable BOOLEAN,
  ADD COLUMN IF NOT EXISTS avs_result TEXT,
  ADD COLUMN IF NOT EXISTS cvv_result TEXT,
  ADD COLUMN IF NOT EXISTS visa_decline_category INTEGER,
  ADD COLUMN IF NOT EXISTS mc_advice_code TEXT,
  ADD COLUMN IF NOT EXISTS processor TEXT;

-- Partial index for filtering failed transactions by decline category
CREATE INDEX IF NOT EXISTS idx_payment_txn_decline_category
  ON payment_transactions (tenant_id, decline_category)
  WHERE decline_category IS NOT NULL;

-- Partial index for finding retryable failures
CREATE INDEX IF NOT EXISTS idx_payment_txn_retryable
  ON payment_transactions (tenant_id, retryable)
  WHERE retryable = true;

-- RLS policies for the new columns are inherited from existing table policies.
-- No new policies needed — the columns are part of the existing row.
