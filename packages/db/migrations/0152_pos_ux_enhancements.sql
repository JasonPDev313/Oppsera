-- Migration 0151: POS UX Enhancements
-- Adds schema support for category colors, quick menu configs, tip settings,
-- POS layout config, and manager override PINs.

-- ── P1.1: Category color ────────────────────────────────────────────────
ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS color VARCHAR(7);

-- ── P3.1: Quick menu config ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_quick_menu_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  profit_center_id TEXT REFERENCES terminal_locations(id),
  name TEXT NOT NULL DEFAULT 'Default',
  pages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_quick_menu_tenant ON pos_quick_menu_configs(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_quick_menu_tenant_pc ON pos_quick_menu_configs(tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;

-- RLS for pos_quick_menu_configs
ALTER TABLE pos_quick_menu_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_quick_menu_configs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_quick_menu_configs_select_policy') THEN
    CREATE POLICY pos_quick_menu_configs_select_policy ON pos_quick_menu_configs
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_quick_menu_configs_insert_policy') THEN
    CREATE POLICY pos_quick_menu_configs_insert_policy ON pos_quick_menu_configs
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_quick_menu_configs_update_policy') THEN
    CREATE POLICY pos_quick_menu_configs_update_policy ON pos_quick_menu_configs
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_quick_menu_configs_delete_policy') THEN
    CREATE POLICY pos_quick_menu_configs_delete_policy ON pos_quick_menu_configs
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── P3.2: Tip settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_tip_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  profit_center_id TEXT REFERENCES terminal_locations(id),
  enabled BOOLEAN NOT NULL DEFAULT false,
  percentage_options JSONB NOT NULL DEFAULT '[15, 18, 20, 25]',
  dollar_amounts JSONB NOT NULL DEFAULT '[]',
  calculate_before_tax BOOLEAN NOT NULL DEFAULT true,
  default_selection_index INTEGER DEFAULT NULL,
  auto_gratuity_party_size INTEGER DEFAULT NULL,
  auto_gratuity_percentage NUMERIC(5,2) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, profit_center_id)
);

-- RLS for pos_tip_settings
ALTER TABLE pos_tip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_tip_settings FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_tip_settings_select_policy') THEN
    CREATE POLICY pos_tip_settings_select_policy ON pos_tip_settings
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_tip_settings_insert_policy') THEN
    CREATE POLICY pos_tip_settings_insert_policy ON pos_tip_settings
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_tip_settings_update_policy') THEN
    CREATE POLICY pos_tip_settings_update_policy ON pos_tip_settings
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_tip_settings_delete_policy') THEN
    CREATE POLICY pos_tip_settings_delete_policy ON pos_tip_settings
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── P3.3: Layout config on profit centers ───────────────────────────────
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS pos_layout_config JSONB DEFAULT NULL;

-- ── P4.5: Manager PIN on users ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS pos_pin TEXT DEFAULT NULL;
