// ── Semantic Rate Limiter ─────────────────────────────────────────
// Per-tenant sliding window rate limiter for the semantic query endpoint.
// LLM calls are expensive ($$$) — rate limiting prevents runaway usage.
//
// Default: 30 requests per minute per tenant.
// Stage 2+: move to Redis for multi-process / multi-instance consistency.

export interface RateLimitConfig {
  maxRequests: number;   // max requests per window
  windowMs: number;      // window duration in ms
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;     // requests remaining in window
  resetAt: number;       // epoch ms when window resets
  retryAfterMs: number;  // 0 if allowed, else ms to wait
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000, // 1 minute
};

// tenantId → sorted array of request timestamps within the current window
const _windows = new Map<string, number[]>();
const MAX_TRACKED_TENANTS = 2_000;

// Periodic cleanup of expired windows every 60s.
// Prevents unbounded growth from tenants that made one AI query and never returned.
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanupTimer() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, ts] of _windows) {
      // If all timestamps are outside any reasonable window (2min), evict
      if (ts.length === 0 || ts[ts.length - 1]! < now - 120_000) {
        _windows.delete(k);
      }
    }
  }, 60_000);
  if (typeof _cleanupTimer === 'object' && 'unref' in _cleanupTimer) {
    (_cleanupTimer as NodeJS.Timeout).unref();
  }
}

function evictIfNeeded() {
  if (_windows.size <= MAX_TRACKED_TENANTS) return;
  // Evict tenants with the oldest last-request timestamp
  const keysIter = _windows.keys();
  const toEvict = _windows.size - MAX_TRACKED_TENANTS;
  for (let i = 0; i < toEvict; i++) {
    const { value, done } = keysIter.next();
    if (done) break;
    _windows.delete(value);
  }
}

/**
 * Attempt to consume one request slot for the given tenant.
 * Returns whether the request is allowed and rate limit metadata.
 */
export function checkSemanticRateLimit(
  tenantId: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): RateLimitResult {
  ensureCleanupTimer();
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get or create request timestamps for this tenant
  let timestamps = _windows.get(tenantId) ?? [];

  // Evict timestamps outside the window
  timestamps = timestamps.filter((t) => t > windowStart);

  const remaining = config.maxRequests - timestamps.length;
  const resetAt = timestamps.length > 0
    ? timestamps[0]! + config.windowMs  // oldest request + window
    : now + config.windowMs;

  if (remaining <= 0) {
    _windows.set(tenantId, timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs: resetAt - now,
    };
  }

  // Consume the slot
  timestamps.push(now);
  _windows.set(tenantId, timestamps);
  evictIfNeeded();

  return {
    allowed: true,
    remaining: remaining - 1,
    resetAt,
    retryAfterMs: 0,
  };
}

/**
 * Returns current rate limit status without consuming a slot.
 * Useful for preflight checks or UI display.
 */
export function getSemanticRateLimitStatus(
  tenantId: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): Omit<RateLimitResult, 'allowed'> {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const timestamps = (_windows.get(tenantId) ?? []).filter((t) => t > windowStart);
  const remaining = Math.max(0, config.maxRequests - timestamps.length);
  const resetAt = timestamps.length > 0
    ? timestamps[0]! + config.windowMs
    : now + config.windowMs;

  return { remaining, resetAt, retryAfterMs: remaining === 0 ? resetAt - now : 0 };
}

/** Clear all rate limit state (for testing). */
export function resetSemanticRateLimiter(): void {
  _windows.clear();
}

/** Get all tenants currently tracked (for observability). */
export function getTrackedTenantsCount(): number {
  return _windows.size;
}
