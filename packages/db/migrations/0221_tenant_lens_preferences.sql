-- Tenant Lens Preferences
-- Opt-out model: all system lenses are enabled by default.
-- When a tenant disables a lens, a row is inserted with enabled = false.

CREATE TABLE IF NOT EXISTS tenant_lens_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  lens_slug TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, lens_slug)
);

-- RLS
ALTER TABLE tenant_lens_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_lens_preferences FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_lens_preferences_select' AND tablename = 'tenant_lens_preferences') THEN
    CREATE POLICY tenant_lens_preferences_select ON tenant_lens_preferences
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_lens_preferences_insert' AND tablename = 'tenant_lens_preferences') THEN
    CREATE POLICY tenant_lens_preferences_insert ON tenant_lens_preferences
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_lens_preferences_update' AND tablename = 'tenant_lens_preferences') THEN
    CREATE POLICY tenant_lens_preferences_update ON tenant_lens_preferences
      FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_lens_preferences_delete' AND tablename = 'tenant_lens_preferences') THEN
    CREATE POLICY tenant_lens_preferences_delete ON tenant_lens_preferences
      FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- Index for fast lookup by tenant
CREATE INDEX IF NOT EXISTS idx_tenant_lens_preferences_tenant
  ON tenant_lens_preferences (tenant_id);
