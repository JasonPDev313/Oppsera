-- Migration 0311: Accounting hardening
-- 1. Add 'voided' and 'failed' to payment_settlement status values (CHECK constraint)
-- 2. Unique partial index on settlement lines tender_id (prevent double-matching)
-- 3. F&B close batch GL state separation columns
-- 4. Index for AR reconciliation checklist queries

-- ── 1. Settlement status validation ─────────────────────────────
-- No pgEnum exists — status is a plain text column. Add a CHECK constraint
-- to enforce the valid set: pending, matched, posted, voided, failed, disputed.
DO $$ BEGIN
  ALTER TABLE payment_settlements
    ADD CONSTRAINT chk_payment_settlement_status
    CHECK (status IN ('pending', 'matched', 'posted', 'voided', 'failed', 'disputed'));
EXCEPTION
  WHEN duplicate_object THEN NULL; -- already exists
END $$;

-- ── 2. Settlement line tender uniqueness ────────────────────────
-- Prevent the same tender from being matched to multiple settlement lines.
-- Partial index: only applies when tender_id IS NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_line_tender
  ON payment_settlement_lines (tenant_id, tender_id)
  WHERE tender_id IS NOT NULL;

-- ── 3. F&B close batch GL state separation ──────────────────────
-- Decouple operational batch status (open/reconciled/posted/locked) from GL posting.
-- gl_posting_status tracks the accounting adapter's progress independently.
ALTER TABLE fnb_close_batches
  ADD COLUMN IF NOT EXISTS gl_posting_status TEXT NOT NULL DEFAULT 'not_required';
  -- Values: not_required, pending, posted, failed

ALTER TABLE fnb_close_batches
  ADD COLUMN IF NOT EXISTS gl_posting_error TEXT;

ALTER TABLE fnb_close_batches
  ADD COLUMN IF NOT EXISTS last_posting_attempt_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE fnb_close_batches
    ADD CONSTRAINT chk_fnb_batch_gl_posting_status
    CHECK (gl_posting_status IN ('not_required', 'pending', 'posted', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Index for quick lookup of batches needing GL attention
CREATE INDEX IF NOT EXISTS idx_fnb_batches_gl_status
  ON fnb_close_batches (tenant_id, gl_posting_status)
  WHERE gl_posting_status IN ('pending', 'failed');

-- ── 4. AR reconciliation performance index ──────────────────────
-- Close checklist queries ar_invoices and ar_receipts by tenant + status.
CREATE INDEX IF NOT EXISTS idx_ar_invoices_recon
  ON ar_invoices (tenant_id, status)
  WHERE status IN ('posted', 'partial');

CREATE INDEX IF NOT EXISTS idx_ar_receipts_recon
  ON ar_receipts (tenant_id, status)
  WHERE status = 'posted';
