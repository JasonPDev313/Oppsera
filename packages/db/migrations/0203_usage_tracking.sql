-- Usage Tracking & Analytics read models (platform-level, NO RLS)

-- rm_usage_hourly: per-tenant, per-module hourly aggregates
CREATE TABLE IF NOT EXISTS rm_usage_hourly (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  hour_bucket TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  write_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  max_duration_ms INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_usage_hourly_tenant_module_hour
  ON rm_usage_hourly (tenant_id, module_key, hour_bucket);
CREATE INDEX IF NOT EXISTS idx_rm_usage_hourly_hour
  ON rm_usage_hourly (hour_bucket);
CREATE INDEX IF NOT EXISTS idx_rm_usage_hourly_tenant
  ON rm_usage_hourly (tenant_id, hour_bucket);
CREATE INDEX IF NOT EXISTS idx_rm_usage_hourly_module
  ON rm_usage_hourly (module_key, hour_bucket);

-- rm_usage_daily: per-tenant, per-module daily aggregates
CREATE TABLE IF NOT EXISTS rm_usage_daily (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  write_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  max_duration_ms INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_usage_daily_tenant_module_date
  ON rm_usage_daily (tenant_id, module_key, usage_date);
CREATE INDEX IF NOT EXISTS idx_rm_usage_daily_date
  ON rm_usage_daily (usage_date);
CREATE INDEX IF NOT EXISTS idx_rm_usage_daily_tenant
  ON rm_usage_daily (tenant_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_rm_usage_daily_module
  ON rm_usage_daily (module_key, usage_date);

-- rm_usage_workflow_daily: per-tenant, per-workflow daily drill-down
CREATE TABLE IF NOT EXISTS rm_usage_workflow_daily (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  workflow_key TEXT NOT NULL,
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_usage_workflow_daily
  ON rm_usage_workflow_daily (tenant_id, module_key, workflow_key, usage_date);
CREATE INDEX IF NOT EXISTS idx_rm_usage_workflow_module_date
  ON rm_usage_workflow_daily (module_key, usage_date);

-- rm_usage_module_adoption: per-tenant, per-module lifecycle
CREATE TABLE IF NOT EXISTS rm_usage_module_adoption (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  first_used_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_unique_users INTEGER NOT NULL DEFAULT 0,
  active_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_usage_adoption_tenant_module
  ON rm_usage_module_adoption (tenant_id, module_key);
CREATE INDEX IF NOT EXISTS idx_rm_usage_adoption_module
  ON rm_usage_module_adoption (module_key);
CREATE INDEX IF NOT EXISTS idx_rm_usage_adoption_active
  ON rm_usage_module_adoption (is_active);

-- usage_action_items: auto-generated insights with admin review workflow
CREATE TABLE IF NOT EXISTS usage_action_items (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tenant_id TEXT,
  module_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_status
  ON usage_action_items (status, severity);
CREATE INDEX IF NOT EXISTS idx_action_items_category
  ON usage_action_items (category, status);
CREATE INDEX IF NOT EXISTS idx_action_items_tenant
  ON usage_action_items (tenant_id);
