import { db } from '@oppsera/db';
import { platformAdminRoleAssignments, platformAdminRolePermissions } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── In-memory permission cache (15s TTL, same as core engine) ────

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

/**
 * Loads all granted permission strings for an admin user.
 * Composes permissions from (module, submodule, action) tuples.
 * Cached for 15 seconds per adminId.
 */
export async function getAdminPermissions(adminId: string): Promise<Set<string>> {
  const cacheKey = `admin-perms:${adminId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.permissions;

  const rows = await db
    .select({
      module: platformAdminRolePermissions.module,
      submodule: platformAdminRolePermissions.submodule,
      action: platformAdminRolePermissions.action,
    })
    .from(platformAdminRoleAssignments)
    .innerJoin(
      platformAdminRolePermissions,
      eq(platformAdminRolePermissions.roleId, platformAdminRoleAssignments.roleId),
    )
    .where(eq(platformAdminRoleAssignments.adminId, adminId));

  const permissions = new Set<string>();
  for (const row of rows) {
    const perm = row.submodule
      ? `${row.module}.${row.submodule}.${row.action}`
      : `${row.module}.${row.action}`;
    permissions.add(perm);
  }

  cache.set(cacheKey, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
  return permissions;
}

/**
 * Checks if a set of granted permissions satisfies the requested permission.
 * Supports wildcards: '*' matches all, 'module.*' matches 'module.xxx.yyy'.
 */
export function matchAdminPermission(granted: Set<string>, requested: string): boolean {
  if (granted.has('*')) return true;
  if (granted.has(requested)) return true;

  // Wildcard matching: 'users.*' matches 'users.staff.view'
  const parts = requested.split('.');
  if (parts.length >= 2) {
    if (granted.has(`${parts[0]}.*`)) return true;
  }
  if (parts.length >= 3) {
    if (granted.has(`${parts[0]}.${parts[1]}.*`)) return true;
  }
  return false;
}

/**
 * Invalidate cached permissions for an admin (after role changes).
 */
export function invalidateAdminPermissionCache(adminId: string): void {
  cache.delete(`admin-perms:${adminId}`);
}

/**
 * Clear the entire permission cache (for testing).
 */
export function clearAdminPermissionCache(): void {
  cache.clear();
}
