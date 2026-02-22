-- Session 44: F&B GL Account Mappings
-- Maps F&B categories (departments, discounts, comps, etc.) to GL accounts per location.

CREATE TABLE IF NOT EXISTS fnb_gl_account_mappings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- 'department', 'sub_department', 'tax_group', 'payment_type', 'service_charge', 'comp', 'discount', 'cash_over_short', 'tip', 'gift_card'
  entity_id TEXT NOT NULL,    -- specific sub-category or 'default'
  revenue_account_id TEXT REFERENCES gl_accounts(id),
  expense_account_id TEXT REFERENCES gl_accounts(id),
  liability_account_id TEXT REFERENCES gl_accounts(id),
  asset_account_id TEXT REFERENCES gl_accounts(id),
  contra_revenue_account_id TEXT REFERENCES gl_accounts(id),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, location_id, entity_type, entity_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fnb_gl_mappings_tenant_location
  ON fnb_gl_account_mappings(tenant_id, location_id);

-- RLS
ALTER TABLE fnb_gl_account_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_gl_account_mappings FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_gl_mappings_select ON fnb_gl_account_mappings
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY fnb_gl_mappings_insert ON fnb_gl_account_mappings
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY fnb_gl_mappings_update ON fnb_gl_account_mappings
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY fnb_gl_mappings_delete ON fnb_gl_account_mappings
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
