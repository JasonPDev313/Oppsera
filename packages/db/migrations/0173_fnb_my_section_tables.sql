-- Migration: fnb_my_section_tables
-- Lightweight per-server, per-day table claims for "My Section" feature.
-- Queries always filter by business_date so old rows are automatically invisible.

CREATE TABLE IF NOT EXISTS fnb_my_section_tables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  room_id TEXT NOT NULL REFERENCES floor_plan_rooms(id),
  server_user_id TEXT NOT NULL,
  table_id TEXT NOT NULL REFERENCES fnb_tables(id),
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One server per table per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_my_section_tenant_table_date
  ON fnb_my_section_tables (tenant_id, table_id, business_date);

-- Fast lookup: "which tables does this server have today?"
CREATE INDEX IF NOT EXISTS idx_fnb_my_section_server_date
  ON fnb_my_section_tables (tenant_id, server_user_id, business_date);

-- Fast lookup: "who has tables in this room today?" (manager view)
CREATE INDEX IF NOT EXISTS idx_fnb_my_section_room_date
  ON fnb_my_section_tables (tenant_id, room_id, business_date);

-- RLS
ALTER TABLE fnb_my_section_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_my_section_tables FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_my_section_tables_select' AND tablename = 'fnb_my_section_tables') THEN
    CREATE POLICY fnb_my_section_tables_select ON fnb_my_section_tables
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_my_section_tables_insert' AND tablename = 'fnb_my_section_tables') THEN
    CREATE POLICY fnb_my_section_tables_insert ON fnb_my_section_tables
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_my_section_tables_update' AND tablename = 'fnb_my_section_tables') THEN
    CREATE POLICY fnb_my_section_tables_update ON fnb_my_section_tables
      FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_my_section_tables_delete' AND tablename = 'fnb_my_section_tables') THEN
    CREATE POLICY fnb_my_section_tables_delete ON fnb_my_section_tables
      FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
