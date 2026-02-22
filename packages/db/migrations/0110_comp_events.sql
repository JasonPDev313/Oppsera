-- UXOPS-03: Comp events + settings for comp expense GL
-- Tracks comp events separately from discounts for GL separation.
-- Comp = expense (business eats cost); Discount = contra-revenue (customer-facing).

-- ── comp_events ─────────────────────────────────────────────────
CREATE TABLE comp_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  order_line_id TEXT,
  comp_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  comp_category TEXT NOT NULL DEFAULT 'manager',
  approved_by TEXT NOT NULL,
  gl_journal_entry_id TEXT,
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comp_events_tenant_order
  ON comp_events (tenant_id, order_id);

CREATE INDEX idx_comp_events_tenant_date
  ON comp_events (tenant_id, business_date);

-- RLS
ALTER TABLE comp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE comp_events FORCE ROW LEVEL SECURITY;

CREATE POLICY comp_events_select ON comp_events
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY comp_events_insert ON comp_events
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY comp_events_update ON comp_events
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- ── accounting_settings: add default comp expense account ─────
ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_comp_expense_account_id TEXT REFERENCES gl_accounts(id);

-- ── sub_department_gl_defaults: add comp account ──────────────
ALTER TABLE sub_department_gl_defaults
  ADD COLUMN IF NOT EXISTS comp_account_id TEXT REFERENCES gl_accounts(id);
