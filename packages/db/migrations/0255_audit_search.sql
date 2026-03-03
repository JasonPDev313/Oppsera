-- Migration 0255: Audit log query indexes + admin_recent_searches table
-- Phase 2B (Sessions 9-10)

-- ── Platform admin audit log indexes for admin portal queries ──────

CREATE INDEX IF NOT EXISTS idx_paal_actor_created
  ON platform_admin_audit_log(actor_admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paal_entity
  ON platform_admin_audit_log(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paal_tenant
  ON platform_admin_audit_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paal_action
  ON platform_admin_audit_log(action, created_at DESC);

-- ── Tenant audit log indexes ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON audit_log(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_type
  ON audit_log(actor_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_entity
  ON audit_log(action, entity_type, created_at DESC);

-- ── Admin recent searches table (for global search / command palette) ──

CREATE TABLE IF NOT EXISTS public.admin_recent_searches (
  id text NOT NULL DEFAULT gen_ulid(),
  admin_id text NOT NULL,
  search_query text,
  entity_type text,
  entity_id text,
  entity_label text NOT NULL,
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_recent_searches_pkey PRIMARY KEY (id),
  CONSTRAINT admin_recent_searches_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES public.platform_admins(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_recent_searches_admin
  ON admin_recent_searches(admin_id, searched_at DESC);
