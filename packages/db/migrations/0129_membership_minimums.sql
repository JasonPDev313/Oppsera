-- Migration 0129: Membership Minimums Engine + Progress UX
-- Extends minimum_spend_rules with bucket/allocation/rollover/exclusion columns
-- Creates 2 new tables (minimum_eligibility_rules, minimum_period_rollups)

-- ── Extend minimum_spend_rules ──────────────────────────────────────
ALTER TABLE minimum_spend_rules ADD COLUMN IF NOT EXISTS bucket_type TEXT;
ALTER TABLE minimum_spend_rules ADD COLUMN IF NOT EXISTS allocation_method TEXT DEFAULT 'first_match';
ALTER TABLE minimum_spend_rules ADD COLUMN IF NOT EXISTS rollover_policy TEXT DEFAULT 'none';
ALTER TABLE minimum_spend_rules ADD COLUMN IF NOT EXISTS exclude_tax BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE minimum_spend_rules ADD COLUMN IF NOT EXISTS exclude_tips BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE minimum_spend_rules ADD COLUMN IF NOT EXISTS exclude_service_charges BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE minimum_spend_rules ADD COLUMN IF NOT EXISTS exclude_dues BOOLEAN NOT NULL DEFAULT true;

-- ── minimum_eligibility_rules ───────────────────────────────────────
CREATE TABLE minimum_eligibility_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  rule_id TEXT NOT NULL,
  condition JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_minimum_eligibility_rules_tenant_rule ON minimum_eligibility_rules(tenant_id, rule_id);

ALTER TABLE minimum_eligibility_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE minimum_eligibility_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY minimum_eligibility_rules_select ON minimum_eligibility_rules
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY minimum_eligibility_rules_insert ON minimum_eligibility_rules
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY minimum_eligibility_rules_update ON minimum_eligibility_rules
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY minimum_eligibility_rules_delete ON minimum_eligibility_rules
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── minimum_period_rollups ──────────────────────────────────────────
CREATE TABLE minimum_period_rollups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  minimum_spend_rule_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  required_cents BIGINT NOT NULL DEFAULT 0,
  satisfied_cents BIGINT NOT NULL DEFAULT 0,
  shortfall_cents BIGINT NOT NULL DEFAULT 0,
  rollover_in_cents BIGINT NOT NULL DEFAULT 0,
  rollover_out_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_minimum_period_rollups_tenant_customer_period ON minimum_period_rollups(tenant_id, customer_id, period_start);
CREATE INDEX idx_minimum_period_rollups_tenant_rule_period ON minimum_period_rollups(tenant_id, minimum_spend_rule_id, period_start);
CREATE INDEX idx_minimum_period_rollups_tenant_status ON minimum_period_rollups(tenant_id, status);
CREATE UNIQUE INDEX uq_minimum_period_rollups_tenant_customer_rule_period ON minimum_period_rollups(tenant_id, customer_id, minimum_spend_rule_id, period_start);

ALTER TABLE minimum_period_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE minimum_period_rollups FORCE ROW LEVEL SECURITY;

CREATE POLICY minimum_period_rollups_select ON minimum_period_rollups
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY minimum_period_rollups_insert ON minimum_period_rollups
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY minimum_period_rollups_update ON minimum_period_rollups
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY minimum_period_rollups_delete ON minimum_period_rollups
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
