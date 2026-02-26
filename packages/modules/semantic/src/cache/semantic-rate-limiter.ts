// ── Semantic Rate Limiter ─────────────────────────────────────────
// Per-tenant sliding window rate limiter for the semantic query endpoint.
// LLM calls are expensive ($$$) — rate limiting prevents runaway usage.
//
// Features:
// - Per-tenant sliding window (default: 30 req/min)
// - Burst protection: max 5 requests within 2 seconds
// - Adaptive backoff: reduces allowed rate when circuit breaker is stressed
//
// Default: 30 requests per minute per tenant.
// Stage 2+: move to Redis for multi-process / multi-instance consistency.

export interface RateLimitConfig {
  maxRequests: number;   // max requests per window
  windowMs: number;      // window duration in ms
  /** Max requests within the burst window (default: 5) */
  burstLimit?: number;
  /** Burst window duration in ms (default: 2000) */
  burstWindowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;     // requests remaining in window
  resetAt: number;       // epoch ms when window resets
  retryAfterMs: number;  // 0 if allowed, else ms to wait
  /** Whether rate was reduced due to adaptive backoff */
  adaptiveReduction?: boolean;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000, // 1 minute
  burstLimit: 5,
  burstWindowMs: 2_000,
};

// ── Adaptive backoff state ──────────────────────────────────────
// When the circuit breaker is stressed (high error rate), we reduce
// the allowed rate to give the Anthropic API room to recover.
// External code calls `setAdaptiveBackoffLevel()` when circuit
// breaker state changes.

type BackoffLevel = 'normal' | 'reduced' | 'minimal';
let _adaptiveBackoffLevel: BackoffLevel = 'normal';

/** Rate multiplier per backoff level */
const BACKOFF_MULTIPLIERS: Record<BackoffLevel, number> = {
  normal: 1.0,    // full rate
  reduced: 0.5,   // 50% rate
  minimal: 0.2,   // 20% rate — circuit breaker likely open or near-open
};

/**
 * Set the adaptive backoff level. Called by the pipeline when it
 * detects the circuit breaker error rate is high.
 */
export function setAdaptiveBackoffLevel(level: BackoffLevel): void {
  if (_adaptiveBackoffLevel !== level) {
    console.log(`[rate-limiter] Adaptive backoff: ${_adaptiveBackoffLevel} → ${level}`);
    _adaptiveBackoffLevel = level;
  }
}

export function getAdaptiveBackoffLevel(): string {
  return _adaptiveBackoffLevel;
}

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
 *
 * Includes:
 * - Sliding window rate limiting
 * - Burst protection (max N requests within M seconds)
 * - Adaptive backoff (reduces rate when circuit breaker is stressed)
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

  // ── Adaptive backoff: reduce effective max based on LLM API health ──
  const multiplier = BACKOFF_MULTIPLIERS[_adaptiveBackoffLevel];
  const effectiveMax = Math.max(1, Math.floor(config.maxRequests * multiplier));
  const adaptiveReduction = multiplier < 1.0;

  const remaining = effectiveMax - timestamps.length;
  const resetAt = timestamps.length > 0
    ? timestamps[0]! + config.windowMs  // oldest request + window
    : now + config.windowMs;

  // ── Sliding window check ──
  if (remaining <= 0) {
    _windows.set(tenantId, timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs: resetAt - now,
      adaptiveReduction,
    };
  }

  // ── Burst protection: cap rapid-fire requests within short window ──
  const burstLimit = config.burstLimit ?? 5;
  const burstWindowMs = config.burstWindowMs ?? 2_000;
  const burstStart = now - burstWindowMs;
  const recentBurst = timestamps.filter((t) => t > burstStart).length;
  if (recentBurst >= burstLimit) {
    _windows.set(tenantId, timestamps);
    const burstResetAt = timestamps.find((t) => t > burstStart)! + burstWindowMs;
    return {
      allowed: false,
      remaining: Math.max(0, remaining),
      resetAt: burstResetAt,
      retryAfterMs: burstResetAt - now,
      adaptiveReduction,
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
    adaptiveReduction,
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
