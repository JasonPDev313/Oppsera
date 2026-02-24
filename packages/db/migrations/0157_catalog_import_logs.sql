-- Catalog import logs for tracking bulk inventory imports
CREATE TABLE IF NOT EXISTS catalog_import_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  categories_created INTEGER NOT NULL DEFAULT 0,
  errors JSONB,
  mappings JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  imported_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_catalog_import_logs_tenant
  ON catalog_import_logs(tenant_id);

-- RLS
ALTER TABLE catalog_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_import_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_import_logs_select ON catalog_import_logs;
CREATE POLICY catalog_import_logs_select ON catalog_import_logs
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS catalog_import_logs_insert ON catalog_import_logs;
CREATE POLICY catalog_import_logs_insert ON catalog_import_logs
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS catalog_import_logs_update ON catalog_import_logs;
CREATE POLICY catalog_import_logs_update ON catalog_import_logs
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );
