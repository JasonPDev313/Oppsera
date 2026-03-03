-- Migration 0256: Housekeeping Enhancements
-- Adds: pms_cleaning_types table, extends pms_housekeeping_assignments with
--   due_by (deadline), cleaning_type_id, and requested_by columns.

-- ── 1. PMS Cleaning Types ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_cleaning_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  estimated_minutes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_cleaning_types_property
  ON pms_cleaning_types (tenant_id, property_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_cleaning_types_code
  ON pms_cleaning_types (tenant_id, property_id, code);

ALTER TABLE pms_cleaning_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_cleaning_types FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_cleaning_types' AND policyname = 'pms_cleaning_types_select'
  ) THEN
    CREATE POLICY pms_cleaning_types_select ON pms_cleaning_types
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_cleaning_types' AND policyname = 'pms_cleaning_types_insert'
  ) THEN
    CREATE POLICY pms_cleaning_types_insert ON pms_cleaning_types
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_cleaning_types' AND policyname = 'pms_cleaning_types_update'
  ) THEN
    CREATE POLICY pms_cleaning_types_update ON pms_cleaning_types
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_cleaning_types' AND policyname = 'pms_cleaning_types_delete'
  ) THEN
    CREATE POLICY pms_cleaning_types_delete ON pms_cleaning_types
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── 2. Extend pms_housekeeping_assignments ──────────────────────
ALTER TABLE pms_housekeeping_assignments
  ADD COLUMN IF NOT EXISTS due_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleaning_type_id TEXT,
  ADD COLUMN IF NOT EXISTS requested_by TEXT;

CREATE INDEX IF NOT EXISTS idx_pms_hk_assignments_due_by
  ON pms_housekeeping_assignments (tenant_id, property_id, business_date, due_by)
  WHERE due_by IS NOT NULL;
