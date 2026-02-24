-- Migration 0187: ERP Dual-Mode Infrastructure
-- Adds business tier classification to tenants, workflow configuration tables,
-- and close orchestrator run tracking for the dual-mode ERP architecture.

-- ── ALTER TABLE tenants ──────────────────────────────────────────

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_tier TEXT NOT NULL DEFAULT 'SMB';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_vertical TEXT NOT NULL DEFAULT 'general';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier_override BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier_override_reason TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier_last_evaluated_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenants_business_tier'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT chk_tenants_business_tier
      CHECK (business_tier IN ('SMB', 'MID_MARKET', 'ENTERPRISE'));
  END IF;
END $$;

-- ── erp_workflow_configs ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp_workflow_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module_key TEXT NOT NULL,
  workflow_key TEXT NOT NULL,
  auto_mode BOOLEAN NOT NULL DEFAULT true,
  approval_required BOOLEAN NOT NULL DEFAULT false,
  user_visible BOOLEAN NOT NULL DEFAULT false,
  custom_settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_erp_workflow_configs UNIQUE (tenant_id, module_key, workflow_key)
);

CREATE INDEX IF NOT EXISTS idx_erp_workflow_configs_tenant
  ON erp_workflow_configs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_erp_workflow_configs_module
  ON erp_workflow_configs (tenant_id, module_key);

-- ── erp_workflow_config_change_log ──────────────────────────────

CREATE TABLE IF NOT EXISTS erp_workflow_config_change_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  workflow_key TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_type TEXT NOT NULL, -- 'tier_change' | 'manual_override' | 'auto_classification'
  old_config JSONB,
  new_config JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_workflow_change_log_tenant
  ON erp_workflow_config_change_log (tenant_id, created_at);

-- ── erp_close_orchestrator_runs ─────────────────────────────────

CREATE TABLE IF NOT EXISTS erp_close_orchestrator_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  location_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_steps INT NOT NULL DEFAULT 0,
  completed_steps INT NOT NULL DEFAULT 0,
  skipped_steps INT NOT NULL DEFAULT 0,
  failed_steps INT NOT NULL DEFAULT 0,
  step_results JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  triggered_by TEXT NOT NULL, -- 'auto' | 'manual' | userId
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_close_orchestrator_status'
  ) THEN
    ALTER TABLE erp_close_orchestrator_runs ADD CONSTRAINT chk_close_orchestrator_status
      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_close_orchestrator_runs_date
  ON erp_close_orchestrator_runs (tenant_id, business_date, COALESCE(location_id, ''));

CREATE INDEX IF NOT EXISTS idx_close_orchestrator_runs_tenant
  ON erp_close_orchestrator_runs (tenant_id, created_at);

-- ── ALTER TABLE accounting_settings ──────────────────────────────

ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS auto_close_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS auto_close_time TEXT DEFAULT '02:00';
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS auto_close_skip_holidays BOOLEAN NOT NULL DEFAULT false;

-- ── RLS ─────────────────────────────────────────────────────────

ALTER TABLE erp_workflow_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_workflow_configs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS erp_workflow_configs_select ON erp_workflow_configs;
  CREATE POLICY erp_workflow_configs_select ON erp_workflow_configs
    FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS erp_workflow_configs_insert ON erp_workflow_configs;
  CREATE POLICY erp_workflow_configs_insert ON erp_workflow_configs
    FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS erp_workflow_configs_update ON erp_workflow_configs;
  CREATE POLICY erp_workflow_configs_update ON erp_workflow_configs
    FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS erp_workflow_configs_delete ON erp_workflow_configs;
  CREATE POLICY erp_workflow_configs_delete ON erp_workflow_configs
    FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
END $$;

ALTER TABLE erp_workflow_config_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_workflow_config_change_log FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS erp_change_log_select ON erp_workflow_config_change_log;
  CREATE POLICY erp_change_log_select ON erp_workflow_config_change_log
    FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS erp_change_log_insert ON erp_workflow_config_change_log;
  CREATE POLICY erp_change_log_insert ON erp_workflow_config_change_log
    FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
END $$;

ALTER TABLE erp_close_orchestrator_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_close_orchestrator_runs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS close_orchestrator_runs_select ON erp_close_orchestrator_runs;
  CREATE POLICY close_orchestrator_runs_select ON erp_close_orchestrator_runs
    FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS close_orchestrator_runs_insert ON erp_close_orchestrator_runs;
  CREATE POLICY close_orchestrator_runs_insert ON erp_close_orchestrator_runs
    FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));

  DROP POLICY IF EXISTS close_orchestrator_runs_update ON erp_close_orchestrator_runs;
  CREATE POLICY close_orchestrator_runs_update ON erp_close_orchestrator_runs
    FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
END $$;
