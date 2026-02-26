import { createHash } from 'node:crypto';

// ── Semantic Query Result Cache ───────────────────────────────────
// In-memory LRU cache for executed query results.
// Key: tenantId + stable hash of compiled SQL + params.
// Stage 1: in-memory per-process (loses on cold start — acceptable for AI queries).
// Stage 2+: swap backing store to Redis without changing the interface.

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const QUERY_CACHE_MAX_SIZE = 500;          // max entries per process (supports ~50 tenants × 10 unique queries)
const QUERY_CACHE_MAX_PER_TENANT = 50;     // max entries per tenant to prevent single-tenant starvation

// ── Types ─────────────────────────────────────────────────────────

export interface CachedQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  cachedAt: number;
}

export interface QueryCacheStats {
  size: number;
  maxSize: number;
  ttlMs: number;
  hits: number;
  misses: number;
  evictions: number;
}

// ── Internal state ────────────────────────────────────────────────

// Map preserves insertion order — oldest entries are evicted first (LRU approximation).
const _cache = new Map<string, CachedQueryResult>();
// Track entry count per tenant to prevent single-tenant starvation
const _tenantCounts = new Map<string, number>();
let _hits = 0;
let _misses = 0;
let _evictions = 0;

// ── Key generation ────────────────────────────────────────────────
// Uses SHA-256 for collision-resistant cache keys.

function makeCacheKey(tenantId: string, sql: string, params: unknown[]): string {
  const raw = tenantId + '|' + sql + '|' + JSON.stringify(params);
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return `${tenantId}:${hash}`;
}

// ── Cache operations ──────────────────────────────────────────────

export function getFromQueryCache(
  tenantId: string,
  sql: string,
  params: unknown[],
): CachedQueryResult | null {
  const key = makeCacheKey(tenantId, sql, params);
  const entry = _cache.get(key);

  if (!entry) {
    _misses++;
    return null;
  }

  if (Date.now() - entry.cachedAt > QUERY_CACHE_TTL_MS) {
    _cache.delete(key);
    const ct = _tenantCounts.get(tenantId) ?? 0;
    if (ct > 0) _tenantCounts.set(tenantId, ct - 1);
    _misses++;
    return null;
  }

  // Move to end for LRU recency tracking
  _cache.delete(key);
  _cache.set(key, entry);
  _hits++;
  return entry;
}

export function setInQueryCache(
  tenantId: string,
  sql: string,
  params: unknown[],
  rows: Record<string, unknown>[],
  rowCount: number,
): void {
  const key = makeCacheKey(tenantId, sql, params);
  const isUpdate = _cache.has(key);

  // If this tenant already has too many entries, evict their oldest one first
  const tenantCount = _tenantCounts.get(tenantId) ?? 0;
  if (!isUpdate && tenantCount >= QUERY_CACHE_MAX_PER_TENANT) {
    const prefix = `${tenantId}:`;
    for (const k of _cache.keys()) {
      if (k.startsWith(prefix)) {
        _cache.delete(k);
        _tenantCounts.set(tenantId, Math.max(0, tenantCount - 1));
        _evictions++;
        break;
      }
    }
  }

  // Evict oldest entry when at global capacity
  if (!isUpdate && _cache.size >= QUERY_CACHE_MAX_SIZE) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) {
      _cache.delete(firstKey);
      // Decrement tenant count for evicted key
      const evictedTenant = firstKey.split(':')[0]!;
      const ct = _tenantCounts.get(evictedTenant) ?? 0;
      if (ct > 0) _tenantCounts.set(evictedTenant, ct - 1);
      _evictions++;
    }
  }

  _cache.set(key, { rows, rowCount, cachedAt: Date.now() });
  if (!isUpdate) {
    _tenantCounts.set(tenantId, (_tenantCounts.get(tenantId) ?? 0) + 1);
  }
}

/**
 * Invalidate cache entries for a specific tenant, or all entries if
 * tenantId is omitted. Returns the number of entries removed.
 */
export function invalidateQueryCache(tenantId?: string): number {
  if (!tenantId) {
    const count = _cache.size;
    _cache.clear();
    _tenantCounts.clear();
    return count;
  }

  let count = 0;
  const prefix = `${tenantId}:`;
  for (const key of Array.from(_cache.keys())) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
      count++;
    }
  }
  _tenantCounts.delete(tenantId);
  return count;
}

export function getQueryCacheStats(): QueryCacheStats {
  return {
    size: _cache.size,
    maxSize: QUERY_CACHE_MAX_SIZE,
    ttlMs: QUERY_CACHE_TTL_MS,
    hits: _hits,
    misses: _misses,
    evictions: _evictions,
  };
}

/** Reset counters and tenant tracking (for testing). */
export function resetQueryCacheStats(): void {
  _hits = 0;
  _misses = 0;
  _evictions = 0;
  _tenantCounts.clear();
}
