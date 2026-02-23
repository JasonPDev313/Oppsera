-- Migration 0138: COA governance columns + change log + import log tables
-- Phase 2 of COA system completion

-- ── 1. Add governance columns to gl_accounts ──────────────────────────

ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS depth integer NOT NULL DEFAULT 0;
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS path text;
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS is_system_account boolean NOT NULL DEFAULT false;
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS merged_into_id text REFERENCES gl_accounts(id);
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE gl_accounts DROP CONSTRAINT IF EXISTS gl_accounts_status_check;
ALTER TABLE gl_accounts ADD CONSTRAINT gl_accounts_status_check
  CHECK (status IN ('active', 'inactive', 'pending_merge'));

-- Indexes for governance columns
CREATE INDEX IF NOT EXISTS idx_gl_accounts_tenant_fallback
  ON gl_accounts (tenant_id, is_fallback) WHERE is_fallback = true;

CREATE INDEX IF NOT EXISTS idx_gl_accounts_tenant_parent
  ON gl_accounts (tenant_id, parent_account_id) WHERE parent_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_accounts_tenant_status
  ON gl_accounts (tenant_id, status);

-- ── 2. Create gl_account_change_logs (append-only) ────────────────────

CREATE TABLE IF NOT EXISTS gl_account_change_logs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  account_id text NOT NULL REFERENCES gl_accounts(id),
  action text NOT NULL, -- CREATE, UPDATE, DEACTIVATE, REACTIVATE, MERGE, RENUMBER
  field_changed text,   -- column name (null for CREATE)
  old_value text,
  new_value text,
  changed_by text,      -- user ID
  changed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS idx_gl_acct_changelog_tenant_account
  ON gl_account_change_logs (tenant_id, account_id);

CREATE INDEX IF NOT EXISTS idx_gl_acct_changelog_tenant_date
  ON gl_account_change_logs (tenant_id, changed_at);

-- RLS: SELECT + INSERT only (append-only enforcement)
ALTER TABLE gl_account_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_account_change_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_account_change_logs_select ON gl_account_change_logs
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_account_change_logs_insert ON gl_account_change_logs
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- ── 3. Create gl_coa_import_logs ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS gl_coa_import_logs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  file_name text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  success_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  errors jsonb,
  status text NOT NULL DEFAULT 'pending',
  imported_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE gl_coa_import_logs DROP CONSTRAINT IF EXISTS gl_coa_import_logs_status_check;
ALTER TABLE gl_coa_import_logs ADD CONSTRAINT gl_coa_import_logs_status_check
  CHECK (status IN ('pending', 'validating', 'validated', 'importing', 'complete', 'failed'));

CREATE INDEX IF NOT EXISTS idx_gl_coa_import_logs_tenant
  ON gl_coa_import_logs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_gl_coa_import_logs_tenant_status
  ON gl_coa_import_logs (tenant_id, status);

-- RLS
ALTER TABLE gl_coa_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_coa_import_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_coa_import_logs_select ON gl_coa_import_logs
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_coa_import_logs_insert ON gl_coa_import_logs
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_coa_import_logs_update ON gl_coa_import_logs
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
