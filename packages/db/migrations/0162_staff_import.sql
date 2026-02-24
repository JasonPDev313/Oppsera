-- Migration 0159: Staff / Employee Import Staging Tables
-- Supports the intelligent multi-step staff import wizard

-- ── Staff Import Jobs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_import_jobs (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  file_name         TEXT NOT NULL,
  file_size_bytes   INTEGER,
  total_rows        INTEGER NOT NULL DEFAULT 0,
  import_mode       TEXT NOT NULL DEFAULT 'upsert',
  status            TEXT NOT NULL DEFAULT 'pending',

  column_mappings   JSONB,
  value_mappings    JSONB,

  default_role_id       TEXT,
  default_location_ids  JSONB,
  auto_generate_username BOOLEAN NOT NULL DEFAULT true,

  created_count   INTEGER NOT NULL DEFAULT 0,
  updated_count   INTEGER NOT NULL DEFAULT 0,
  skipped_count   INTEGER NOT NULL DEFAULT 0,
  error_count     INTEGER NOT NULL DEFAULT 0,

  imported_by     TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_import_jobs_tenant
  ON staff_import_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_import_jobs_status
  ON staff_import_jobs(tenant_id, status);

-- ── Staff Import Rows (staging) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_import_rows (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES staff_import_jobs(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  row_number      INTEGER NOT NULL,
  raw_data        JSONB NOT NULL,

  first_name      TEXT,
  last_name       TEXT,
  email           TEXT,
  username        TEXT,
  phone           TEXT,
  status_value    TEXT,

  role_id         TEXT,
  role_raw        TEXT,
  location_ids    JSONB,
  location_raw    TEXT,

  pos_pin         TEXT,
  override_pin    TEXT,
  tab_color       TEXT,
  employee_color  TEXT,
  external_payroll_employee_id TEXT,
  external_payroll_id TEXT,

  match_type      TEXT,
  matched_user_id TEXT,
  action          TEXT NOT NULL DEFAULT 'pending',

  is_valid        BOOLEAN NOT NULL DEFAULT false,
  errors          JSONB,
  warnings        JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_import_rows_job
  ON staff_import_rows(job_id);
CREATE INDEX IF NOT EXISTS idx_staff_import_rows_tenant
  ON staff_import_rows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_import_rows_action
  ON staff_import_rows(job_id, action);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE staff_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_import_rows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'staff_import_jobs_tenant_isolation') THEN
    CREATE POLICY staff_import_jobs_tenant_isolation ON staff_import_jobs
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'staff_import_rows_tenant_isolation') THEN
    CREATE POLICY staff_import_rows_tenant_isolation ON staff_import_rows
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

ALTER TABLE staff_import_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_import_rows FORCE ROW LEVEL SECURITY;
