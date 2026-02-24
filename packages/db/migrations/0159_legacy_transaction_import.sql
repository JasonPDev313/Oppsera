-- Legacy Transaction Import System
-- Supports importing historical sales, orders, tenders, payments, taxes
-- from any legacy POS/accounting system.

-- ── import_jobs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_jobs (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  location_id             TEXT REFERENCES locations(id),
  name                    TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'analyzing',
  mode                    TEXT NOT NULL DEFAULT 'operational',
  file_name               TEXT NOT NULL,
  file_size_bytes         INTEGER NOT NULL,
  file_hash               TEXT NOT NULL,
  row_count               INTEGER,
  source_system           TEXT,

  -- Analysis results
  detected_columns        JSONB,
  detected_structure      TEXT,
  grouping_key            TEXT,

  -- Reconciliation totals
  legacy_revenue_cents    INTEGER,
  legacy_payment_cents    INTEGER,
  legacy_tax_cents        INTEGER,
  legacy_row_count        INTEGER,
  oppsera_revenue_cents   INTEGER,
  oppsera_payment_cents   INTEGER,
  oppsera_tax_cents       INTEGER,
  oppsera_order_count     INTEGER,

  -- Progress
  total_rows              INTEGER NOT NULL DEFAULT 0,
  processed_rows          INTEGER NOT NULL DEFAULT 0,
  imported_rows           INTEGER NOT NULL DEFAULT 0,
  skipped_rows            INTEGER NOT NULL DEFAULT 0,
  error_rows              INTEGER NOT NULL DEFAULT 0,
  quarantined_rows        INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  business_date_from      DATE,
  business_date_to        DATE,
  imported_by             TEXT NOT NULL,
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant
  ON import_jobs (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_jobs_tenant_hash
  ON import_jobs (tenant_id, file_hash)
  WHERE status NOT IN ('cancelled', 'failed');

-- ── import_column_mappings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_column_mappings (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  import_job_id     TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  source_column     TEXT NOT NULL,
  target_entity     TEXT NOT NULL,
  target_field      TEXT NOT NULL,
  confidence        NUMERIC(3,2) NOT NULL,
  confidence_reason TEXT,
  is_confirmed      BOOLEAN NOT NULL DEFAULT false,
  data_type         TEXT,
  transform_rule    TEXT,
  sample_values     JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_column_mappings_job
  ON import_column_mappings (import_job_id);

-- ── import_tender_mappings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_tender_mappings (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  import_job_id         TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  legacy_value          TEXT NOT NULL,
  oppsera_tender_type   TEXT NOT NULL,
  confidence            NUMERIC(3,2) NOT NULL,
  is_confirmed          BOOLEAN NOT NULL DEFAULT false,
  occurrence_count      INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_tender_mappings_job
  ON import_tender_mappings (import_job_id);

-- ── import_tax_mappings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_tax_mappings (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  import_job_id         TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  legacy_column         TEXT NOT NULL,
  legacy_rate           NUMERIC(8,4),
  oppsera_tax_group_id  TEXT,
  tax_mode              TEXT NOT NULL DEFAULT 'exclusive',
  confidence            NUMERIC(3,2) NOT NULL,
  is_confirmed          BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_tax_mappings_job
  ON import_tax_mappings (import_job_id);

-- ── import_item_mappings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_item_mappings (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  import_job_id           TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  legacy_item_name        TEXT NOT NULL,
  legacy_item_sku         TEXT,
  oppsera_catalog_item_id TEXT,
  strategy                TEXT NOT NULL DEFAULT 'auto',
  occurrence_count        INTEGER NOT NULL DEFAULT 0,
  total_revenue_cents     INTEGER NOT NULL DEFAULT 0,
  is_confirmed            BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_item_mappings_job
  ON import_item_mappings (import_job_id);

-- ── import_errors ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_errors (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  import_job_id     TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number        INTEGER NOT NULL,
  severity          TEXT NOT NULL,
  category          TEXT NOT NULL,
  message           TEXT NOT NULL,
  source_data       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_errors_job
  ON import_errors (import_job_id, severity);

-- ── import_staged_rows ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_staged_rows (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  import_job_id     TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number        INTEGER NOT NULL,
  group_key         TEXT NOT NULL,
  entity_type       TEXT NOT NULL,
  parsed_data       JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_staged_rows_job_group
  ON import_staged_rows (import_job_id, group_key);
CREATE INDEX IF NOT EXISTS idx_import_staged_rows_job_status
  ON import_staged_rows (import_job_id, status);

-- ── RLS Policies ───────────────────────────────────────────────────

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_jobs_tenant_select ON import_jobs;
CREATE POLICY import_jobs_tenant_select ON import_jobs FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_jobs_tenant_insert ON import_jobs;
CREATE POLICY import_jobs_tenant_insert ON import_jobs FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_jobs_tenant_update ON import_jobs;
CREATE POLICY import_jobs_tenant_update ON import_jobs FOR UPDATE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_jobs_tenant_delete ON import_jobs;
CREATE POLICY import_jobs_tenant_delete ON import_jobs FOR DELETE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- import_column_mappings
ALTER TABLE import_column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_column_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_column_mappings_tenant_select ON import_column_mappings;
CREATE POLICY import_column_mappings_tenant_select ON import_column_mappings FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_column_mappings_tenant_insert ON import_column_mappings;
CREATE POLICY import_column_mappings_tenant_insert ON import_column_mappings FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_column_mappings_tenant_update ON import_column_mappings;
CREATE POLICY import_column_mappings_tenant_update ON import_column_mappings FOR UPDATE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_column_mappings_tenant_delete ON import_column_mappings;
CREATE POLICY import_column_mappings_tenant_delete ON import_column_mappings FOR DELETE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- import_tender_mappings
ALTER TABLE import_tender_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_tender_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_tender_mappings_tenant_select ON import_tender_mappings;
CREATE POLICY import_tender_mappings_tenant_select ON import_tender_mappings FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_tender_mappings_tenant_insert ON import_tender_mappings;
CREATE POLICY import_tender_mappings_tenant_insert ON import_tender_mappings FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_tender_mappings_tenant_update ON import_tender_mappings;
CREATE POLICY import_tender_mappings_tenant_update ON import_tender_mappings FOR UPDATE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_tender_mappings_tenant_delete ON import_tender_mappings;
CREATE POLICY import_tender_mappings_tenant_delete ON import_tender_mappings FOR DELETE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- import_tax_mappings
ALTER TABLE import_tax_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_tax_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_tax_mappings_tenant_select ON import_tax_mappings;
CREATE POLICY import_tax_mappings_tenant_select ON import_tax_mappings FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_tax_mappings_tenant_insert ON import_tax_mappings;
CREATE POLICY import_tax_mappings_tenant_insert ON import_tax_mappings FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_tax_mappings_tenant_update ON import_tax_mappings;
CREATE POLICY import_tax_mappings_tenant_update ON import_tax_mappings FOR UPDATE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_tax_mappings_tenant_delete ON import_tax_mappings;
CREATE POLICY import_tax_mappings_tenant_delete ON import_tax_mappings FOR DELETE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- import_item_mappings
ALTER TABLE import_item_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_item_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_item_mappings_tenant_select ON import_item_mappings;
CREATE POLICY import_item_mappings_tenant_select ON import_item_mappings FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_item_mappings_tenant_insert ON import_item_mappings;
CREATE POLICY import_item_mappings_tenant_insert ON import_item_mappings FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_item_mappings_tenant_update ON import_item_mappings;
CREATE POLICY import_item_mappings_tenant_update ON import_item_mappings FOR UPDATE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_item_mappings_tenant_delete ON import_item_mappings;
CREATE POLICY import_item_mappings_tenant_delete ON import_item_mappings FOR DELETE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- import_errors
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_errors_tenant_select ON import_errors;
CREATE POLICY import_errors_tenant_select ON import_errors FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_errors_tenant_insert ON import_errors;
CREATE POLICY import_errors_tenant_insert ON import_errors FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- import_errors is append-only, no UPDATE/DELETE policies

-- import_staged_rows
ALTER TABLE import_staged_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_staged_rows FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_staged_rows_tenant_select ON import_staged_rows;
CREATE POLICY import_staged_rows_tenant_select ON import_staged_rows FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_staged_rows_tenant_insert ON import_staged_rows;
CREATE POLICY import_staged_rows_tenant_insert ON import_staged_rows FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_staged_rows_tenant_update ON import_staged_rows;
CREATE POLICY import_staged_rows_tenant_update ON import_staged_rows FOR UPDATE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS import_staged_rows_tenant_delete ON import_staged_rows;
CREATE POLICY import_staged_rows_tenant_delete ON import_staged_rows FOR DELETE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
