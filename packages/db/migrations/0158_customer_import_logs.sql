-- Migration: 0158_customer_import_logs
-- Customer CSV import tracking table

CREATE TABLE IF NOT EXISTS customer_import_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  errors JSONB,
  column_mappings JSONB,
  duplicate_strategy TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  imported_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_import_logs_tenant
  ON customer_import_logs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_customer_import_logs_tenant_status
  ON customer_import_logs(tenant_id, status);

-- RLS
ALTER TABLE customer_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_import_logs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS customer_import_logs_select_policy ON customer_import_logs;
  CREATE POLICY customer_import_logs_select_policy ON customer_import_logs
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS customer_import_logs_insert_policy ON customer_import_logs;
  CREATE POLICY customer_import_logs_insert_policy ON customer_import_logs
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS customer_import_logs_update_policy ON customer_import_logs;
  CREATE POLICY customer_import_logs_update_policy ON customer_import_logs
    FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS customer_import_logs_delete_policy ON customer_import_logs;
  CREATE POLICY customer_import_logs_delete_policy ON customer_import_logs
    FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END $$;
