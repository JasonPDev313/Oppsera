/**
 * In-memory sliding window rate limiter.
 * Stage 1: single-instance (Vercel functions). Upgrade to Redis when Stage 2.
 */

interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Max requests per window per key
}

interface RateLimitEntry {
  timestamps: number[];
  lastAccess: number;
}

// Preset configurations for different endpoint types
export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 20 },      // 20 per 15 min
  authStrict: { windowMs: 15 * 60 * 1000, maxRequests: 5 },  // 5 per 15 min (signup, magic link)
  api: { windowMs: 60 * 1000, maxRequests: 100 },            // 100 per minute
  apiWrite: { windowMs: 60 * 1000, maxRequests: 30 },        // 30 per minute (mutations)
} as const;

class SlidingWindowRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxStoreSize = 10_000; // LRU eviction threshold

  check(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetMs: number } {
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
    // Map.keys() iterates in insertion order — oldest entries first.
    // This is O(evictCount) instead of O(n log n) from the previous sort.
    const evictCount = Math.floor(this.store.size * 0.2);
    const keysIter = this.store.keys();
    for (let i = 0; i < evictCount; i++) {
      const { value, done } = keysIter.next();
      if (done) break;
      this.store.delete(value);
    }
  }
}

// Singleton
let _rateLimiter: SlidingWindowRateLimiter | null = null;

function getRateLimiter(): SlidingWindowRateLimiter {
  if (!_rateLimiter) {
    _rateLimiter = new SlidingWindowRateLimiter();
  }
  return _rateLimiter;
}

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
): { allowed: boolean; remaining: number; resetMs: number } {
  return getRateLimiter().check(key, config);
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
