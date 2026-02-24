-- Intelligent COA Import System
-- Adds coa_import_sessions for multi-step wizard state persistence.

-- ── Import Sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coa_import_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),

  -- File info
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL DEFAULT 'csv',
  file_size_bytes INTEGER,

  -- Status lifecycle: uploaded → analyzed → mapping_review → previewed → importing → complete | failed
  status TEXT NOT NULL DEFAULT 'uploaded',

  -- Analysis results (JSONB) — column mappings, hierarchy detection, overall confidence
  analysis_result JSONB,

  -- User-adjusted column mappings (JSONB) — overrides from the mapping review step
  custom_mappings JSONB,

  -- User-selected hierarchy strategy
  hierarchy_strategy TEXT,

  -- Account previews with inferred types (JSONB)
  preview_accounts JSONB,

  -- Validation summary (JSONB)
  validation_result JSONB,

  -- Import execution results
  import_log_id TEXT REFERENCES gl_coa_import_logs(id),
  accounts_created INTEGER DEFAULT 0,
  accounts_skipped INTEGER DEFAULT 0,
  headers_created INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,

  -- Options
  state_name TEXT,
  merge_mode TEXT DEFAULT 'fresh',

  -- Row-level overrides from user (JSONB) — { rowNumber: { accountType, parentAccountNumber, ... } }
  row_overrides JSONB,

  -- Rows to skip (JSONB array of row numbers)
  skip_rows JSONB,

  -- Metadata
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Auto-cleanup stale sessions after 7 days
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_coa_import_sessions_tenant
  ON coa_import_sessions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_coa_import_sessions_status
  ON coa_import_sessions(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_coa_import_sessions_expires
  ON coa_import_sessions(expires_at)
  WHERE status NOT IN ('complete', 'failed');

-- Also add raw_content column to gl_coa_import_logs for re-analysis capability
ALTER TABLE gl_coa_import_logs
  ADD COLUMN IF NOT EXISTS raw_content TEXT,
  ADD COLUMN IF NOT EXISTS file_format TEXT DEFAULT 'csv',
  ADD COLUMN IF NOT EXISTS analysis_confidence INTEGER;

-- ── RLS ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'coa_import_sessions' AND policyname = 'tenant_isolation_select'
  ) THEN
    ALTER TABLE coa_import_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE coa_import_sessions FORCE ROW LEVEL SECURITY;

    CREATE POLICY tenant_isolation_select ON coa_import_sessions
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

    CREATE POLICY tenant_isolation_insert ON coa_import_sessions
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

    CREATE POLICY tenant_isolation_update ON coa_import_sessions
      FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

    CREATE POLICY tenant_isolation_delete ON coa_import_sessions
      FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
