-- 0151_pms_reporting_suite.sql
-- PMS Reporting Suite: Revenue By Room Type + Housekeeping Productivity read models

-- ── rm_pms_revenue_by_room_type ─────────────────────────────────

CREATE TABLE IF NOT EXISTS rm_pms_revenue_by_room_type (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  property_id       TEXT NOT NULL,
  room_type_id      TEXT NOT NULL,
  business_date     DATE NOT NULL,
  rooms_sold        INTEGER NOT NULL DEFAULT 0,
  room_revenue_cents INTEGER NOT NULL DEFAULT 0,
  tax_revenue_cents  INTEGER NOT NULL DEFAULT 0,
  adr_cents         INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_pms_revenue_room_type
  ON rm_pms_revenue_by_room_type (tenant_id, property_id, room_type_id, business_date);

CREATE INDEX IF NOT EXISTS idx_rm_pms_revenue_room_type_date
  ON rm_pms_revenue_by_room_type (tenant_id, property_id, business_date);

ALTER TABLE rm_pms_revenue_by_room_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_pms_revenue_by_room_type FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rm_pms_revenue_by_room_type' AND policyname = 'rm_pms_revenue_by_room_type_select'
  ) THEN
    CREATE POLICY rm_pms_revenue_by_room_type_select ON rm_pms_revenue_by_room_type
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rm_pms_revenue_by_room_type' AND policyname = 'rm_pms_revenue_by_room_type_insert'
  ) THEN
    CREATE POLICY rm_pms_revenue_by_room_type_insert ON rm_pms_revenue_by_room_type
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rm_pms_revenue_by_room_type' AND policyname = 'rm_pms_revenue_by_room_type_update'
  ) THEN
    CREATE POLICY rm_pms_revenue_by_room_type_update ON rm_pms_revenue_by_room_type
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rm_pms_revenue_by_room_type' AND policyname = 'rm_pms_revenue_by_room_type_delete'
  ) THEN
    CREATE POLICY rm_pms_revenue_by_room_type_delete ON rm_pms_revenue_by_room_type
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;


-- ── rm_pms_housekeeping_productivity ────────────────────────────

CREATE TABLE IF NOT EXISTS rm_pms_housekeeping_productivity (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  property_id       TEXT NOT NULL,
  housekeeper_id    TEXT NOT NULL,
  business_date     DATE NOT NULL,
  rooms_cleaned     INTEGER NOT NULL DEFAULT 0,
  total_minutes     INTEGER NOT NULL DEFAULT 0,
  avg_minutes       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_pms_hk_productivity
  ON rm_pms_housekeeping_productivity (tenant_id, property_id, housekeeper_id, business_date);

CREATE INDEX IF NOT EXISTS idx_rm_pms_hk_productivity_date
  ON rm_pms_housekeeping_productivity (tenant_id, property_id, business_date);

ALTER TABLE rm_pms_housekeeping_productivity ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_pms_housekeeping_productivity FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rm_pms_housekeeping_productivity' AND policyname = 'rm_pms_housekeeping_productivity_select'
  ) THEN
    CREATE POLICY rm_pms_housekeeping_productivity_select ON rm_pms_housekeeping_productivity
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rm_pms_housekeeping_productivity' AND policyname = 'rm_pms_housekeeping_productivity_insert'
  ) THEN
    CREATE POLICY rm_pms_housekeeping_productivity_insert ON rm_pms_housekeeping_productivity
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rm_pms_housekeeping_productivity' AND policyname = 'rm_pms_housekeeping_productivity_update'
  ) THEN
    CREATE POLICY rm_pms_housekeeping_productivity_update ON rm_pms_housekeeping_productivity
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rm_pms_housekeeping_productivity' AND policyname = 'rm_pms_housekeeping_productivity_delete'
  ) THEN
    CREATE POLICY rm_pms_housekeeping_productivity_delete ON rm_pms_housekeeping_productivity
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
