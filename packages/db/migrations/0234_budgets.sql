-- 0234_budgets.sql
-- Budget vs Actual feature: annual/monthly budgets per GL account with variance analysis

-- ── budgets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, approved, locked
  description TEXT,
  location_id TEXT REFERENCES locations(id),
  created_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name, fiscal_year)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budgets_tenant_select') THEN
    CREATE POLICY budgets_tenant_select ON budgets FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budgets_tenant_insert') THEN
    CREATE POLICY budgets_tenant_insert ON budgets FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budgets_tenant_update') THEN
    CREATE POLICY budgets_tenant_update ON budgets FOR UPDATE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budgets_tenant_delete') THEN
    CREATE POLICY budgets_tenant_delete ON budgets FOR DELETE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_budgets_tenant_year ON budgets(tenant_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_status ON budgets(tenant_id, status);

-- ── budget_lines ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  gl_account_id TEXT NOT NULL REFERENCES gl_accounts(id),
  month_1 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_2 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_3 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_4 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_5 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_6 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_7 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_8 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_9 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_10 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_11 NUMERIC(12,2) NOT NULL DEFAULT 0,
  month_12 NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(budget_id, gl_account_id)
);

ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budget_lines_tenant_select') THEN
    CREATE POLICY budget_lines_tenant_select ON budget_lines FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budget_lines_tenant_insert') THEN
    CREATE POLICY budget_lines_tenant_insert ON budget_lines FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budget_lines_tenant_update') THEN
    CREATE POLICY budget_lines_tenant_update ON budget_lines FOR UPDATE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budget_lines_tenant_delete') THEN
    CREATE POLICY budget_lines_tenant_delete ON budget_lines FOR DELETE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON budget_lines(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_account ON budget_lines(gl_account_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_tenant ON budget_lines(tenant_id);
