import {
  MAX_MESSAGES_PER_HOUR,
  MAX_CONCURRENT_THREADS_PER_USER,
  MAX_MESSAGES_PER_THREAD,
} from '../constants';

// ── Types ────────────────────────────────────────────────────────────────────

export type RateLimitType =
  | 'messages_per_hour'
  | 'threads_per_user'
  | 'messages_per_thread';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds until reset
}

// ── In-memory store ──────────────────────────────────────────────────────────

// Key format: `{userId}:{type}`
const rateLimits = new Map<string, RateLimitEntry>();

// ── Config ───────────────────────────────────────────────────────────────────

const LIMITS: Record<RateLimitType, { max: number; windowMs: number }> = {
  messages_per_hour: {
    max: MAX_MESSAGES_PER_HOUR,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  threads_per_user: {
    max: MAX_CONCURRENT_THREADS_PER_USER,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
  },
  messages_per_thread: {
    max: MAX_MESSAGES_PER_THREAD,
    windowMs: 0, // Not time-based — thread lifetime
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeKey(userId: string, type: RateLimitType): string {
  return `${userId}:${type}`;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimits.entries()) {
    if (entry.resetAt > 0 && now > entry.resetAt) {
      rateLimits.delete(key);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a user is within the rate limit for the given action type.
 * Returns `{ allowed: true }` if the action is permitted, or
 * `{ allowed: false, retryAfter: N }` where N is seconds until the window resets.
 */
export function checkRateLimit(
  userId: string,
  type: RateLimitType,
): RateLimitResult {
  pruneExpired();

  const config = LIMITS[type];
  const key = makeKey(userId, type);
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry) {
    // No entry yet — allowed
    return { allowed: true };
  }

  // For thread-based limits (no time window), just check count
  if (config.windowMs === 0) {
    if (entry.count >= config.max) {
      return { allowed: false };
    }
    return { allowed: true };
  }

  // Window expired — allowed
  if (now > entry.resetAt) {
    rateLimits.delete(key);
    return { allowed: true };
  }

  // Within window — check count
  if (entry.count >= config.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

/**
 * Record a usage event for the given user and action type.
 * Should be called after the action is permitted and executed.
 */
export function recordUsage(userId: string, type: RateLimitType): void {
  const config = LIMITS[type];
  const key = makeKey(userId, type);
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry) {
    const resetAt = config.windowMs > 0 ? now + config.windowMs : 0;
    rateLimits.set(key, { count: 1, resetAt });
    return;
  }

  // For time-based limits, reset if window expired
  if (config.windowMs > 0 && now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + config.windowMs });
    return;
  }

  entry.count += 1;
}

/**
 * Reset rate limit counters for a user (used in tests or admin overrides).
 */
export function resetRateLimit(userId: string, type?: RateLimitType): void {
  if (type) {
    rateLimits.delete(makeKey(userId, type));
  } else {
    // Reset all types for this user
    for (const t of Object.keys(LIMITS) as RateLimitType[]) {
      rateLimits.delete(makeKey(userId, t));
    }
  }
}

/**
 * Get current usage stats for a user (useful for debugging/observability).
 */
export function getUsageStats(
  userId: string,
  type: RateLimitType,
): { count: number; remaining: number; resetAt: number } {
  const config = LIMITS[type];
  const key = makeKey(userId, type);
  const entry = rateLimits.get(key);

  if (!entry) {
    return { count: 0, remaining: config.max, resetAt: 0 };
  }

  return {
    count: entry.count,
    remaining: Math.max(0, config.max - entry.count),
    resetAt: entry.resetAt,
  };
}
