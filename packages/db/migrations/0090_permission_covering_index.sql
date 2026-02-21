-- Covering index for permission hot-path query in engine.ts.
-- The permission lookup queries:
--   WHERE ra.tenant_id = $1 AND ra.user_id = $2 AND (ra.location_id = $3 OR ra.location_id IS NULL)
-- The existing idx_role_assignments_user (tenant_id, user_id) doesn't cover location_id or role_id,
-- forcing a heap lookup + filter for every matching row.
-- This covering index includes location_id (for the OR filter) and role_id (for the JOIN to role_permissions),
-- enabling index-only scans on the permission hot path.

CREATE INDEX IF NOT EXISTS idx_role_assignments_perm_lookup
  ON role_assignments (tenant_id, user_id, location_id, role_id);
