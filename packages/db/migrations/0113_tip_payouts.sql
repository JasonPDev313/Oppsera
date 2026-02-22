-- Migration 0113: Tip Payouts
-- UXOPS-06: Tip Payout Workflow

-- ── tip_payouts ─────────────────────────────────────────────────────
CREATE TABLE tip_payouts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  payout_type TEXT NOT NULL,  -- 'cash' | 'payroll' | 'check'
  amount_cents INTEGER NOT NULL,
  business_date DATE NOT NULL,
  drawer_session_id TEXT REFERENCES drawer_sessions(id),
  payroll_period TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'voided'
  approved_by TEXT,
  gl_journal_entry_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tip_payouts_tenant_employee ON tip_payouts(tenant_id, employee_id);
CREATE INDEX idx_tip_payouts_tenant_date ON tip_payouts(tenant_id, business_date);
CREATE INDEX idx_tip_payouts_tenant_status ON tip_payouts(tenant_id, status);
CREATE INDEX idx_tip_payouts_session ON tip_payouts(drawer_session_id);

-- ── Settings extension ──────────────────────────────────────────────
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS default_payroll_clearing_account_id TEXT REFERENCES gl_accounts(id);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE tip_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tip_payouts FORCE ROW LEVEL SECURITY;

CREATE POLICY tip_payouts_select ON tip_payouts
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY tip_payouts_insert ON tip_payouts
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY tip_payouts_update ON tip_payouts
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY tip_payouts_delete ON tip_payouts
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
