-- Navigation bar preferences per tenant
CREATE TABLE IF NOT EXISTS tenant_nav_preferences (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  item_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- RLS
ALTER TABLE tenant_nav_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_nav_preferences FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_nav_preferences_select') THEN
    CREATE POLICY tenant_nav_preferences_select ON tenant_nav_preferences
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_nav_preferences_insert') THEN
    CREATE POLICY tenant_nav_preferences_insert ON tenant_nav_preferences
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_nav_preferences_update') THEN
    CREATE POLICY tenant_nav_preferences_update ON tenant_nav_preferences
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_nav_preferences_delete') THEN
    CREATE POLICY tenant_nav_preferences_delete ON tenant_nav_preferences
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
