-- Platform Backup & Restore tables (no RLS — platform-level)

CREATE TABLE IF NOT EXISTS platform_backups (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  label TEXT,
  table_count INTEGER,
  row_count INTEGER,
  size_bytes INTEGER,
  checksum TEXT,
  storage_driver TEXT NOT NULL DEFAULT 'local',
  storage_path TEXT,
  retention_tag TEXT,
  expires_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB,
  initiated_by_admin_id TEXT REFERENCES platform_admins(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_backups_status
  ON platform_backups (status, created_at);

CREATE INDEX IF NOT EXISTS idx_platform_backups_retention
  ON platform_backups (retention_tag, expires_at);

CREATE TABLE IF NOT EXISTS platform_restore_operations (
  id TEXT PRIMARY KEY,
  backup_id TEXT NOT NULL REFERENCES platform_backups(id),
  status TEXT NOT NULL DEFAULT 'pending_approval',
  safety_backup_id TEXT REFERENCES platform_backups(id),
  requested_by_admin_id TEXT NOT NULL REFERENCES platform_admins(id),
  approved_by_admin_id TEXT REFERENCES platform_admins(id),
  rejected_by_admin_id TEXT REFERENCES platform_admins(id),
  rejection_reason TEXT,
  confirmation_phrase TEXT,
  tables_restored INTEGER,
  rows_restored INTEGER,
  error_message TEXT,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_different_approver CHECK (
    approved_by_admin_id IS NULL OR approved_by_admin_id != requested_by_admin_id
  )
);

CREATE INDEX IF NOT EXISTS idx_platform_restores_status
  ON platform_restore_operations (status, created_at);

CREATE INDEX IF NOT EXISTS idx_platform_restores_backup
  ON platform_restore_operations (backup_id);

CREATE TABLE IF NOT EXISTS platform_backup_settings (
  id TEXT PRIMARY KEY,
  scheduling_enabled BOOLEAN NOT NULL DEFAULT false,
  interval_minutes INTEGER NOT NULL DEFAULT 15,
  retention_daily_days INTEGER NOT NULL DEFAULT 7,
  retention_weekly_weeks INTEGER NOT NULL DEFAULT 4,
  retention_monthly_months INTEGER NOT NULL DEFAULT 12,
  storage_driver TEXT NOT NULL DEFAULT 'local',
  dual_approval_required BOOLEAN NOT NULL DEFAULT true,
  last_scheduled_backup_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default settings row
INSERT INTO platform_backup_settings (id, scheduling_enabled)
VALUES ('default', false)
ON CONFLICT (id) DO NOTHING;
