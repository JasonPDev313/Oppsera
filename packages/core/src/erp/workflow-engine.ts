import { withTenant, db, singleFlight, jitterTtlMs, isBreakerOpen, guardedQuery } from '@oppsera/db';
import { erpWorkflowConfigs, erpWorkflowConfigChangeLog, tenants } from '@oppsera/db';
import { TIER_WORKFLOW_DEFAULTS } from '@oppsera/shared';
import type { BusinessTier } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';
import { eq, sql } from 'drizzle-orm';

export interface WorkflowConfig {
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
  customSettings: Record<string, unknown>;
}

// ── In-memory cache (60s TTL per tenant, 1K max with LRU eviction) ──
const _cache = new Map<string, { configs: Record<string, WorkflowConfig>; tier: BusinessTier; ts: number; ttl: number }>();
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_SIZE = 1_000;
// Stale entries kept for 5 minutes as fallback when DB is unreachable.
const CACHE_STALE_WINDOW_MS = 5 * 60 * 1000;

// Periodic cleanup of expired entries every 30s.
// Prevents unbounded growth from one-off tenant accesses that never get revisited.
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanupTimer() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _cache) {
      // Delete entries past TTL + stale window (fully expired)
      if (now > v.ts + v.ttl + CACHE_STALE_WINDOW_MS) _cache.delete(k);
    }
  }, 30_000);
  // Unref so timer doesn't block Vercel function shutdown
  if (typeof _cleanupTimer === 'object' && 'unref' in _cleanupTimer) {
    (_cleanupTimer as NodeJS.Timeout).unref();
  }
}

function evictCacheIfNeeded() {
  if (_cache.size <= CACHE_MAX_SIZE) return;
  const keysIter = _cache.keys();
  const toEvict = _cache.size - CACHE_MAX_SIZE;
  for (let i = 0; i < toEvict; i++) {
    const { value, done } = keysIter.next();
    if (done) break;
    _cache.delete(value);
  }
}

export function invalidateWorkflowCache(tenantId: string): void {
  _cache.delete(tenantId);
}

async function loadTenantTier(tenantId: string): Promise<BusinessTier> {
  const rows = await guardedQuery('erp:loadTenantTier', () =>
    db.select({ businessTier: tenants.businessTier })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  );
  return (rows[0]?.businessTier as BusinessTier) ?? 'SMB';
}

async function loadAllConfigs(tenantId: string): Promise<Record<string, WorkflowConfig>> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(erpWorkflowConfigs).where(eq(erpWorkflowConfigs.tenantId, tenantId));
    const map: Record<string, WorkflowConfig> = {};
    for (const row of rows) {
      map[`${row.moduleKey}.${row.workflowKey}`] = {
        autoMode: row.autoMode,
        approvalRequired: row.approvalRequired,
        userVisible: row.userVisible,
        customSettings: (row.customSettings ?? {}) as Record<string, unknown>,
      };
    }
    return map;
  });
}

function getStaleCacheEntry(tenantId: string): { configs: Record<string, WorkflowConfig>; tier: BusinessTier } | null {
  const entry = _cache.get(tenantId);
  if (!entry) return null;
  const staleDeadline = entry.ts + entry.ttl + CACHE_STALE_WINDOW_MS;
  if (Date.now() > staleDeadline) {
    _cache.delete(tenantId);
    return null;
  }
  return entry;
}

async function ensureCache(tenantId: string): Promise<{ configs: Record<string, WorkflowConfig>; tier: BusinessTier }> {
  ensureCleanupTimer();

  // Check fresh cache first
  const cached = _cache.get(tenantId);
  if (cached && Date.now() - cached.ts < cached.ttl) {
    // LRU touch: move to end of insertion order
    _cache.delete(tenantId);
    _cache.set(tenantId, cached);
    return cached;
  }

  // Circuit breaker open — fall back to stale cache instead of queuing more DB load
  if (isBreakerOpen()) {
    const stale = getStaleCacheEntry(tenantId);
    if (stale) {
      console.warn(`[erp-workflow] Circuit breaker open, using stale cache for ${tenantId}`);
      return stale;
    }
  }

  // Single-flight: deduplicate concurrent cache loads for the same tenant
  return singleFlight(`erp-workflow:${tenantId}`, async () => {
    // Re-check cache — another flight may have populated it while we waited
    const rechecked = _cache.get(tenantId);
    if (rechecked && Date.now() - rechecked.ts < rechecked.ttl) {
      return rechecked;
    }

    try {
      const [configs, tier] = await Promise.all([loadAllConfigs(tenantId), loadTenantTier(tenantId)]);
      const entry = { configs, tier, ts: Date.now(), ttl: jitterTtlMs(CACHE_TTL_MS) };
      _cache.delete(tenantId);
      _cache.set(tenantId, entry);
      evictCacheIfNeeded();
      return entry;
    } catch (err) {
      // On timeout or DB error, try stale cache as fallback
      const stale = getStaleCacheEntry(tenantId);
      if (stale) {
        console.warn(`[erp-workflow] DB query failed, using stale cache for ${tenantId}: ${(err as Error).message}`);
        return stale;
      }
      // No stale data available — re-throw
      throw err;
    }
  });
}

/**
 * Read a single workflow config. Falls back to tier defaults when no explicit row exists.
 */
export async function getWorkflowConfig(
  tenantId: string,
  moduleKey: string,
  workflowKey: string,
): Promise<WorkflowConfig> {
  const { configs, tier } = await ensureCache(tenantId);
  const key = `${moduleKey}.${workflowKey}`;
  if (configs[key]) return configs[key];

  // Fall back to tier profile default
  const defaults = TIER_WORKFLOW_DEFAULTS[tier];
  const d = defaults?.[key];
  if (d) {
    return { autoMode: d.autoMode, approvalRequired: d.approvalRequired, userVisible: d.userVisible, customSettings: {} };
  }
  // Ultimate fallback: auto + invisible
  return { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} };
}

/**
 * Get all configs for a single module.
 */
export async function getModuleWorkflowConfigs(
  tenantId: string,
  moduleKey: string,
): Promise<Record<string, WorkflowConfig>> {
  const { configs, tier } = await ensureCache(tenantId);
  const prefix = `${moduleKey}.`;
  const result: Record<string, WorkflowConfig> = {};

  // Start with tier defaults for this module
  const defaults = TIER_WORKFLOW_DEFAULTS[tier] ?? {};
  for (const [key, d] of Object.entries(defaults)) {
    if (key.startsWith(prefix)) {
      result[key] = { autoMode: d.autoMode, approvalRequired: d.approvalRequired, userVisible: d.userVisible, customSettings: {} };
    }
  }
  // Override with explicit configs
  for (const [key, cfg] of Object.entries(configs)) {
    if (key.startsWith(prefix)) {
      result[key] = cfg;
    }
  }
  return result;
}

/**
 * Get ALL workflow configs keyed by `module.workflow`.
 */
export async function getAllWorkflowConfigs(tenantId: string): Promise<Record<string, WorkflowConfig>> {
  const { configs, tier } = await ensureCache(tenantId);
  const result: Record<string, WorkflowConfig> = {};

  // Start with all tier defaults
  const defaults = TIER_WORKFLOW_DEFAULTS[tier] ?? {};
  for (const [key, d] of Object.entries(defaults)) {
    result[key] = { autoMode: d.autoMode, approvalRequired: d.approvalRequired, userVisible: d.userVisible, customSettings: {} };
  }
  // Override with explicit configs
  for (const [key, cfg] of Object.entries(configs)) {
    result[key] = cfg;
  }
  return result;
}

/**
 * Upsert a single workflow config + log the change.
 */
export async function setWorkflowConfig(
  tenantId: string,
  moduleKey: string,
  workflowKey: string,
  config: Partial<Pick<WorkflowConfig, 'autoMode' | 'approvalRequired' | 'userVisible' | 'customSettings'>>,
  changedBy: string,
  reason?: string,
): Promise<void> {
  const oldConfig = await getWorkflowConfig(tenantId, moduleKey, workflowKey);

  await withTenant(tenantId, async (tx) => {
    // Upsert the config row
    await tx
      .insert(erpWorkflowConfigs)
      .values({
        id: generateUlid(),
        tenantId,
        moduleKey,
        workflowKey,
        autoMode: config.autoMode ?? oldConfig.autoMode,
        approvalRequired: config.approvalRequired ?? oldConfig.approvalRequired,
        userVisible: config.userVisible ?? oldConfig.userVisible,
        customSettings: config.customSettings ?? oldConfig.customSettings,
      })
      .onConflictDoUpdate({
        target: [erpWorkflowConfigs.tenantId, erpWorkflowConfigs.moduleKey, erpWorkflowConfigs.workflowKey],
        set: {
          autoMode: sql`EXCLUDED.auto_mode`,
          approvalRequired: sql`EXCLUDED.approval_required`,
          userVisible: sql`EXCLUDED.user_visible`,
          customSettings: sql`EXCLUDED.custom_settings`,
          updatedAt: sql`now()`,
        },
      });

    // Append to change log
    await tx.insert(erpWorkflowConfigChangeLog).values({
      id: generateUlid(),
      tenantId,
      moduleKey,
      workflowKey,
      changedBy,
      changeType: 'manual_override',
      oldConfig: oldConfig as unknown as Record<string, unknown>,
      newConfig: { ...oldConfig, ...config } as unknown as Record<string, unknown>,
      reason: reason ?? null,
    });
  });

  invalidateWorkflowCache(tenantId);
}
