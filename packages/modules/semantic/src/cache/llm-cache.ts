// -- LLM Prompt-Level Response Cache -------------------------------------------
// Caches LLM responses by hashing the system prompt + user message + conversation
// history. This avoids re-calling the LLM for identical questions within the TTL
// window. LLM calls are expensive (~500ms+ latency, ~$0.003/call for Haiku),
// so the TTL is longer than the query cache.
//
// Stage 1: in-memory per-process (loses on cold start -- acceptable for AI queries).
// Stage 2+: swap backing store to Redis without changing the interface.

const LLM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LLM_CACHE_MAX_SIZE = 100;           // max entries per process

// -- Types --------------------------------------------------------------------

export interface CachedLLMResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  provider: string;
  latencyMs: number;
  cachedAt: number;
}

export interface LLMCacheStats {
  size: number;
  maxSize: number;
  ttlMs: number;
  hits: number;
  misses: number;
  evictions: number;
}

// -- Internal state -----------------------------------------------------------

// Map preserves insertion order -- oldest entries are evicted first (LRU approximation).
const _cache = new Map<string, CachedLLMResponse>();
let _hits = 0;
let _misses = 0;
let _evictions = 0;

// -- Key generation -----------------------------------------------------------
// djb2 hash for compact cache keys (same algorithm as query-cache.ts).

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Pre-compute a stable hash of the system prompt. Call once per prompt template
 * and pass the result to getFromLLMCache / setInLLMCache so the large prompt
 * string is not re-hashed on every cache lookup.
 */
export function hashSystemPrompt(prompt: string): string {
  return djb2(prompt).toString(16);
}

function makeHistoryHash(history?: { role: string; content: string }[]): string {
  if (!history || history.length === 0) return '';
  return djb2(
    history
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('|'),
  ).toString(16);
}

function makeCacheKey(
  tenantId: string,
  systemPromptHash: string,
  userMessage: string,
  history?: { role: string; content: string }[],
): string {
  const historyHash = makeHistoryHash(history);
  const messageHash = djb2(userMessage + historyHash).toString(16);
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
    _misses++;
    return null;
  }

  // Move to end for LRU recency tracking
  _cache.delete(key);
  _cache.set(key, entry);
  _hits++;
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

  // Evict oldest entry when at capacity
  if (_cache.size >= LLM_CACHE_MAX_SIZE) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) {
      _cache.delete(firstKey);
      _evictions++;
    }
  }

  _cache.set(key, { ...response, cachedAt: Date.now() });
}

/**
 * Invalidate cache entries for a specific tenant, or all entries if
 * tenantId is omitted. Returns the number of entries removed.
 */
export function invalidateLLMCache(tenantId?: string): number {
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

export function getLLMCacheStats(): LLMCacheStats {
  return {
    size: _cache.size,
    maxSize: LLM_CACHE_MAX_SIZE,
    ttlMs: LLM_CACHE_TTL_MS,
    hits: _hits,
    misses: _misses,
    evictions: _evictions,
  };
}

/** Reset counters (for testing). */
export function resetLLMCacheStats(): void {
  _hits = 0;
  _misses = 0;
  _evictions = 0;
}
