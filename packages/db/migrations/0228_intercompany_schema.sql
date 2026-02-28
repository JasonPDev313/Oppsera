-- 0228_intercompany_schema.sql
-- Intercompany elimination schema foundation
-- Adds legal entity fields to locations + intercompany GL account pair templates

-- ── Legal entity columns on locations ──────────────────────────
ALTER TABLE locations ADD COLUMN IF NOT EXISTS legal_entity_code TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_entity_id TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_legal_entity BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS consolidation_group TEXT;

-- Unique legal_entity_code per tenant (only for non-NULL codes)
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_legal_entity_code
  ON locations (tenant_id, legal_entity_code)
  WHERE legal_entity_code IS NOT NULL;

-- Index for consolidation group queries
CREATE INDEX IF NOT EXISTS idx_locations_consolidation_group
  ON locations (tenant_id, consolidation_group)
  WHERE consolidation_group IS NOT NULL;

-- ── Intercompany GL Account Pairs ──────────────────────────────
CREATE TABLE IF NOT EXISTS intercompany_gl_account_pairs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  entity_a_location_id TEXT NOT NULL REFERENCES locations(id),
  entity_b_location_id TEXT NOT NULL REFERENCES locations(id),
  ar_account_id TEXT REFERENCES gl_accounts(id),
  ap_account_id TEXT REFERENCES gl_accounts(id),
  revenue_elimination_account_id TEXT REFERENCES gl_accounts(id),
  expense_elimination_account_id TEXT REFERENCES gl_accounts(id),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archived_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_intercompany_different_entities CHECK (entity_a_location_id <> entity_b_location_id)
);

CREATE INDEX IF NOT EXISTS idx_intercompany_pairs_tenant
  ON intercompany_gl_account_pairs (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intercompany_pairs_entities
  ON intercompany_gl_account_pairs (tenant_id, entity_a_location_id, entity_b_location_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_intercompany_pairs_entity_a
  ON intercompany_gl_account_pairs (tenant_id, entity_a_location_id);

CREATE INDEX IF NOT EXISTS idx_intercompany_pairs_entity_b
  ON intercompany_gl_account_pairs (tenant_id, entity_b_location_id);

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE intercompany_gl_account_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercompany_gl_account_pairs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intercompany_gl_account_pairs' AND policyname = 'intercompany_pairs_select') THEN
    CREATE POLICY intercompany_pairs_select ON intercompany_gl_account_pairs
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intercompany_gl_account_pairs' AND policyname = 'intercompany_pairs_insert') THEN
    CREATE POLICY intercompany_pairs_insert ON intercompany_gl_account_pairs
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intercompany_gl_account_pairs' AND policyname = 'intercompany_pairs_update') THEN
    CREATE POLICY intercompany_pairs_update ON intercompany_gl_account_pairs
      FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intercompany_gl_account_pairs' AND policyname = 'intercompany_pairs_delete') THEN
    CREATE POLICY intercompany_pairs_delete ON intercompany_gl_account_pairs
      FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── Seed intercompany GL account templates ─────────────────────
-- These templates are available for all business types
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name)
VALUES
  ('ic-ar-1300-golf',       'golf_default',       '1300', 'Intercompany Receivable',              'asset',     'debit',  'Current Assets'),
  ('ic-ar-1300-retail',     'retail_default',     '1300', 'Intercompany Receivable',              'asset',     'debit',  'Current Assets'),
  ('ic-ar-1300-restaurant', 'restaurant_default', '1300', 'Intercompany Receivable',              'asset',     'debit',  'Current Assets'),
  ('ic-ar-1300-hybrid',     'hybrid_default',     '1300', 'Intercompany Receivable',              'asset',     'debit',  'Current Assets'),
  ('ic-ap-2900-golf',       'golf_default',       '2900', 'Intercompany Payable',                 'liability', 'credit', 'Current Liabilities'),
  ('ic-ap-2900-retail',     'retail_default',     '2900', 'Intercompany Payable',                 'liability', 'credit', 'Current Liabilities'),
  ('ic-ap-2900-restaurant', 'restaurant_default', '2900', 'Intercompany Payable',                 'liability', 'credit', 'Current Liabilities'),
  ('ic-ap-2900-hybrid',     'hybrid_default',     '2900', 'Intercompany Payable',                 'liability', 'credit', 'Current Liabilities'),
  ('ic-rev-4900-golf',       'golf_default',       '4900', 'Intercompany Revenue (Elimination)',   'revenue',   'credit', 'Revenue'),
  ('ic-rev-4900-retail',     'retail_default',     '4900', 'Intercompany Revenue (Elimination)',   'revenue',   'credit', 'Revenue'),
  ('ic-rev-4900-restaurant', 'restaurant_default', '4900', 'Intercompany Revenue (Elimination)',   'revenue',   'credit', 'Revenue'),
  ('ic-rev-4900-hybrid',     'hybrid_default',     '4900', 'Intercompany Revenue (Elimination)',   'revenue',   'credit', 'Revenue'),
  ('ic-exp-5900-golf',       'golf_default',       '5900', 'Intercompany Expense (Elimination)',   'expense',   'debit',  'Operating Expenses'),
  ('ic-exp-5900-retail',     'retail_default',     '5900', 'Intercompany Expense (Elimination)',   'expense',   'debit',  'Operating Expenses'),
  ('ic-exp-5900-restaurant', 'restaurant_default', '5900', 'Intercompany Expense (Elimination)',   'expense',   'debit',  'Operating Expenses'),
  ('ic-exp-5900-hybrid',     'hybrid_default',     '5900', 'Intercompany Expense (Elimination)',   'expense',   'debit',  'Operating Expenses')
ON CONFLICT (id) DO NOTHING;
