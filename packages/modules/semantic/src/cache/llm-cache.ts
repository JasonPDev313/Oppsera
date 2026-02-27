import { createHash } from 'node:crypto';

// -- LLM Prompt-Level Response Cache -------------------------------------------
// Caches LLM responses by hashing the system prompt + user message + conversation
// history. This avoids re-calling the LLM for identical questions within the TTL
// window. LLM calls are expensive (~500ms+ latency, ~$0.003/call for Haiku),
// so the TTL is longer than the query cache.
//
// Stage 1: in-memory per-process (loses on cold start -- acceptable for AI queries).
// Stage 2+: swap backing store to Redis without changing the interface.

const LLM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LLM_CACHE_SWR_WINDOW_MS = 20 * 60 * 1000; // 20 minutes — serve stale for up to 20 min while revalidating
const LLM_CACHE_MAX_SIZE = 300;           // max entries per process
const LLM_PER_TENANT_CAP = 50;           // max entries per tenant (prevents noisy-neighbor)

// -- Types --------------------------------------------------------------------

export interface CachedLLMResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  provider: string;
  latencyMs: number;
  cachedAt: number;
  /** Serialized narrative sections (replaces overloading the `model` field). */
  sectionsJson?: string;
}

export interface LLMCacheStats {
  size: number;
  maxSize: number;
  ttlMs: number;
  swrWindowMs: number;
  hits: number;
  misses: number;
  evictions: number;
  staleHits: number;
}

// -- Internal state -----------------------------------------------------------

// Map preserves insertion order -- oldest entries are evicted first (LRU approximation).
const _cache = new Map<string, CachedLLMResponse>();
// O(1) tenant entry counts — avoids iterating all keys on every setInLLMCache call
const _tenantCounts = new Map<string, number>();
let _hits = 0;
let _misses = 0;
let _evictions = 0;
let _staleHits = 0;

function extractTenantId(key: string): string {
  return key.slice(0, key.indexOf(':'));
}

// -- Key generation -----------------------------------------------------------
// Uses SHA-256 for collision-resistant cache keys.

function sha256Short(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

/**
 * Pre-compute a stable hash of the system prompt. Call once per prompt template
 * and pass the result to getFromLLMCache / setInLLMCache so the large prompt
 * string is not re-hashed on every cache lookup.
 */
export function hashSystemPrompt(prompt: string): string {
  return sha256Short(prompt);
}

function makeHistoryHash(history?: { role: string; content: string }[]): string {
  if (!history || history.length === 0) return '';
  return sha256Short(
    history
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('|'),
  );
}

function makeCacheKey(
  tenantId: string,
  systemPromptHash: string,
  userMessage: string,
  history?: { role: string; content: string }[],
): string {
  const historyHash = makeHistoryHash(history);
  const messageHash = sha256Short(userMessage + historyHash);
  return `${tenantId}:${systemPromptHash}:${messageHash}`;
}

// -- Cache operations ---------------------------------------------------------

/**
 * Look up a cached LLM response. Returns null on miss or TTL expiry.
 *
 * @param tenantId         Tenant isolation key
 * @param systemPromptHash Pre-computed hash from `hashSystemPrompt()`
 * @param userMessage      The user's current message
 * @param history          Optional conversation history (only user messages are hashed)
 */
export function getFromLLMCache(
  tenantId: string,
  systemPromptHash: string,
  userMessage: string,
  history?: { role: string; content: string }[],
): CachedLLMResponse | null {
  const key = makeCacheKey(tenantId, systemPromptHash, userMessage, history);
  const entry = _cache.get(key);

  if (!entry) {
    _misses++;
    return null;
  }

  if (Date.now() - entry.cachedAt > LLM_CACHE_TTL_MS) {
    _cache.delete(key);
    const tid = extractTenantId(key);
    const cnt = _tenantCounts.get(tid);
    if (cnt !== undefined) {
      if (cnt <= 1) _tenantCounts.delete(tid); else _tenantCounts.set(tid, cnt - 1);
    }
    _misses++;
    return null;
  }

  // Move to end for LRU recency tracking (tenant count unchanged — same key)
  _cache.delete(key);
  _cache.set(key, entry);
  _hits++;
  return entry;
}

/**
 * Look up a cached LLM response with extended stale-while-revalidate window.
 * Returns entries up to SWR_WINDOW_MS old (even if past TTL), for use as fallback
 * when the LLM API is unavailable (circuit breaker open, rate limited, etc.).
 *
 * Unlike `getFromLLMCache`, this does NOT count as a cache hit (for stats).
 */
export function getStaleFromLLMCache(
  tenantId: string,
  systemPromptHash: string,
  userMessage: string,
  history?: { role: string; content: string }[],
): CachedLLMResponse | null {
  const key = makeCacheKey(tenantId, systemPromptHash, userMessage, history);
  const entry = _cache.get(key);

  if (!entry) return null;

  // Allow entries up to SWR window (much longer than normal TTL)
  if (Date.now() - entry.cachedAt > LLM_CACHE_SWR_WINDOW_MS) {
    _cache.delete(key);
    const tid = extractTenantId(key);
    const cnt = _tenantCounts.get(tid);
    if (cnt !== undefined) {
      if (cnt <= 1) _tenantCounts.delete(tid); else _tenantCounts.set(tid, cnt - 1);
    }
    return null;
  }

  _staleHits++;
  return entry;
}

/**
 * Store an LLM response in the cache.
 *
 * @param tenantId         Tenant isolation key
 * @param systemPromptHash Pre-computed hash from `hashSystemPrompt()`
 * @param userMessage      The user's current message
 * @param history          Conversation history used for the call
 * @param response         The LLM response to cache
 */
export function setInLLMCache(
  tenantId: string,
  systemPromptHash: string,
  userMessage: string,
  history: { role: string; content: string }[] | undefined,
  response: Omit<CachedLLMResponse, 'cachedAt'>,
): void {
  const key = makeCacheKey(tenantId, systemPromptHash, userMessage, history);

  // If key already exists, this is an overwrite — no count changes needed for that slot
  const isOverwrite = _cache.has(key);

  // Evict oldest entry when at global capacity
  if (!isOverwrite && _cache.size >= LLM_CACHE_MAX_SIZE) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) {
      _cache.delete(firstKey);
      const evictedTid = extractTenantId(firstKey);
      const evictedCnt = _tenantCounts.get(evictedTid);
      if (evictedCnt !== undefined) {
        if (evictedCnt <= 1) _tenantCounts.delete(evictedTid); else _tenantCounts.set(evictedTid, evictedCnt - 1);
      }
      _evictions++;
    }
  }

  // Per-tenant cap: O(1) lookup via _tenantCounts map
  if (!isOverwrite) {
    const tenantCount = _tenantCounts.get(tenantId) ?? 0;
    if (tenantCount >= LLM_PER_TENANT_CAP) {
      // Evict the first (oldest) entry for this tenant
      const prefix = `${tenantId}:`;
      for (const k of _cache.keys()) {
        if (k.startsWith(prefix)) {
          _cache.delete(k);
          _tenantCounts.set(tenantId, tenantCount - 1);
          _evictions++;
          break;
        }
      }
    }
  }

  _cache.set(key, { ...response, cachedAt: Date.now() });
  if (!isOverwrite) {
    _tenantCounts.set(tenantId, (_tenantCounts.get(tenantId) ?? 0) + 1);
  }
}

/**
 * Invalidate cache entries for a specific tenant, or all entries if
 * tenantId is omitted. Returns the number of entries removed.
 */
export function invalidateLLMCache(tenantId?: string): number {
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

export function getLLMCacheStats(): LLMCacheStats {
  return {
    size: _cache.size,
    maxSize: LLM_CACHE_MAX_SIZE,
    ttlMs: LLM_CACHE_TTL_MS,
    swrWindowMs: LLM_CACHE_SWR_WINDOW_MS,
    hits: _hits,
    misses: _misses,
    evictions: _evictions,
    staleHits: _staleHits,
  };
}

/** Reset counters and tenant tracking (for testing). */
export function resetLLMCacheStats(): void {
  _hits = 0;
  _misses = 0;
  _evictions = 0;
  _staleHits = 0;
  _tenantCounts.clear();
}
