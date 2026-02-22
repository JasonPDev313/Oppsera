-- Migration 0130: Initiation Financing + Accounting Visibility (Session 8)
-- Creates 2 new tables for initiation fee contracts and amortization schedules

-- ── initiation_contracts ──────────────────────────────────────────
CREATE TABLE initiation_contracts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL,
  contract_date DATE NOT NULL,
  initiation_fee_cents BIGINT NOT NULL,
  down_payment_cents BIGINT NOT NULL DEFAULT 0,
  financed_principal_cents BIGINT NOT NULL,
  apr_bps INTEGER NOT NULL DEFAULT 0,
  term_months INTEGER NOT NULL,
  payment_day_of_month INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  recognition_policy_snapshot JSONB NOT NULL,
  gl_initiation_revenue_account_id TEXT,
  gl_notes_receivable_account_id TEXT,
  gl_interest_income_account_id TEXT,
  gl_capital_contribution_account_id TEXT,
  gl_deferred_revenue_account_id TEXT,
  paid_principal_cents BIGINT NOT NULL DEFAULT 0,
  paid_interest_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_initiation_contracts_tenant_account ON initiation_contracts(tenant_id, membership_account_id);
CREATE INDEX idx_initiation_contracts_tenant_status ON initiation_contracts(tenant_id, status);

ALTER TABLE initiation_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiation_contracts FORCE ROW LEVEL SECURITY;

CREATE POLICY initiation_contracts_select ON initiation_contracts
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY initiation_contracts_insert ON initiation_contracts
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY initiation_contracts_update ON initiation_contracts
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY initiation_contracts_delete ON initiation_contracts
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── initiation_amort_schedule ─────────────────────────────────────
CREATE TABLE initiation_amort_schedule (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  contract_id TEXT NOT NULL REFERENCES initiation_contracts(id),
  period_index INTEGER NOT NULL,
  due_date DATE NOT NULL,
  payment_cents BIGINT NOT NULL,
  principal_cents BIGINT NOT NULL,
  interest_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  ar_transaction_id TEXT,
  billed_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_initiation_amort_contract ON initiation_amort_schedule(tenant_id, contract_id);
CREATE INDEX idx_initiation_amort_due_date ON initiation_amort_schedule(tenant_id, due_date);
CREATE UNIQUE INDEX uq_initiation_amort_contract_period ON initiation_amort_schedule(tenant_id, contract_id, period_index);

ALTER TABLE initiation_amort_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiation_amort_schedule FORCE ROW LEVEL SECURITY;

CREATE POLICY initiation_amort_schedule_select ON initiation_amort_schedule
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY initiation_amort_schedule_insert ON initiation_amort_schedule
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY initiation_amort_schedule_update ON initiation_amort_schedule
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY initiation_amort_schedule_delete ON initiation_amort_schedule
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
