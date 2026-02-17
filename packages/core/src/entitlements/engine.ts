import { eq } from 'drizzle-orm';
import { db, entitlements } from '@oppsera/db';
import type { EntitlementCheck } from './index';
import { getEntitlementCache } from './cache';
import type { EntitlementCacheEntry } from './cache';

const CACHE_TTL = 60;

function buildCacheKey(tenantId: string): string {
  return `entitlements:${tenantId}`;
}

export class DefaultEntitlementEngine implements EntitlementCheck {
  private async loadEntitlements(tenantId: string): Promise<Map<string, EntitlementCacheEntry>> {
    const cache = getEntitlementCache();
    const cacheKey = buildCacheKey(tenantId);

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const rows = await db.query.entitlements.findMany({
      where: eq(entitlements.tenantId, tenantId),
    });

    const map = new Map<string, EntitlementCacheEntry>();
    for (const row of rows) {
      map.set(row.moduleKey, {
        isEnabled: row.isEnabled,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        limits: (row.limits ?? {}) as Record<string, number>,
      });
    }

    await cache.set(cacheKey, map, CACHE_TTL);
    return map;
  }

  async isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    if (moduleKey === 'platform_core') return true;

    const map = await this.loadEntitlements(tenantId);
    const entry = map.get(moduleKey);
    if (!entry) return false;
    if (!entry.isEnabled) return false;
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) return false;
    return true;
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
      if (!entry.isEnabled) continue;
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
