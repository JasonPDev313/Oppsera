-- 0235_fixed_assets.sql
-- Fixed Asset Register: asset tracking + periodic depreciation with GL integration

----------------------------------------------------------------------
-- 1. fixed_assets
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                                TEXT PRIMARY KEY,
  tenant_id                         TEXT NOT NULL REFERENCES tenants(id),
  location_id                       TEXT REFERENCES locations(id),
  asset_number                      TEXT NOT NULL,
  name                              TEXT NOT NULL,
  description                       TEXT,
  category                          TEXT NOT NULL
    CHECK (category IN ('building','equipment','vehicle','furniture','technology','leasehold_improvement','other')),
  status                            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','fully_depreciated','disposed','written_off')),
  acquisition_date                  DATE NOT NULL,
  acquisition_cost                  NUMERIC(12,2) NOT NULL,
  salvage_value                     NUMERIC(12,2) NOT NULL DEFAULT 0,
  useful_life_months                INTEGER NOT NULL,
  depreciation_method               TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line','declining_balance','sum_of_years')),
  asset_gl_account_id               TEXT REFERENCES gl_accounts(id),
  depreciation_expense_account_id   TEXT REFERENCES gl_accounts(id),
  accumulated_depreciation_account_id TEXT REFERENCES gl_accounts(id),
  disposal_date                     DATE,
  disposal_proceeds                 NUMERIC(12,2),
  disposal_gl_account_id            TEXT REFERENCES gl_accounts(id),
  notes                             TEXT,
  metadata                          JSONB DEFAULT '{}',
  created_by                        TEXT,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique asset number per tenant
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_fixed_assets_tenant_asset_number'
  ) THEN
    ALTER TABLE fixed_assets
      ADD CONSTRAINT uq_fixed_assets_tenant_asset_number UNIQUE (tenant_id, asset_number);
  END IF;
END $$;

----------------------------------------------------------------------
-- 2. fixed_asset_depreciation
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fixed_asset_depreciation (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  asset_id              TEXT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_date           DATE NOT NULL,
  depreciation_amount   NUMERIC(12,2) NOT NULL,
  accumulated_total     NUMERIC(12,2) NOT NULL,
  net_book_value        NUMERIC(12,2) NOT NULL,
  gl_journal_entry_id   TEXT REFERENCES gl_journal_entries(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One depreciation entry per asset per period
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_fixed_asset_depreciation_asset_period'
  ) THEN
    ALTER TABLE fixed_asset_depreciation
      ADD CONSTRAINT uq_fixed_asset_depreciation_asset_period UNIQUE (asset_id, period_date);
  END IF;
END $$;

----------------------------------------------------------------------
-- 3. Indexes
----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant
  ON fixed_assets (tenant_id);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant_status
  ON fixed_assets (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant_category
  ON fixed_assets (tenant_id, category);

CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_tenant
  ON fixed_asset_depreciation (tenant_id);

CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_tenant_asset
  ON fixed_asset_depreciation (tenant_id, asset_id);

----------------------------------------------------------------------
-- 4. RLS — fixed_assets
----------------------------------------------------------------------
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fixed_assets_select ON fixed_assets;
CREATE POLICY fixed_assets_select ON fixed_assets
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS fixed_assets_insert ON fixed_assets;
CREATE POLICY fixed_assets_insert ON fixed_assets
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS fixed_assets_update ON fixed_assets;
CREATE POLICY fixed_assets_update ON fixed_assets
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS fixed_assets_delete ON fixed_assets;
CREATE POLICY fixed_assets_delete ON fixed_assets
  FOR DELETE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

----------------------------------------------------------------------
-- 5. RLS — fixed_asset_depreciation
----------------------------------------------------------------------
ALTER TABLE fixed_asset_depreciation ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_asset_depreciation FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fixed_asset_depreciation_select ON fixed_asset_depreciation;
CREATE POLICY fixed_asset_depreciation_select ON fixed_asset_depreciation
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS fixed_asset_depreciation_insert ON fixed_asset_depreciation;
CREATE POLICY fixed_asset_depreciation_insert ON fixed_asset_depreciation
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS fixed_asset_depreciation_update ON fixed_asset_depreciation;
CREATE POLICY fixed_asset_depreciation_update ON fixed_asset_depreciation
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS fixed_asset_depreciation_delete ON fixed_asset_depreciation;
CREATE POLICY fixed_asset_depreciation_delete ON fixed_asset_depreciation
  FOR DELETE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );
