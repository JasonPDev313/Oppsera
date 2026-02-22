-- Migration 0124: Customer Financial Engine
-- Customer 360 Session 2: Billing account types, AR enrichment, audit trail, statement delivery

-- ── Extend billing_accounts ──────────────────────────────────────────
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'house';
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS autopay_strategy TEXT;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS autopay_fixed_amount_cents BIGINT;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS autopay_payment_method_id TEXT;

-- ── Extend ar_transactions ───────────────────────────────────────────
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS source_module TEXT;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS business_date DATE;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS department_id TEXT;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS sub_department_id TEXT;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS location_id TEXT;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS profit_center_id TEXT;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS member_id TEXT;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE ar_transactions ADD COLUMN IF NOT EXISTS meta_json JSONB;

-- ── Extend statements ────────────────────────────────────────────────
ALTER TABLE statements ADD COLUMN IF NOT EXISTS statement_number TEXT;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE statements ADD COLUMN IF NOT EXISTS pdf_storage_key TEXT;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS meta_json JSONB;

-- ── Create customer_audit_log ────────────────────────────────────────
CREATE TABLE customer_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_audit_log_tenant_customer_occurred
  ON customer_audit_log(tenant_id, customer_id, occurred_at);
CREATE INDEX idx_customer_audit_log_tenant_action
  ON customer_audit_log(tenant_id, action_type);

-- ── RLS: customer_audit_log ──────────────────────────────────────────
ALTER TABLE customer_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_audit_log_select ON customer_audit_log
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_audit_log_insert ON customer_audit_log
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_audit_log_update ON customer_audit_log
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_audit_log_delete ON customer_audit_log
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
