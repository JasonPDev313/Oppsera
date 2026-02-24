-- Migration 0181: Modifier Groups Enhancement
-- Adds modifier group categories, instruction modes, extra pricing,
-- kitchen label overrides, channel visibility, and per-assignment overrides.

-- ── New table: catalog_modifier_group_categories ──────────────────

CREATE TABLE IF NOT EXISTS catalog_modifier_group_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  parent_id TEXT REFERENCES catalog_modifier_group_categories(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mod_group_categories_tenant
  ON catalog_modifier_group_categories(tenant_id, parent_id);

-- RLS
ALTER TABLE catalog_modifier_group_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_modifier_group_categories FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mod_group_categories_select' AND tablename = 'catalog_modifier_group_categories') THEN
    CREATE POLICY mod_group_categories_select ON catalog_modifier_group_categories
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mod_group_categories_insert' AND tablename = 'catalog_modifier_group_categories') THEN
    CREATE POLICY mod_group_categories_insert ON catalog_modifier_group_categories
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mod_group_categories_update' AND tablename = 'catalog_modifier_group_categories') THEN
    CREATE POLICY mod_group_categories_update ON catalog_modifier_group_categories
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mod_group_categories_delete' AND tablename = 'catalog_modifier_group_categories') THEN
    CREATE POLICY mod_group_categories_delete ON catalog_modifier_group_categories
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── Alter catalog_modifier_groups ─────────────────────────────────

ALTER TABLE catalog_modifier_groups
  ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES catalog_modifier_group_categories(id),
  ADD COLUMN IF NOT EXISTS instruction_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS default_behavior TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS channel_visibility JSONB NOT NULL DEFAULT '["pos","online","qr","kiosk"]',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_mod_groups_category
  ON catalog_modifier_groups(tenant_id, category_id);

-- ── Alter catalog_modifiers ───────────────────────────────────────

ALTER TABLE catalog_modifiers
  ADD COLUMN IF NOT EXISTS extra_price_delta NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS kitchen_label TEXT,
  ADD COLUMN IF NOT EXISTS allow_none BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_extra BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_on_side BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_default_option BOOLEAN NOT NULL DEFAULT false;

-- ── Alter catalog_item_modifier_groups ────────────────────────────

ALTER TABLE catalog_item_modifier_groups
  ADD COLUMN IF NOT EXISTS override_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS override_min_selections INTEGER,
  ADD COLUMN IF NOT EXISTS override_max_selections INTEGER,
  ADD COLUMN IF NOT EXISTS override_instruction_mode TEXT,
  ADD COLUMN IF NOT EXISTS prompt_order INTEGER NOT NULL DEFAULT 0;
