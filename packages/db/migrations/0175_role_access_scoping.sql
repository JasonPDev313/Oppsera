-- Migration 0175: Role access scoping
-- Adds junction tables for role-based access to locations, profit centers, and terminals.
-- Convention: empty table = unrestricted (role sees everything at that level).

-- ── Role Location Access ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_location_access (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_role_location_access_tenant_role
  ON role_location_access(tenant_id, role_id);

-- ── Role Profit Center Access ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_profit_center_access (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  profit_center_id TEXT NOT NULL REFERENCES terminal_locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, profit_center_id)
);

CREATE INDEX IF NOT EXISTS idx_role_profit_center_access_tenant_role
  ON role_profit_center_access(tenant_id, role_id);

-- ── Role Terminal Access ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_terminal_access (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  terminal_id TEXT NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, terminal_id)
);

CREATE INDEX IF NOT EXISTS idx_role_terminal_access_tenant_role
  ON role_terminal_access(tenant_id, role_id);

-- ── RLS Policies ──────────────────────────────────────────────────
ALTER TABLE role_location_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_location_access FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_location_access' AND policyname = 'role_location_access_select') THEN
    CREATE POLICY role_location_access_select ON role_location_access FOR SELECT USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_location_access' AND policyname = 'role_location_access_insert') THEN
    CREATE POLICY role_location_access_insert ON role_location_access FOR INSERT WITH CHECK (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_location_access' AND policyname = 'role_location_access_delete') THEN
    CREATE POLICY role_location_access_delete ON role_location_access FOR DELETE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
END $$;

ALTER TABLE role_profit_center_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_profit_center_access FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_profit_center_access' AND policyname = 'role_pc_access_select') THEN
    CREATE POLICY role_pc_access_select ON role_profit_center_access FOR SELECT USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_profit_center_access' AND policyname = 'role_pc_access_insert') THEN
    CREATE POLICY role_pc_access_insert ON role_profit_center_access FOR INSERT WITH CHECK (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_profit_center_access' AND policyname = 'role_pc_access_delete') THEN
    CREATE POLICY role_pc_access_delete ON role_profit_center_access FOR DELETE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
END $$;

ALTER TABLE role_terminal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_terminal_access FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_terminal_access' AND policyname = 'role_terminal_access_select') THEN
    CREATE POLICY role_terminal_access_select ON role_terminal_access FOR SELECT USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_terminal_access' AND policyname = 'role_terminal_access_insert') THEN
    CREATE POLICY role_terminal_access_insert ON role_terminal_access FOR INSERT WITH CHECK (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'role_terminal_access' AND policyname = 'role_terminal_access_delete') THEN
    CREATE POLICY role_terminal_access_delete ON role_terminal_access FOR DELETE USING (
      tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
  END IF;
END $$;
