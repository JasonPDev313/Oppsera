import { db, sql, singleFlight, jitterTtl, isBreakerOpen, guardedQuery } from '@oppsera/db';
import type { PermissionEngine } from './index';
import { getPermissionCache } from './cache';

const CACHE_TTL = 15; // seconds — reduced from 60s for faster permission revocation (SEC-007)

// Query timeout prevents a stuck permissions query from holding a pool connection
// indefinitely. With max:2 pool, one stuck query = 50% pool gone = cascading failure.
const QUERY_TIMEOUT_MS = 5_000;

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

/** Wraps a promise with a timeout. Rejects with a TimeoutError if the promise
 *  doesn't resolve within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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

    // Circuit breaker open — fall back to stale cache immediately instead of queuing
    if (isBreakerOpen()) {
      const stale = await cache.getStale(cacheKey);
      if (stale) {
        console.warn(`[permissions] Circuit breaker open, using stale cache for ${cacheKey}`);
        return stale;
      }
    }

    // Single-flight: deduplicate concurrent permission fetches for the same user+location
    return singleFlight(cacheKey, async () => {
      // Re-check cache — another flight may have populated it while we waited
      const rechecked = await cache.get(cacheKey);
      if (rechecked) return rechecked;

      try {
        const permissions = await withTimeout(
          guardedQuery('permissions:load', () => this._fetchPermissions(tenantId, userId, locationId)),
          QUERY_TIMEOUT_MS,
          'permissions query',
        );
        await cache.set(cacheKey, permissions, jitterTtl(CACHE_TTL));
        return permissions;
      } catch (err) {
        // On timeout or DB error, try stale cache as fallback
        const stale = await cache.getStale(cacheKey);
        if (stale) {
          console.warn(`[permissions] DB query failed, using stale cache for ${cacheKey}: ${(err as Error).message}`);
          return stale;
        }
        // No stale data available — re-throw
        throw err;
      }
    });
  }

  private async _fetchPermissions(
    tenantId: string,
    userId: string,
    locationId?: string,
  ): Promise<Set<string>> {
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

    if (isBreakerOpen()) {
      const stale = await cache.getStale(cacheKey);
      if (stale) {
        console.warn(`[permissions] Circuit breaker open, using stale cache for ${cacheKey}`);
        return stale;
      }
    }

    return singleFlight(cacheKey, async () => {
      const rechecked = await cache.get(cacheKey);
      if (rechecked) return rechecked;

      try {
        const permissions = await withTimeout(
          guardedQuery('permissions:loadRole', () => this._fetchPermissionsForRole(tenantId, userId, roleId)),
          QUERY_TIMEOUT_MS,
          'role permissions query',
        );
        await cache.set(cacheKey, permissions, jitterTtl(CACHE_TTL));
        return permissions;
      } catch (err) {
        const stale = await cache.getStale(cacheKey);
        if (stale) {
          console.warn(`[permissions] DB query failed, using stale cache for ${cacheKey}: ${(err as Error).message}`);
          return stale;
        }
        throw err;
      }
    });
  }

  private async _fetchPermissionsForRole(
    tenantId: string,
    userId: string,
    roleId: string,
  ): Promise<Set<string>> {
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
