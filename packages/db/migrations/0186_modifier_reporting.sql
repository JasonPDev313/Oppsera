-- Migration: 0186_modifier_reporting
-- Purpose: Read model tables for modifier reporting + cost column on catalog_modifiers

-- ── ALTER catalog_modifiers — add cost column ─────────────────────
ALTER TABLE catalog_modifiers ADD COLUMN IF NOT EXISTS cost NUMERIC(10,4) DEFAULT NULL;

-- ── rm_modifier_item_sales ────────────────────────────────────────
-- Modifier × Item × Day granular read model.
CREATE TABLE IF NOT EXISTS rm_modifier_item_sales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date TEXT NOT NULL,
  modifier_id TEXT NOT NULL,
  modifier_group_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  modifier_name TEXT,
  group_name TEXT,
  catalog_item_name TEXT,
  times_selected INT NOT NULL DEFAULT 0,
  revenue_dollars NUMERIC(19,4) NOT NULL DEFAULT 0,
  extra_revenue_dollars NUMERIC(19,4) NOT NULL DEFAULT 0,
  instruction_none INT NOT NULL DEFAULT 0,
  instruction_extra INT NOT NULL DEFAULT 0,
  instruction_on_side INT NOT NULL DEFAULT 0,
  instruction_default INT NOT NULL DEFAULT 0,
  void_count INT NOT NULL DEFAULT 0,
  void_revenue_dollars NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_mod_item_sales_key
  ON rm_modifier_item_sales (tenant_id, location_id, business_date, modifier_id, catalog_item_id);

CREATE INDEX IF NOT EXISTS idx_rm_mod_item_sales_date
  ON rm_modifier_item_sales (tenant_id, business_date);

CREATE INDEX IF NOT EXISTS idx_rm_mod_item_sales_group
  ON rm_modifier_item_sales (tenant_id, modifier_group_id);

-- ── rm_modifier_daypart ───────────────────────────────────────────
-- Modifier × Daypart × Day (no item dimension, for daypart heatmap).
CREATE TABLE IF NOT EXISTS rm_modifier_daypart (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date TEXT NOT NULL,
  modifier_id TEXT NOT NULL,
  modifier_group_id TEXT NOT NULL,
  daypart TEXT NOT NULL,
  modifier_name TEXT,
  group_name TEXT,
  times_selected INT NOT NULL DEFAULT 0,
  revenue_dollars NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_mod_daypart_key
  ON rm_modifier_daypart (tenant_id, location_id, business_date, modifier_id, daypart);

CREATE INDEX IF NOT EXISTS idx_rm_mod_daypart_date
  ON rm_modifier_daypart (tenant_id, business_date);

-- ── rm_modifier_group_attach ──────────────────────────────────────
-- Group-level attach rate tracking (denominator = eligible lines).
CREATE TABLE IF NOT EXISTS rm_modifier_group_attach (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date TEXT NOT NULL,
  modifier_group_id TEXT NOT NULL,
  group_name TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  eligible_line_count INT NOT NULL DEFAULT 0,
  lines_with_selection INT NOT NULL DEFAULT 0,
  total_modifier_selections INT NOT NULL DEFAULT 0,
  unique_modifiers_selected INT NOT NULL DEFAULT 0,
  revenue_impact_dollars NUMERIC(19,4) NOT NULL DEFAULT 0,
  void_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_mod_group_attach_key
  ON rm_modifier_group_attach (tenant_id, location_id, business_date, modifier_group_id);

CREATE INDEX IF NOT EXISTS idx_rm_mod_group_attach_date
  ON rm_modifier_group_attach (tenant_id, business_date);

-- ── RLS Policies ──────────────────────────────────────────────────

ALTER TABLE rm_modifier_item_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_modifier_item_sales FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_item_sales_select' AND tablename = 'rm_modifier_item_sales') THEN
    CREATE POLICY rm_mod_item_sales_select ON rm_modifier_item_sales FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_item_sales_insert' AND tablename = 'rm_modifier_item_sales') THEN
    CREATE POLICY rm_mod_item_sales_insert ON rm_modifier_item_sales FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_item_sales_update' AND tablename = 'rm_modifier_item_sales') THEN
    CREATE POLICY rm_mod_item_sales_update ON rm_modifier_item_sales FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_item_sales_delete' AND tablename = 'rm_modifier_item_sales') THEN
    CREATE POLICY rm_mod_item_sales_delete ON rm_modifier_item_sales FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

ALTER TABLE rm_modifier_daypart ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_modifier_daypart FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_daypart_select' AND tablename = 'rm_modifier_daypart') THEN
    CREATE POLICY rm_mod_daypart_select ON rm_modifier_daypart FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_daypart_insert' AND tablename = 'rm_modifier_daypart') THEN
    CREATE POLICY rm_mod_daypart_insert ON rm_modifier_daypart FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_daypart_update' AND tablename = 'rm_modifier_daypart') THEN
    CREATE POLICY rm_mod_daypart_update ON rm_modifier_daypart FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_daypart_delete' AND tablename = 'rm_modifier_daypart') THEN
    CREATE POLICY rm_mod_daypart_delete ON rm_modifier_daypart FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

ALTER TABLE rm_modifier_group_attach ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_modifier_group_attach FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_group_attach_select' AND tablename = 'rm_modifier_group_attach') THEN
    CREATE POLICY rm_mod_group_attach_select ON rm_modifier_group_attach FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_group_attach_insert' AND tablename = 'rm_modifier_group_attach') THEN
    CREATE POLICY rm_mod_group_attach_insert ON rm_modifier_group_attach FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_group_attach_update' AND tablename = 'rm_modifier_group_attach') THEN
    CREATE POLICY rm_mod_group_attach_update ON rm_modifier_group_attach FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_mod_group_attach_delete' AND tablename = 'rm_modifier_group_attach') THEN
    CREATE POLICY rm_mod_group_attach_delete ON rm_modifier_group_attach FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
