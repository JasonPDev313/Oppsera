-- =============================================================================
-- Migration 0205: Auth Hot-Path Covering Indexes
-- Targets the 3 queries that run on EVERY authenticated request (cache miss):
--   1. users WHERE auth_provider_id = ? (already has UNIQUE — covered)
--   2. memberships WHERE user_id = ? AND status = 'active' ORDER BY created_at LIMIT 1
--   3. entitlements WHERE tenant_id = ? (existing idx only on tenant_id — needs module_key)
-- Plus the permission engine query that runs on every location-scoped request.
-- All use IF NOT EXISTS for idempotency.
-- =============================================================================

-- ── Memberships: covering index for auth validateToken() ─────────────────────
-- The auth cache miss path JOINs memberships + tenants filtered by user_id + status.
-- Existing idx_memberships_user (user_id) doesn't cover status or created_at.
-- This covering index enables index-only scan for the most common auth query.
CREATE INDEX IF NOT EXISTS idx_memberships_user_status_created
  ON memberships (user_id, status, created_at)
  INCLUDE (tenant_id);

-- ── Entitlements: covering index for requireEntitlement() ────────────────────
-- Every authenticated request checks entitlements. The existing idx_entitlements_tenant
-- only covers tenant_id. Adding module_key + access_mode enables index-only scans.
CREATE INDEX IF NOT EXISTS idx_entitlements_tenant_module
  ON entitlements (tenant_id, module_key)
  INCLUDE (access_mode, expires_at);

-- ── Role Permissions: covering index for permission engine JOIN ──────────────
-- The permission engine JOINs role_assignments → role_permissions.
-- The existing idx_role_permissions_role_id covers the JOIN key but not the
-- permission column, forcing a heap lookup per row.
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_permission
  ON role_permissions (role_id)
  INCLUDE (permission);

-- ── Locations: covering index for resolveLocation() ──────────────────────────
-- Every request with x-location-id header queries locations by (id, tenant_id).
-- Primary key covers id, but adding tenant_id + is_active avoids heap lookup.
CREATE INDEX IF NOT EXISTS idx_locations_tenant_active
  ON locations (tenant_id, id)
  INCLUDE (is_active);

-- ── ERP workflow configs: index for workflow engine cache miss ────────────────
CREATE INDEX IF NOT EXISTS idx_erp_workflow_configs_tenant
  ON erp_workflow_configs (tenant_id);
