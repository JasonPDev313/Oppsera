/**
 * In-memory sliding window rate limiter.
 * Stage 1: single-instance (Vercel functions). Upgrade to Redis when Stage 2.
 *
 * Uses RateLimitStore interface for future Redis swap — create a
 * RedisRateLimitStore implementation and call setRateLimitStore() in
 * instrumentation.ts.
 */

// ── Interfaces ──────────────────────────────────────────────────

interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Max requests per window per key
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

interface RateLimitEntry {
  timestamps: number[];
  lastAccess: number;
}

/**
 * Pluggable rate limit store interface.
 * Default: in-memory Map. Swap to Redis in Stage 2 via setRateLimitStore().
 */
export interface RateLimitStore {
  check(key: string, config: RateLimitConfig): RateLimitResult;
}

// ── Preset Configurations ───────────────────────────────────────

export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 20 },      // 20 per 15 min
  authStrict: { windowMs: 15 * 60 * 1000, maxRequests: 5 },  // 5 per 15 min (signup, magic link)
  api: { windowMs: 60 * 1000, maxRequests: 100 },            // 100 per minute
  apiWrite: { windowMs: 60 * 1000, maxRequests: 30 },        // 30 per minute (mutations)
  publicRead: { windowMs: 60 * 1000, maxRequests: 30 },      // 30 per minute (public GET — spa, guest)
  publicWrite: { windowMs: 60 * 1000, maxRequests: 5 },      // 5 per minute (public POST — bookings, lookups)
} as const;

// ── In-Memory Rate Limit Store ──────────────────────────────────

class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxStoreSize = 10_000; // LRU eviction threshold

  check(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    this.evictIfNeeded();

    const entry = this.store.get(key) || { timestamps: [], lastAccess: now };

    // Remove timestamps outside the window
    const windowStart = now - config.windowMs;
    entry.timestamps = entry.timestamps.filter(t => t > windowStart);
    entry.lastAccess = now;

    // LRU touch: move to end of insertion order so active IPs survive eviction
    this.store.delete(key);

    if (entry.timestamps.length >= config.maxRequests) {
      this.store.set(key, entry);
      const oldestInWindow = entry.timestamps[0]!;
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldestInWindow + config.windowMs - now,
      };
    }

    entry.timestamps.push(now);
    this.store.set(key, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - entry.timestamps.length,
      resetMs: config.windowMs,
    };
  }

  private evictIfNeeded() {
    if (this.store.size <= this.maxStoreSize) return;

    // Evict oldest 20% using Map insertion order (LRU approximation).
    const evictCount = Math.floor(this.store.size * 0.2);
    const keysIter = this.store.keys();
    for (let i = 0; i < evictCount; i++) {
      const { value, done } = keysIter.next();
      if (done) break;
      this.store.delete(value);
    }
  }
}

// ── Store Singleton ─────────────────────────────────────────────

let _rateLimitStore: RateLimitStore = new InMemoryRateLimitStore();

/** Replace the default in-memory store with a custom implementation (e.g. Redis). */
export function setRateLimitStore(store: RateLimitStore): void {
  _rateLimitStore = store;
}

export function getRateLimitStore(): RateLimitStore {
  return _rateLimitStore;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Extract rate limit key from request.
 * Uses IP from x-forwarded-for (Vercel) or x-real-ip, falls back to 'unknown'.
 */
export function getRateLimitKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${prefix}:${ip}`;
}

/**
 * Check rate limit and return result.
 * Caller is responsible for returning 429 response if not allowed.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  return _rateLimitStore.check(key, config);
}

/**
 * Build rate limit headers for the response.
 */
export function rateLimitHeaders(result: { remaining: number; resetMs: number }): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetMs / 1000)),
  };
}

// ── Account-Level Login Lockout ─────────────────────────────────

interface LockoutEntry {
  failureCount: number;
  lastFailure: number;
  lockedUntil: number | null;
}

const LOCKOUT_MAX_FAILURES = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MAX_ENTRIES = 5_000;

const _lockoutStore = new Map<string, LockoutEntry>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function evictLockoutIfNeeded(): void {
  if (_lockoutStore.size <= LOCKOUT_MAX_ENTRIES) return;
  // Evict oldest 20% using Map insertion order
  const evictCount = Math.floor(_lockoutStore.size * 0.2);
  const keysIter = _lockoutStore.keys();
  for (let i = 0; i < evictCount; i++) {
    const { value, done } = keysIter.next();
    if (done) break;
    _lockoutStore.delete(value);
  }
}

/**
 * Check if an account is currently locked out.
 * Returns { locked, retryAfterMs } — caller should return 429 when locked.
 */
export function checkAccountLockout(email: string): { locked: boolean; retryAfterMs: number } {
  const key = normalizeEmail(email);
  const entry = _lockoutStore.get(key);
  if (!entry || !entry.lockedUntil) return { locked: false, retryAfterMs: 0 };

  const now = Date.now();
  if (now >= entry.lockedUntil) {
    // Lockout expired — clear it
    _lockoutStore.delete(key);
    return { locked: false, retryAfterMs: 0 };
  }

  return { locked: true, retryAfterMs: entry.lockedUntil - now };
}

/**
 * Record a failed login attempt. After LOCKOUT_MAX_FAILURES (5),
 * the account is locked for LOCKOUT_DURATION_MS (15 minutes).
 */
export function recordLoginFailure(email: string): void {
  evictLockoutIfNeeded();
  const key = normalizeEmail(email);
  const now = Date.now();

  // LRU touch
  const existing = _lockoutStore.get(key);
  _lockoutStore.delete(key);

  const entry: LockoutEntry = existing ?? { failureCount: 0, lastFailure: 0, lockedUntil: null };

  // If the previous lockout expired, reset the counter
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    entry.failureCount = 0;
    entry.lockedUntil = null;
  }

  entry.failureCount++;
  entry.lastFailure = now;

  if (entry.failureCount >= LOCKOUT_MAX_FAILURES) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  _lockoutStore.set(key, entry);
}

/**
 * Record a successful login — clears the failure counter for that account.
 */
export function recordLoginSuccess(email: string): void {
  const key = normalizeEmail(email);
  _lockoutStore.delete(key);
}
