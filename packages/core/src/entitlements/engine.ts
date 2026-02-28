import { eq } from 'drizzle-orm';
import { db, entitlements, singleFlight, jitterTtl, isBreakerOpen, guardedQuery } from '@oppsera/db';
import type { EntitlementCheck } from './index';
import { getEntitlementCache } from './cache';
import type { EntitlementCacheEntry } from './cache';
import type { AccessMode } from './registry';

const CACHE_TTL = 60;

// Query timeout prevents a stuck entitlements query from holding a pool connection
// indefinitely. With max:2 pool, one stuck query = 50% pool gone = cascading failure.
const QUERY_TIMEOUT_MS = 5_000;

/** Wraps a promise with a timeout. Rejects if the promise doesn't resolve within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function buildCacheKey(tenantId: string): string {
  return `entitlements:${tenantId}`;
}

export class DefaultEntitlementEngine implements EntitlementCheck {
  private async loadEntitlements(tenantId: string): Promise<Map<string, EntitlementCacheEntry>> {
    const cache = getEntitlementCache();
    const cacheKey = buildCacheKey(tenantId);

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // Circuit breaker open — fall back to stale cache immediately instead of queuing
    if (isBreakerOpen()) {
      const stale = await cache.getStale(cacheKey);
      if (stale) {
        console.warn(`[entitlements] Circuit breaker open, using stale cache for ${cacheKey}`);
        return stale;
      }
    }

    // Single-flight: when N concurrent requests need the same tenant's entitlements,
    // only the first executes the DB query — the others await the same Promise.
    return singleFlight(`entitlements:${tenantId}`, async () => {
      // Re-check cache — another flight may have populated it while we waited
      const rechecked = await cache.get(cacheKey);
      if (rechecked) return rechecked;

      try {
        const map = await withTimeout(
          guardedQuery('entitlements:load', () => this._fetchEntitlements(tenantId)),
          QUERY_TIMEOUT_MS,
          'entitlements query',
        );
        await cache.set(cacheKey, map, jitterTtl(CACHE_TTL));
        return map;
      } catch (err) {
        // On timeout or DB error, try stale cache as fallback
        const stale = await cache.getStale(cacheKey);
        if (stale) {
          console.warn(`[entitlements] DB query failed, using stale cache for ${cacheKey}: ${(err as Error).message}`);
          return stale;
        }
        // No stale data available — re-throw
        throw err;
      }
    });
  }

  private async _fetchEntitlements(tenantId: string): Promise<Map<string, EntitlementCacheEntry>> {
    const rows = await db.query.entitlements.findMany({
      where: eq(entitlements.tenantId, tenantId),
    });

    const map = new Map<string, EntitlementCacheEntry>();
    for (const row of rows) {
      map.set(row.moduleKey, {
        isEnabled: row.isEnabled,
        accessMode: (row.accessMode ?? (row.isEnabled ? 'full' : 'off')) as AccessMode,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        limits: (row.limits ?? {}) as Record<string, number>,
      });
    }
    return map;
  }

  async getAccessMode(tenantId: string, moduleKey: string): Promise<AccessMode> {
    if (moduleKey === 'platform_core') return 'full';

    const map = await this.loadEntitlements(tenantId);
    const entry = map.get(moduleKey);
    if (!entry) return 'off';
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) return 'off';
    return entry.accessMode;
  }

  async isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const mode = await this.getAccessMode(tenantId, moduleKey);
    return mode !== 'off' && mode !== 'locked';
  }

  async getModuleLimits(tenantId: string, moduleKey: string): Promise<Record<string, number> | null> {
    const map = await this.loadEntitlements(tenantId);
    const entry = map.get(moduleKey);
    if (!entry) return null;
    return entry.limits;
  }

  async getEnabledModules(tenantId: string): Promise<string[]> {
    const map = await this.loadEntitlements(tenantId);
    const enabled: string[] = ['platform_core'];
    for (const [key, entry] of map) {
      if (key === 'platform_core') continue;
      if (entry.accessMode === 'off' || entry.accessMode === 'locked') continue;
      if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) continue;
      enabled.push(key);
    }
    return enabled;
  }

  async invalidateEntitlements(tenantId: string): Promise<void> {
    const cache = getEntitlementCache();
    await cache.delete(buildCacheKey(tenantId));
  }
}

let engineInstance: DefaultEntitlementEngine | null = null;

export function getEntitlementEngine(): DefaultEntitlementEngine {
  if (!engineInstance) {
    engineInstance = new DefaultEntitlementEngine();
  }
  return engineInstance;
}

export function setEntitlementEngine(engine: DefaultEntitlementEngine): void {
  engineInstance = engine;
}
