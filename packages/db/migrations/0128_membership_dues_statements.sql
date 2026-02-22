-- Migration 0128: Membership Dues Engine + Statements
-- Creates 2 new tables (membership_subscriptions, statement_lines)
-- Extends statements with membership_account_id

-- ── membership_subscriptions ──────────────────────────────────────
CREATE TABLE membership_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL REFERENCES membership_accounts(id),
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  effective_start DATE NOT NULL,
  effective_end DATE,
  next_bill_date DATE,
  last_billed_date DATE,
  billed_through_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_subscriptions_tenant_account ON membership_subscriptions(tenant_id, membership_account_id);
CREATE INDEX idx_membership_subscriptions_tenant_status ON membership_subscriptions(tenant_id, status);
CREATE INDEX idx_membership_subscriptions_tenant_next_bill ON membership_subscriptions(tenant_id, next_bill_date);

ALTER TABLE membership_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_subscriptions_select ON membership_subscriptions
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_subscriptions_insert ON membership_subscriptions
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_subscriptions_update ON membership_subscriptions
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_subscriptions_delete ON membership_subscriptions
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── statement_lines ───────────────────────────────────────────────
CREATE TABLE statement_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  statement_id TEXT NOT NULL REFERENCES statements(id),
  line_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  source_transaction_id TEXT,
  department_id TEXT,
  meta_json JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_statement_lines_tenant_statement ON statement_lines(tenant_id, statement_id);

ALTER TABLE statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY statement_lines_select ON statement_lines
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY statement_lines_insert ON statement_lines
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY statement_lines_update ON statement_lines
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY statement_lines_delete ON statement_lines
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── Extend statements with membership_account_id ──────────────────
ALTER TABLE statements ADD COLUMN IF NOT EXISTS membership_account_id TEXT;
