-- Migration: 0071_platform_admins
-- Creates the platform_admins table for super admin panel users.
-- NOT tenant-scoped — no RLS.

CREATE TABLE IF NOT EXISTS platform_admins (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'admin'
                 CHECK (role IN ('super_admin', 'admin', 'viewer')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_admins_email ON platform_admins (email);
CREATE INDEX idx_platform_admins_role_active ON platform_admins (role, is_active);
