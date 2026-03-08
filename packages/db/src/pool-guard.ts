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
// Semaphore concurrency: POOL_MAX + 1 allows one queued op ready to run when a
// slot frees (enables Promise.all parallelism within a request) while keeping
// head-of-line blocking minimal. With POOL_MAX + 2, two ops queue at the
// postgres.js pool level where there's no timeout control.
const CONCURRENCY_LIMIT = parseInt(process.env.DB_CONCURRENCY || String(POOL_MAX + 1), 10);
const BREAKER_COOLDOWN_MS = 10_000;
const QUEUE_WARN_THRESHOLD = 5;
const SLOW_QUERY_THRESHOLD_MS = 5_000;
const QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT || '15000', 10);
// Queue timeout: if a request can't acquire a semaphore slot within this window,
// fail fast with 503 instead of hanging until query timeout (15s) or statement
// timeout (30s). Turns "whole app hangs" into "fast fail + client retry."
const QUEUE_TIMEOUT_MS = parseInt(process.env.DB_QUEUE_TIMEOUT || '5000', 10);
// Maximum queue depth before rejecting immediately (prevents OOM under sustained load).
const MAX_QUEUE_SIZE = parseInt(process.env.DB_MAX_QUEUE || '50', 10);

// ── Semaphore with acquire timeout ───────────────────────────────────────────
// Supports optional timeout on acquire() so callers fail fast under pool pressure
// instead of queuing indefinitely.
interface QueueEntry {
  resolve: () => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

class Semaphore {
  private queue: QueueEntry[] = [];
  private current = 0;
  private _maxQueue: number;

  constructor(private max: number, maxQueue = MAX_QUEUE_SIZE) {
    this._maxQueue = maxQueue;
  }

  async acquire(timeoutMs?: number): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }

    // Reject immediately if the queue is full — prevents OOM under sustained load
    if (this.queue.length >= this._maxQueue) {
      const err = new Error(
        `[pool-guard] Queue full: ${this.queue.length} waiting, ${this.current} active — rejecting immediately`,
      );
      (err as { code?: string }).code = 'QUEUE_FULL';
      throw err;
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = { resolve, reject };

      if (timeoutMs != null && timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          const idx = this.queue.indexOf(entry);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
            const err = new Error(
              `[pool-guard] Queue timeout: waited ${timeoutMs}ms for DB slot ` +
                `(${this.current} active, ${this.queue.length} queued)`,
            );
            (err as { code?: string }).code = 'QUEUE_TIMEOUT';
            reject(err);
          }
          // If not in queue, release() already resolved this entry — no-op
        }, timeoutMs);
      }

      this.queue.push(entry);
    });
  }

  release(): void {
    // Guard against double-release driving current below zero
    if (this.current <= 0) {
      console.error(
        `[pool-guard] Semaphore release called with current=${this.current} — ignoring to prevent corruption`,
      );
      return;
    }
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      if (next.timer) clearTimeout(next.timer);
      next.resolve();
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

// ── Circuit breaker (with half-open probe) ───────────────────────────────────
// States: CLOSED (normal) → OPEN (fail-fast) → HALF_OPEN (single probe) → CLOSED
// Half-open prevents thundering herd: after cooldown, only ONE request probes the DB.
// If it succeeds → CLOSED. If it fails → OPEN again with fresh cooldown.
let breakerOpenUntil = 0;
let breakerTripCount = 0;
let _halfOpenProbeInFlight = false;

type BreakerState = 'closed' | 'open' | 'half_open';

export function getBreakerState(): BreakerState {
  const now = Date.now();
  if (now >= breakerOpenUntil && breakerOpenUntil > 0) {
    // Cooldown expired — transition to half-open (unless already probing)
    return 'half_open';
  }
  if (now < breakerOpenUntil) return 'open';
  return 'closed';
}

export function isBreakerOpen(): boolean {
  return getBreakerState() === 'open';
}

export function tripBreaker(cooldownMs = BREAKER_COOLDOWN_MS): void {
  breakerOpenUntil = Date.now() + cooldownMs;
  breakerTripCount++;
  _halfOpenProbeInFlight = false;
  console.error(
    `[pool-guard] Circuit breaker OPEN (trip #${breakerTripCount}). ` +
      `DB operations will fail fast for ${cooldownMs / 1000}s`,
  );
}

function closeBreaker(): void {
  breakerOpenUntil = 0;
  _halfOpenProbeInFlight = false;
}

/** Manually reset the circuit breaker to closed state (for emergency recovery via health endpoint). */
export function resetBreaker(): void {
  const wasOpen = breakerOpenUntil > 0;
  closeBreaker();
  if (wasOpen) {
    console.warn('[pool-guard] Circuit breaker manually RESET to closed');
  }
}

/** Try to claim the half-open probe slot. Returns true if this caller is the probe. */
function tryClaimHalfOpenProbe(): boolean {
  if (_halfOpenProbeInFlight) return false;
  _halfOpenProbeInFlight = true;
  return true;
}

// ── Pool exhaustion detection ────────────────────────────────────────────────
// Covers postgres.js, pg, pgBouncer, Supavisor, native Postgres errors,
// connection-level failures (ECONNREFUSED/ECONNRESET/EPIPE), and our own
// QUERY_TIMEOUT / QUEUE_TIMEOUT / QUEUE_FULL codes (strong signals of pool pressure).
export function isPoolExhaustion(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '').toLowerCase();
  const code = (err as { code?: string })?.code;
  return (
    msg.includes('too many clients') ||
    msg.includes('max client connections') || // Supavisor pool limit
    msg.includes('connection slots') ||
    (msg.includes('timeout') && msg.includes('connect')) ||
    (msg.includes('acquire') && msg.includes('connection')) ||
    (msg.includes('pool') && msg.includes('exhaust')) ||
    msg.includes('remaining connection slots are reserved') ||
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('connection refused') ||
    msg.includes('broken pipe') ||
    code === '53300' || // postgres too_many_connections
    code === '57P01' || // postgres admin_shutdown (DB restarting)
    code === '57P03' || // postgres cannot_connect_now
    code === 'ECONNREFUSED' || // DB or pooler down
    code === 'ECONNRESET' || // Connection dropped mid-flight
    code === 'EPIPE' || // Write to closed socket
    code === 'QUERY_TIMEOUT' || // our per-query timeout (connection likely stuck)
    code === 'QUEUE_TIMEOUT' || // our semaphore queue timeout (all slots occupied)
    code === 'QUEUE_FULL' // our queue is at capacity
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
 * - If concurrency limit is reached, queues the operation (with queue timeout)
 * - If queued longer than QUEUE_TIMEOUT_MS, rejects with QUEUE_TIMEOUT (fast-fail)
 * - If pool exhaustion is detected in the error, trips the circuit breaker
 * - If a query exceeds QUERY_TIMEOUT_MS, the Promise rejects and the semaphore is released
 * - Logs slow queries (>5s) and queue depth warnings
 * - Tracks active ops for diagnostics
 */
export async function guardedQuery<T>(opName: string, fn: () => Promise<T>): Promise<T> {
  // Circuit breaker — fail fast during pool exhaustion recovery
  const state = getBreakerState();
  let isProbe = false;

  if (state === 'open') {
    const err = new Error(`[pool-guard] Circuit breaker open — DB temporarily unavailable (op: ${opName})`);
    (err as { code?: string }).code = 'CIRCUIT_BREAKER_OPEN';
    throw err;
  }

  if (state === 'half_open') {
    // Only one probe request passes through; the rest fail fast
    isProbe = tryClaimHalfOpenProbe();
    if (!isProbe) {
      const err = new Error(`[pool-guard] Circuit breaker half-open — probe in flight, rejecting (op: ${opName})`);
      (err as { code?: string }).code = 'CIRCUIT_BREAKER_OPEN';
      throw err;
    }
    console.warn(`[pool-guard] Circuit breaker HALF-OPEN — probing with: ${opName}`);
  }

  // Log when queue is backing up
  if (semaphore.pending >= QUEUE_WARN_THRESHOLD) {
    console.warn(
      `[pool-guard] DB queue depth: ${semaphore.pending} waiting, ${semaphore.active} active (op: ${opName})`,
    );
  }

  // Acquire semaphore with queue timeout — fail fast if pool is under pressure.
  // Without this, requests queue indefinitely when both pool connections are stuck,
  // turning a "two slow queries" problem into a "whole app hangs for 30s" outage.
  try {
    await semaphore.acquire(QUEUE_TIMEOUT_MS);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'QUEUE_TIMEOUT' || code === 'QUEUE_FULL') {
      console.error(`[pool-guard] ${(err as Error).message} (op: ${opName})`);
    }
    if (isProbe) {
      // Probe failed to acquire — re-trip breaker
      tripBreaker();
    }
    throw err;
  }
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

    // Probe succeeded — close the breaker
    if (isProbe) {
      console.warn(`[pool-guard] Half-open probe succeeded (${opName}, ${duration}ms) — breaker CLOSED`);
      closeBreaker();
    }

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    if (isPoolExhaustion(err)) {
      console.error(`[pool-guard] Pool exhaustion detected in ${opName} after ${duration}ms`);
      tripBreaker();
    } else if (isProbe) {
      // Non-pool error during probe — still re-trip to be safe
      console.error(`[pool-guard] Half-open probe failed (${opName}, ${duration}ms) — breaker re-OPEN`);
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
// On error, the key is removed immediately so the next caller retries fresh
// instead of receiving a stale rejection.
const _inFlight = new Map<string, Promise<unknown>>();

export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = _inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().then(
    (result) => {
      _inFlight.delete(key);
      return result;
    },
    (err) => {
      // Remove immediately on error so next caller retries instead of
      // getting the cached rejection
      _inFlight.delete(key);
      throw err;
    },
  );
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

// ── Zombie connection tracking ────────────────────────────────────────────────
// Track zombie kills across the process lifetime for observability.
// Incremented by the drain-outbox cron and health endpoint when they detect/kill zombies.
let _zombieKillCount = 0;
let _zombieDetectCount = 0;

/** Record a zombie connection detection (found but not necessarily killed). */
export function recordZombieDetection(count = 1): void {
  _zombieDetectCount += count;
}

/** Record a zombie connection kill (successfully terminated). */
export function recordZombieKill(count = 1): void {
  _zombieKillCount += count;
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
    breakerState: getBreakerState(),
    breakerOpen: getBreakerState() !== 'closed',
    breakerTripCount,
    concurrencyLimit: CONCURRENCY_LIMIT,
    maxQueueSize: MAX_QUEUE_SIZE,
    queryTimeoutMs: QUERY_TIMEOUT_MS,
    queueTimeoutMs: QUEUE_TIMEOUT_MS,
    zombieDetectCount: _zombieDetectCount,
    zombieKillCount: _zombieKillCount,
    activeOps,
  };
}
