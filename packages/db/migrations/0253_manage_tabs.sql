-- Migration 0253: Manage Tabs — bulk tab management + manager override audit
-- Tables: fnb_manager_overrides, fnb_manage_tabs_settings

-- ── fnb_manager_overrides ──────────────────────────────────────────────
-- Audit trail for every manager-authorized bulk action
CREATE TABLE IF NOT EXISTS fnb_manager_overrides (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  initiator_user_id TEXT NOT NULL,
  approver_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  tab_ids TEXT[] NOT NULL,
  reason_code TEXT,
  reason_text TEXT,
  metadata JSONB DEFAULT '{}',
  result_summary JSONB DEFAULT '{}',
  device_id TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fnb_manager_overrides_tenant_created
  ON fnb_manager_overrides (tenant_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_manager_overrides_idempotency
  ON fnb_manager_overrides (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fnb_manager_overrides_tenant_action
  ON fnb_manager_overrides (tenant_id, action_type);

-- RLS
ALTER TABLE fnb_manager_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_manager_overrides FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_manager_overrides_select' AND tablename = 'fnb_manager_overrides') THEN
    CREATE POLICY fnb_manager_overrides_select ON fnb_manager_overrides
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_manager_overrides_insert' AND tablename = 'fnb_manager_overrides') THEN
    CREATE POLICY fnb_manager_overrides_insert ON fnb_manager_overrides
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_manager_overrides_update' AND tablename = 'fnb_manager_overrides') THEN
    CREATE POLICY fnb_manager_overrides_update ON fnb_manager_overrides
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_manager_overrides_delete' AND tablename = 'fnb_manager_overrides') THEN
    CREATE POLICY fnb_manager_overrides_delete ON fnb_manager_overrides
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;


-- ── fnb_manage_tabs_settings ───────────────────────────────────────────
-- Per-tenant/location configuration for the Manage Tabs tool
CREATE TABLE IF NOT EXISTS fnb_manage_tabs_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT REFERENCES locations(id),
  show_manage_tabs_button BOOLEAN DEFAULT true,
  require_pin_for_transfer BOOLEAN DEFAULT false,
  require_pin_for_void BOOLEAN DEFAULT true,
  allow_bulk_all_servers BOOLEAN DEFAULT false,
  read_only_for_non_managers BOOLEAN DEFAULT false,
  max_bulk_selection INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, location_id)
);

-- RLS
ALTER TABLE fnb_manage_tabs_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_manage_tabs_settings FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_manage_tabs_settings_select' AND tablename = 'fnb_manage_tabs_settings') THEN
    CREATE POLICY fnb_manage_tabs_settings_select ON fnb_manage_tabs_settings
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_manage_tabs_settings_insert' AND tablename = 'fnb_manage_tabs_settings') THEN
    CREATE POLICY fnb_manage_tabs_settings_insert ON fnb_manage_tabs_settings
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_manage_tabs_settings_update' AND tablename = 'fnb_manage_tabs_settings') THEN
    CREATE POLICY fnb_manage_tabs_settings_update ON fnb_manage_tabs_settings
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_manage_tabs_settings_delete' AND tablename = 'fnb_manage_tabs_settings') THEN
    CREATE POLICY fnb_manage_tabs_settings_delete ON fnb_manage_tabs_settings
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
