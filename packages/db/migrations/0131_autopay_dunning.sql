-- Migration 0131: Autopay + Dunning + Risk Management (Session 9)
-- Creates 5 new tables for autopay profiles, batch runs, charge attempts,
-- late fee assessments, and membership holds

-- ── autopay_profiles ────────────────────────────────────────────────
CREATE TABLE autopay_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL,
  payment_method_id TEXT, -- FK to customer_payment_methods (app-enforced)
  strategy TEXT NOT NULL DEFAULT 'full_balance', -- full_balance, minimum_due, fixed_amount, selected_accounts
  fixed_amount_cents BIGINT DEFAULT 0,
  selected_account_types JSONB, -- e.g. ['dues', 'initiation', 'minimums']
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_autopay_profiles_tenant_account ON autopay_profiles(tenant_id, membership_account_id);
CREATE INDEX idx_autopay_profiles_tenant_active ON autopay_profiles(tenant_id, is_active) WHERE is_active = true;

ALTER TABLE autopay_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopay_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY autopay_profiles_select ON autopay_profiles
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_profiles_insert ON autopay_profiles
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_profiles_update ON autopay_profiles
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_profiles_delete ON autopay_profiles
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── autopay_runs ────────────────────────────────────────────────────
CREATE TABLE autopay_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  total_profiles_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  total_collected_cents BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_autopay_runs_tenant_date ON autopay_runs(tenant_id, run_date);
CREATE INDEX idx_autopay_runs_tenant_status ON autopay_runs(tenant_id, status);

ALTER TABLE autopay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopay_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY autopay_runs_select ON autopay_runs
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_runs_insert ON autopay_runs
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_runs_update ON autopay_runs
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_runs_delete ON autopay_runs
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── autopay_attempts ────────────────────────────────────────────────
CREATE TABLE autopay_attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  run_id TEXT NOT NULL REFERENCES autopay_runs(id),
  membership_account_id TEXT NOT NULL,
  payment_method_id TEXT,
  amount_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, success, failed, retry
  failure_reason TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  ar_transaction_id TEXT, -- FK to ar_transactions (app-enforced)
  next_retry_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_autopay_attempts_tenant_run ON autopay_attempts(tenant_id, run_id);
CREATE INDEX idx_autopay_attempts_tenant_account ON autopay_attempts(tenant_id, membership_account_id);
CREATE INDEX idx_autopay_attempts_tenant_status ON autopay_attempts(tenant_id, status);

ALTER TABLE autopay_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopay_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY autopay_attempts_select ON autopay_attempts
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_attempts_insert ON autopay_attempts
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_attempts_update ON autopay_attempts
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY autopay_attempts_delete ON autopay_attempts
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── late_fee_assessments ────────────────────────────────────────────
CREATE TABLE late_fee_assessments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL,
  assessment_date DATE NOT NULL,
  overdue_amount_cents BIGINT NOT NULL,
  fee_amount_cents BIGINT NOT NULL,
  ar_transaction_id TEXT, -- FK to ar_transactions (app-enforced)
  waived BOOLEAN NOT NULL DEFAULT false,
  waived_by TEXT,
  waived_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_late_fee_assessments_tenant_account ON late_fee_assessments(tenant_id, membership_account_id);
CREATE INDEX idx_late_fee_assessments_tenant_date ON late_fee_assessments(tenant_id, assessment_date);

ALTER TABLE late_fee_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_fee_assessments FORCE ROW LEVEL SECURITY;

CREATE POLICY late_fee_assessments_select ON late_fee_assessments
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY late_fee_assessments_insert ON late_fee_assessments
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY late_fee_assessments_update ON late_fee_assessments
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY late_fee_assessments_delete ON late_fee_assessments
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── membership_holds ────────────────────────────────────────────────
CREATE TABLE membership_holds (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL,
  hold_type TEXT NOT NULL DEFAULT 'charging', -- charging, full, billing
  reason TEXT NOT NULL,
  placed_by TEXT NOT NULL,
  placed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  lifted_by TEXT,
  lifted_at TIMESTAMP WITH TIME ZONE,
  lifted_reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_membership_holds_tenant_account ON membership_holds(tenant_id, membership_account_id);
CREATE INDEX idx_membership_holds_tenant_active ON membership_holds(tenant_id, is_active) WHERE is_active = true;

ALTER TABLE membership_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_holds FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_holds_select ON membership_holds
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_holds_insert ON membership_holds
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_holds_update ON membership_holds
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_holds_delete ON membership_holds
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
