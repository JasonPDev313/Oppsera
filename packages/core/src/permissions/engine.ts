import { db, sql } from '@oppsera/db';
import type { PermissionEngine } from './index';
import { getPermissionCache } from './cache';

const CACHE_TTL = 15; // seconds — reduced from 60s for faster permission revocation (SEC-007)

export function matchPermission(granted: string, requested: string): boolean {
  if (granted === '*') return true;
  if (granted === requested) return true;
  if (granted.endsWith('.*')) {
    const grantedModule = granted.slice(0, -2);
    const requestedModule = requested.split('.')[0];
    return grantedModule === requestedModule;
  }
  return false;
}

function buildCacheKey(tenantId: string, userId: string, locationId?: string): string {
  return `perms:${tenantId}:${userId}:${locationId || 'global'}`;
}

export class DefaultPermissionEngine implements PermissionEngine {
  async getUserPermissions(
    tenantId: string,
    userId: string,
    locationId?: string,
  ): Promise<Set<string>> {
    const cache = getPermissionCache();
    const cacheKey = buildCacheKey(tenantId, userId, locationId);

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let result: { permission: string }[];

    if (locationId) {
      result = await db.execute<{ permission: string }>(sql`
        SELECT DISTINCT rp.permission
        FROM role_assignments ra
        JOIN role_permissions rp ON rp.role_id = ra.role_id
        WHERE ra.tenant_id = ${tenantId}
          AND ra.user_id = ${userId}
          AND (ra.location_id = ${locationId} OR ra.location_id IS NULL)
      `) as unknown as { permission: string }[];
    } else {
      result = await db.execute<{ permission: string }>(sql`
        SELECT DISTINCT rp.permission
        FROM role_assignments ra
        JOIN role_permissions rp ON rp.role_id = ra.role_id
        WHERE ra.tenant_id = ${tenantId}
          AND ra.user_id = ${userId}
          AND ra.location_id IS NULL
      `) as unknown as { permission: string }[];
    }

    const permissions = new Set<string>();
    for (const row of result) {
      permissions.add(row.permission);
    }

    await cache.set(cacheKey, permissions, CACHE_TTL);
    return permissions;
  }

  async getUserPermissionsForRole(
    tenantId: string,
    userId: string,
    roleId: string,
    locationId?: string,
  ): Promise<Set<string>> {
    const cache = getPermissionCache();
    const cacheKey = `perms:${tenantId}:${userId}:role:${roleId}:${locationId || 'global'}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // Validate user actually has this role assignment (prevents spoofing)
    const assignmentCheck = await db.execute<{ cnt: number }>(sql`
      SELECT count(*)::int AS cnt
      FROM role_assignments
      WHERE tenant_id = ${tenantId}
        AND user_id = ${userId}
        AND role_id = ${roleId}
    `) as unknown as { cnt: number }[];

    const hasAssignment = Array.from(assignmentCheck as Iterable<{ cnt: number }>)[0]?.cnt ?? 0;
    if (hasAssignment === 0) {
      return new Set<string>();
    }

    // Return only permissions from the specific role
    const result = await db.execute<{ permission: string }>(sql`
      SELECT DISTINCT rp.permission
      FROM role_permissions rp
      WHERE rp.role_id = ${roleId}
    `) as unknown as { permission: string }[];

    const permissions = new Set<string>();
    for (const row of Array.from(result as Iterable<{ permission: string }>)) {
      permissions.add(row.permission);
    }

    await cache.set(cacheKey, permissions, CACHE_TTL);
    return permissions;
  }

  async hasPermission(
    tenantId: string,
    userId: string,
    permission: string,
    locationId?: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(tenantId, userId, locationId);
    for (const granted of permissions) {
      if (matchPermission(granted, permission)) return true;
    }
    return false;
  }

  async invalidateCache(tenantId: string, userId: string): Promise<void> {
    const cache = getPermissionCache();
    await cache.delete(`perms:${tenantId}:${userId}:*`);
  }
}

let engineInstance: PermissionEngine | null = null;

export function getPermissionEngine(): PermissionEngine {
  if (!engineInstance) {
    engineInstance = new DefaultPermissionEngine();
  }
  return engineInstance;
}

export function setPermissionEngine(engine: PermissionEngine): void {
  engineInstance = engine;
}
