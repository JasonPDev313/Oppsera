-- Migration 0154: PMS Rate Packages
-- Adds rate_packages table and rate_package_id to reservations

-- ── pms_rate_packages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_rate_packages (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  property_id     TEXT NOT NULL REFERENCES pms_properties(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  rate_plan_id    TEXT REFERENCES pms_rate_plans(id),
  includes_json   JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique code per property
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_rate_packages_code
  ON pms_rate_packages (tenant_id, property_id, code);

-- Lookup by property
CREATE INDEX IF NOT EXISTS idx_pms_rate_packages_property
  ON pms_rate_packages (tenant_id, property_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE pms_rate_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_rate_packages FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_rate_packages' AND policyname = 'pms_rate_packages_select'
  ) THEN
    CREATE POLICY pms_rate_packages_select ON pms_rate_packages
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_rate_packages' AND policyname = 'pms_rate_packages_insert'
  ) THEN
    CREATE POLICY pms_rate_packages_insert ON pms_rate_packages
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_rate_packages' AND policyname = 'pms_rate_packages_update'
  ) THEN
    CREATE POLICY pms_rate_packages_update ON pms_rate_packages
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_rate_packages' AND policyname = 'pms_rate_packages_delete'
  ) THEN
    CREATE POLICY pms_rate_packages_delete ON pms_rate_packages
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── Add rate_package_id to reservations ──────────────────────────
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS rate_package_id TEXT;
