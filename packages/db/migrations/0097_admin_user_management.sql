-- Migration: 0097_admin_user_management
-- Extends platform_admins and adds granular RBAC for the admin portal.
-- NO RLS — platform tables are not tenant-scoped.

-- ── Extend platform_admins ──────────────────────────────────────────
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS invited_by_admin_id text;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS invite_token_hash text;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT false;

-- Backfill status from is_active for existing rows
UPDATE platform_admins SET status = 'suspended' WHERE is_active = false AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_platform_admins_status ON platform_admins (status);

-- ── Platform Admin Roles ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admin_roles (
  id          text PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Platform Admin Role Permissions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admin_role_permissions (
  id        text PRIMARY KEY,
  role_id   text NOT NULL REFERENCES platform_admin_roles(id) ON DELETE CASCADE,
  module    text NOT NULL,
  submodule text,
  action    text NOT NULL,
  scope     text NOT NULL DEFAULT 'global'
            CHECK (scope IN ('global', 'tenant', 'self'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_role_perm
  ON platform_admin_role_permissions (role_id, module, COALESCE(submodule, ''), action);
CREATE INDEX IF NOT EXISTS idx_platform_role_perm_role
  ON platform_admin_role_permissions (role_id);

-- ── Platform Admin Role Assignments ─────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admin_role_assignments (
  id                   text PRIMARY KEY,
  admin_id             text NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  role_id              text NOT NULL REFERENCES platform_admin_roles(id) ON DELETE CASCADE,
  assigned_by_admin_id text REFERENCES platform_admins(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_admin_role_assignment
  ON platform_admin_role_assignments (admin_id, role_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_role_admin
  ON platform_admin_role_assignments (admin_id);

-- ── Platform Admin Audit Log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admin_audit_log (
  id              text PRIMARY KEY,
  actor_admin_id  text NOT NULL REFERENCES platform_admins(id),
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       text NOT NULL,
  tenant_id       text,
  before_snapshot jsonb,
  after_snapshot  jsonb,
  reason          text,
  ip_address      text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor
  ON platform_admin_audit_log (actor_admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_entity
  ON platform_admin_audit_log (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_action
  ON platform_admin_audit_log (action, created_at);
