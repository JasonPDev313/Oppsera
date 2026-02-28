/**
 * Pool Guard — DB concurrency limiter + circuit breaker + pool exhaustion detection.
 *
 * Prevents pool exhaustion death spirals by:
 * 1. Limiting concurrent DB operations to pool size (turns spikes into queues)
 * 2. Tripping a circuit breaker on pool exhaustion errors (fail-fast for 10s)
 * 3. Detecting pool exhaustion across different error patterns
 * 4. Logging slow queries and queue depth warnings
 *
 * @module
 */

const POOL_MAX = parseInt(process.env.DB_POOL_MAX || '2', 10);
const CONCURRENCY_LIMIT = parseInt(process.env.DB_CONCURRENCY || String(POOL_MAX + 2), 10);
const BREAKER_COOLDOWN_MS = 10_000;
const QUEUE_WARN_THRESHOLD = 5;
const SLOW_QUERY_THRESHOLD_MS = 5_000;
const QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT || '15000', 10);

// ── Simple semaphore (no external deps) ──────────────────────────────────────
class Semaphore {
  private queue: (() => void)[] = [];
  private current = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }

  get pending() {
    return this.queue.length;
  }
  get active() {
    return this.current;
  }
}

const semaphore = new Semaphore(CONCURRENCY_LIMIT);

// ── Circuit breaker ──────────────────────────────────────────────────────────
let breakerOpenUntil = 0;
let breakerTripCount = 0;

export function isBreakerOpen(): boolean {
  return Date.now() < breakerOpenUntil;
}

export function tripBreaker(cooldownMs = BREAKER_COOLDOWN_MS): void {
  breakerOpenUntil = Date.now() + cooldownMs;
  breakerTripCount++;
  console.error(
    `[pool-guard] Circuit breaker OPEN (trip #${breakerTripCount}). ` +
      `DB operations will fail fast for ${cooldownMs / 1000}s`,
  );
}

// ── Pool exhaustion detection ────────────────────────────────────────────────
// Covers postgres.js, pg, pgBouncer, Supavisor, and native Postgres errors.
export function isPoolExhaustion(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '').toLowerCase();
  const code = (err as { code?: string })?.code;
  return (
    msg.includes('too many clients') ||
    msg.includes('connection slots') ||
    (msg.includes('timeout') && msg.includes('connect')) ||
    (msg.includes('acquire') && msg.includes('connection')) ||
    (msg.includes('pool') && msg.includes('exhaust')) ||
    msg.includes('remaining connection slots are reserved') ||
    code === '53300' // postgres too_many_connections
  );
}

// ── Active operations tracking ───────────────────────────────────────────────
const _activeOps = new Map<string, { opName: string; startedAt: number }>();
let _opIdCounter = 0;

// ── Guarded DB execution ─────────────────────────────────────────────────────
/**
 * Wraps a DB operation with concurrency limiting + circuit breaker + per-query timeout.
 *
 * - If circuit breaker is open, rejects immediately (fail-fast)
 * - If concurrency limit is reached, queues the operation
 * - If pool exhaustion is detected in the error, trips the circuit breaker
 * - If a query exceeds QUERY_TIMEOUT_MS, the Promise rejects and the semaphore is released
 * - Logs slow queries (>5s) and queue depth warnings
 * - Tracks active ops for diagnostics
 */
export async function guardedQuery<T>(opName: string, fn: () => Promise<T>): Promise<T> {
  // Circuit breaker — fail fast during pool exhaustion recovery
  if (isBreakerOpen()) {
    const err = new Error(`[pool-guard] Circuit breaker open — DB temporarily unavailable (op: ${opName})`);
    (err as { code?: string }).code = 'CIRCUIT_BREAKER_OPEN';
    throw err;
  }

  // Log when queue is backing up
  if (semaphore.pending >= QUEUE_WARN_THRESHOLD) {
    console.warn(
      `[pool-guard] DB queue depth: ${semaphore.pending} waiting, ${semaphore.active} active (op: ${opName})`,
    );
  }

  await semaphore.acquire();
  const start = Date.now();
  const opId = String(++_opIdCounter);
  _activeOps.set(opId, { opName, startedAt: start });

  try {
    // Per-query timeout — prevents a stuck query from holding a pool connection forever
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          const err = new Error(
            `[pool-guard] Query timeout: ${opName} exceeded ${QUERY_TIMEOUT_MS}ms`,
          );
          (err as { code?: string }).code = 'QUERY_TIMEOUT';
          console.error(err.message);
          reject(err);
        }, QUERY_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

    const duration = Date.now() - start;
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`[pool-guard] Slow DB op: ${opName} took ${duration}ms`);
    }
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    if (isPoolExhaustion(err)) {
      console.error(`[pool-guard] Pool exhaustion detected in ${opName} after ${duration}ms`);
      tripBreaker();
    }
    throw err;
  } finally {
    _activeOps.delete(opId);
    semaphore.release();
  }
}

// ── Single-flight deduplication ──────────────────────────────────────────────
// Prevents cache stampedes: when N concurrent requests need the same uncached key,
// only the first executes the DB query — the others await the same Promise.
const _inFlight = new Map<string, Promise<unknown>>();

export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = _inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => _inFlight.delete(key));
  _inFlight.set(key, p);
  return p;
}

// ── TTL jitter ───────────────────────────────────────────────────────────────
// Adds ±15% random jitter to TTL values to prevent synchronized cache expirations.
// Without jitter, all caches set at the same time expire at the same time,
// causing a "thundering herd" of DB queries that can exhaust the pool.
export function jitterTtl(baseTtlSeconds: number): number {
  const jitter = 0.15;
  const factor = 1 + (Math.random() * 2 - 1) * jitter; // 0.85 to 1.15
  return Math.round(baseTtlSeconds * factor);
}

/** Same as jitterTtl but for millisecond values. */
export function jitterTtlMs(baseTtlMs: number): number {
  const jitter = 0.15;
  const factor = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.round(baseTtlMs * factor);
}

// ── Observability ────────────────────────────────────────────────────────────
export function getPoolGuardStats() {
  const now = Date.now();
  const activeOps = Array.from(_activeOps.values()).map((op) => ({
    opName: op.opName,
    durationMs: now - op.startedAt,
  }));

  return {
    active: semaphore.active,
    queued: semaphore.pending,
    breakerOpen: isBreakerOpen(),
    breakerTripCount,
    concurrencyLimit: CONCURRENCY_LIMIT,
    queryTimeoutMs: QUERY_TIMEOUT_MS,
    activeOps,
  };
}
