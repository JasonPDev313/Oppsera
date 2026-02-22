-- Session 11: Membership Reporting Read Models (CQRS)
CREATE TABLE IF NOT EXISTS rm_membership_aging (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  current_cents BIGINT NOT NULL DEFAULT 0,
  days_1_30_cents BIGINT NOT NULL DEFAULT 0,
  days_31_60_cents BIGINT NOT NULL DEFAULT 0,
  days_61_90_cents BIGINT NOT NULL DEFAULT 0,
  days_over_90_cents BIGINT NOT NULL DEFAULT 0,
  total_outstanding_cents BIGINT NOT NULL DEFAULT 0,
  last_payment_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_rm_membership_aging ON rm_membership_aging (tenant_id, membership_account_id, as_of_date);

CREATE TABLE IF NOT EXISTS rm_membership_compliance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  required_cents BIGINT NOT NULL DEFAULT 0,
  satisfied_cents BIGINT NOT NULL DEFAULT 0,
  shortfall_cents BIGINT NOT NULL DEFAULT 0,
  compliance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'on_track',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_rm_membership_compliance ON rm_membership_compliance (tenant_id, membership_account_id, period_key);

CREATE TABLE IF NOT EXISTS rm_membership_spend (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  category TEXT NOT NULL,
  spend_cents BIGINT NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_rm_membership_spend ON rm_membership_spend (tenant_id, membership_account_id, period_key, category);

CREATE TABLE IF NOT EXISTS rm_membership_churn (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low',
  days_since_last_visit INTEGER,
  visit_trend TEXT,
  spend_trend TEXT,
  autopay_failures INTEGER NOT NULL DEFAULT 0,
  has_hold BOOLEAN NOT NULL DEFAULT false,
  has_late_fees BOOLEAN NOT NULL DEFAULT false,
  predicted_churn_month TEXT,
  factors_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_rm_membership_churn ON rm_membership_churn (tenant_id, membership_account_id);

CREATE TABLE IF NOT EXISTS rm_membership_portfolio (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  as_of_date DATE NOT NULL,
  total_accounts INTEGER NOT NULL DEFAULT 0,
  active_accounts INTEGER NOT NULL DEFAULT 0,
  suspended_accounts INTEGER NOT NULL DEFAULT 0,
  frozen_accounts INTEGER NOT NULL DEFAULT 0,
  terminated_accounts INTEGER NOT NULL DEFAULT 0,
  total_ar_cents BIGINT NOT NULL DEFAULT 0,
  total_deferred_revenue_cents BIGINT NOT NULL DEFAULT 0,
  avg_account_age_days INTEGER,
  new_accounts_this_month INTEGER NOT NULL DEFAULT 0,
  terminated_this_month INTEGER NOT NULL DEFAULT 0,
  net_member_growth INTEGER NOT NULL DEFAULT 0,
  total_dues_revenue_cents BIGINT NOT NULL DEFAULT 0,
  total_initiation_revenue_cents BIGINT NOT NULL DEFAULT 0,
  total_minimum_revenue_cents BIGINT NOT NULL DEFAULT 0,
  total_late_fee_revenue_cents BIGINT NOT NULL DEFAULT 0,
  autopay_adoption_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_collection_days NUMERIC(5,1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_rm_membership_portfolio ON rm_membership_portfolio (tenant_id, as_of_date);

-- RLS
ALTER TABLE rm_membership_aging ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_membership_aging FORCE ROW LEVEL SECURITY;
CREATE POLICY rm_membership_aging_select ON rm_membership_aging FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_aging_insert ON rm_membership_aging FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_aging_update ON rm_membership_aging FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

ALTER TABLE rm_membership_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_membership_compliance FORCE ROW LEVEL SECURITY;
CREATE POLICY rm_membership_compliance_select ON rm_membership_compliance FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_compliance_insert ON rm_membership_compliance FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_compliance_update ON rm_membership_compliance FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

ALTER TABLE rm_membership_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_membership_spend FORCE ROW LEVEL SECURITY;
CREATE POLICY rm_membership_spend_select ON rm_membership_spend FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_spend_insert ON rm_membership_spend FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_spend_update ON rm_membership_spend FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

ALTER TABLE rm_membership_churn ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_membership_churn FORCE ROW LEVEL SECURITY;
CREATE POLICY rm_membership_churn_select ON rm_membership_churn FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_churn_insert ON rm_membership_churn FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_churn_update ON rm_membership_churn FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

ALTER TABLE rm_membership_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_membership_portfolio FORCE ROW LEVEL SECURITY;
CREATE POLICY rm_membership_portfolio_select ON rm_membership_portfolio FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_portfolio_insert ON rm_membership_portfolio FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_membership_portfolio_update ON rm_membership_portfolio FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
