-- Payment Idempotency Hardening
-- Adds client_request_id tracking on payment_transactions for per-operation idempotency
-- and unknown_at_gateway status support on payment_intents

-- 1. Add client_request_id to payment_transactions for per-operation idempotency
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

-- 2. Partial unique index: prevents duplicate void/refund/capture with same clientRequestId
--    per intent + transaction type. Null client_request_ids (legacy rows) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_txn_intent_type_client_request
  ON payment_transactions (tenant_id, payment_intent_id, transaction_type, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 3. Index for fast lookup of existing transactions by clientRequestId (used by idempotency checks)
CREATE INDEX IF NOT EXISTS idx_payment_txn_client_request
  ON payment_transactions (tenant_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 4. RLS policies for new column (existing policies cover all columns, no new policies needed)
-- The existing RLS policies on payment_transactions apply to all columns including the new one.
