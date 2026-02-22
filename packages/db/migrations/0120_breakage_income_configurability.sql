-- ACCT-CLOSE-02: Breakage Income Configurability + Voucher Policy Controls
-- Adds breakage income settings to accounting_settings and creates
-- pending_breakage_review queue for jurisdictions that require manual approval.

-- ── Accounting Settings: breakage/voucher policy columns ─────────

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS recognize_breakage_automatically BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS breakage_recognition_method TEXT NOT NULL DEFAULT 'on_expiry',
  ADD COLUMN IF NOT EXISTS breakage_income_account_id TEXT,
  ADD COLUMN IF NOT EXISTS voucher_expiry_enabled BOOLEAN NOT NULL DEFAULT true;

-- ── Pending Breakage Review Queue ────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_breakage_review (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  voucher_id TEXT NOT NULL REFERENCES vouchers(id),
  voucher_number TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  expired_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'declined'
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  gl_journal_entry_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_breakage_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_breakage_review FORCE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY pending_breakage_review_select ON pending_breakage_review
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY pending_breakage_review_insert ON pending_breakage_review
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY pending_breakage_review_update ON pending_breakage_review
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_breakage_tenant_status
  ON pending_breakage_review(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_breakage_tenant_voucher
  ON pending_breakage_review(tenant_id, voucher_id);
