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

/**
 * Attempt to consume one request slot for the given tenant.
 * Returns whether the request is allowed and rate limit metadata.
 */
export function checkSemanticRateLimit(
  tenantId: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): RateLimitResult {
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
