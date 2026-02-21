// ── Semantic Query Result Cache ───────────────────────────────────
// In-memory LRU cache for executed query results.
// Key: tenantId + stable hash of compiled SQL + params.
// Stage 1: in-memory per-process (loses on cold start — acceptable for AI queries).
// Stage 2+: swap backing store to Redis without changing the interface.

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const QUERY_CACHE_MAX_SIZE = 200;          // max entries per process

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
let _hits = 0;
let _misses = 0;
let _evictions = 0;

// ── Key generation ────────────────────────────────────────────────
// djb2 hash for compact cache keys.

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function makeCacheKey(tenantId: string, sql: string, params: unknown[]): string {
  const raw = tenantId + '|' + sql + '|' + JSON.stringify(params);
  return `${tenantId}:${djb2(raw).toString(16)}`;
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

  // Evict oldest entry when at capacity
  if (_cache.size >= QUERY_CACHE_MAX_SIZE) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) {
      _cache.delete(firstKey);
      _evictions++;
    }
  }

  _cache.set(key, { rows, rowCount, cachedAt: Date.now() });
}

/**
 * Invalidate cache entries for a specific tenant, or all entries if
 * tenantId is omitted. Returns the number of entries removed.
 */
export function invalidateQueryCache(tenantId?: string): number {
  if (!tenantId) {
    const count = _cache.size;
    _cache.clear();
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

/** Reset counters (for testing). */
export function resetQueryCacheStats(): void {
  _hits = 0;
  _misses = 0;
  _evictions = 0;
}
