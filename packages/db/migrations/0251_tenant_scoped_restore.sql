-- Migration: Add tenant-scoped restore support
-- Adds scope_tenant_id to platform_restore_operations so restore
-- can target a single tenant's data from a full-database backup.

ALTER TABLE platform_restore_operations
  ADD COLUMN IF NOT EXISTS scope_tenant_id TEXT;

COMMENT ON COLUMN platform_restore_operations.scope_tenant_id IS
  'When set, restore only affects rows belonging to this tenant_id. NULL = full database restore.';
