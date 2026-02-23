-- Migration: Admin impersonation sessions
-- Tracks when platform admins impersonate tenant accounts for support purposes.
-- No RLS — this is a platform-level table (same as platform_admins).

CREATE TABLE admin_impersonation_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES platform_admins(id),
  admin_email TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tenant_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  end_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  action_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup by admin (recent sessions)
CREATE INDEX idx_imp_sessions_admin ON admin_impersonation_sessions(admin_id, created_at DESC);

-- Lookup by tenant (impersonation history for a tenant)
CREATE INDEX idx_imp_sessions_tenant ON admin_impersonation_sessions(tenant_id, created_at DESC);

-- Active session lookup (used on every impersonated request)
CREATE INDEX idx_imp_sessions_status ON admin_impersonation_sessions(status)
  WHERE status IN ('pending', 'active');
