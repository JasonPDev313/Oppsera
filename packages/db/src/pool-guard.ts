/**
 * Pool Guard — DB concurrency limiter + circuit breaker + pool exhaustion detection.
 *
 * Prevents pool exhaustion death spirals by:
 * 1. Limiting concurrent DB operations to pool size (turns spikes into queues)
 * 2. Tripping a circuit breaker on pool exhaustion errors (fail-fast for 10s)
 * 3. Detecting pool exhaustion across different error patterns
 * 4. Logging slow queries and queue depth warnings
 * 5. Auto-resetting stale connection pools after consecutive trips
 * 6. Dead man's switch: force-closing breaker after sustained failure
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
const BREAKER_MAX_COOLDOWN_MS = 60_000;
// After this many consecutive trips, reset the connection pool (stale connections).
const POOL_RESET_THRESHOLD = 3;
// After this many consecutive trips, force breaker closed (dead man's switch).
// Better to let some requests through and fail naturally than to stay dead forever.
const DEAD_MANS_SWITCH_THRESHOLD = 50;
// Failure window: require N failures within this window before tripping.
// A single ECONNRESET on Vercel unfreeze won't trip — it needs a second failure
// within 5s to confirm the DB is genuinely down vs. one stale socket.
const TRIP_FAILURE_THRESHOLD = 2;
const TRIP_FAILURE_WINDOW_MS = 5_000;
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

// ── Circuit breaker (with half-open probe + auto-recovery) ──────────────────
// States: CLOSED (normal) → OPEN (fail-fast) → HALF_OPEN (single probe) → CLOSED
// Half-open prevents thundering herd: after cooldown, only ONE request probes the DB.
// If it succeeds → CLOSED. If it fails → OPEN again with exponential backoff.
//
// Recovery hardening (prevents infinite open loops on frozen Vercel instances):
// - Exponential backoff: 10s → 20s → 40s → 60s cap (avoids rapid re-tripping)
// - After 3 consecutive trips: auto-reset connection pool (stale connections)
// - After 50 consecutive trips: dead man's switch forces breaker closed
let breakerOpenUntil = 0;
let breakerTripCount = 0;
let _consecutiveTrips = 0;
let _poolResetCount = 0;
let _deadMansSwitchCount = 0;
let _halfOpenProbeInFlight = false;

// Callback to reset the postgres.js connection pool. Registered by client.ts.
let _poolResetFn: (() => Promise<void>) | null = null;

/** Register a callback to destroy and recreate the connection pool.
 *  Called automatically after POOL_RESET_THRESHOLD consecutive breaker trips. */
export function registerPoolReset(fn: () => Promise<void>): void {
  _poolResetFn = fn;
}

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

export function tripBreaker(cooldownMs?: number): void {
  _consecutiveTrips++;

  // Dead man's switch — after sustained failure, force breaker closed.
  // Rationale: it's better to let requests through (they'll fail with real errors
  // that clients can retry) than to stay permanently dead with a generic message.
  if (_consecutiveTrips >= DEAD_MANS_SWITCH_THRESHOLD) {
    _deadMansSwitchCount++;
    console.error(
      `[pool-guard] DEAD MAN'S SWITCH: ${_consecutiveTrips} consecutive trips — ` +
        `forcing breaker CLOSED. Requests will attempt DB directly.`,
    );
    closeBreaker();
    _consecutiveTrips = 0;
    return;
  }

  // Auto pool reset — stale postgres.js connections on frozen Vercel instances
  // are the #1 cause of infinite breaker loops. Resetting the pool forces fresh
  // TCP connections on the next query.
  if (_consecutiveTrips === POOL_RESET_THRESHOLD && _poolResetFn) {
    _poolResetCount++;
    console.warn(
      `[pool-guard] ${_consecutiveTrips} consecutive trips — resetting connection pool`,
    );
    // Fire-and-forget is safe here: resetPool() just nulls the globalThis ref
    // and calls sql.end() with a 2s timeout. The next query creates a fresh pool.
    _poolResetFn().catch((err) => {
      console.error('[pool-guard] Pool reset failed:', (err as Error).message);
    });
  }

  // Exponential backoff: 10s → 20s → 40s → 60s cap
  // Prevents rapid re-tripping while still recovering within ~2 minutes.
  const backoffExponent = Math.min(_consecutiveTrips - 1, 3);
  const effectiveCooldown = cooldownMs ??
    Math.min(BREAKER_COOLDOWN_MS * Math.pow(2, backoffExponent), BREAKER_MAX_COOLDOWN_MS);

  breakerOpenUntil = Date.now() + effectiveCooldown;
  breakerTripCount++;
  _halfOpenProbeInFlight = false;
  console.error(
    `[pool-guard] Circuit breaker OPEN (trip #${breakerTripCount}, consecutive: ${_consecutiveTrips}). ` +
      `DB operations will fail fast for ${effectiveCooldown / 1000}s`,
  );
}

function closeBreaker(): void {
  breakerOpenUntil = 0;
  _consecutiveTrips = 0;
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

// ── Failure window ───────────────────────────────────────────────────────────
// Tracks recent pool exhaustion failures. The breaker only trips when N+ failures
// occur within a short window. A single ECONNRESET on Vercel unfreeze (stale socket)
// records a failure but doesn't trip — it needs a second failure to confirm the DB
// is genuinely down. This eliminates false trips from transient stale connections.
const _recentFailures: number[] = [];
let _failuresAbsorbed = 0;

function recordFailure(): void {
  _recentFailures.push(Date.now());
}

function shouldTrip(): boolean {
  const now = Date.now();
  // Prune failures outside the window
  while (_recentFailures.length > 0 && now - _recentFailures[0]! > TRIP_FAILURE_WINDOW_MS) {
    _recentFailures.shift();
  }
  if (_recentFailures.length >= TRIP_FAILURE_THRESHOLD) {
    // Clear the window — the trip consumes these failures
    _recentFailures.length = 0;
    return true;
  }
  _failuresAbsorbed++;
  return false;
}

// ── Stale connection detection ───────────────────────────────────────────────
// Connection-level errors that indicate a dead socket (Vercel freeze, Supavisor
// timeout). These are safe to retry because the query never reached Postgres —
// the TCP connection was already dead. Distinguished from "too many clients"
// (real exhaustion) and QUERY_TIMEOUT (query may have executed).
function isStaleConnection(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const msg = String((err as Error)?.message ?? '').toLowerCase();
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EPIPE' ||
    code === '57P01' || // admin_shutdown (DB restarted)
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('broken pipe') ||
    msg.includes('connection refused')
  );
}

let _silentRetryCount = 0;

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
 * - On stale connection error (ECONNRESET/EPIPE), retries once silently before
 *   recording a failure — catches dead sockets from Vercel freeze/unfreeze
 * - On pool exhaustion, records a failure; only trips breaker when 2+ failures
 *   occur within a 5s window (prevents single-error false trips)
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

  // Per-query timeout — shared across all attempts. Prevents a stuck query from
  // holding a pool connection forever. The timeout spans both the initial attempt
  // and the stale-connection retry (if any), so total wall time never exceeds limit.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(
        `[pool-guard] Query timeout: ${opName} exceeded ${QUERY_TIMEOUT_MS}ms`,
      );
      (err as { code?: string }).code = 'QUERY_TIMEOUT';
      console.error(err.message);
      reject(err);
    }, QUERY_TIMEOUT_MS);
  });

  try {
    // Stale connection retry: ECONNRESET/EPIPE mean the query never reached Postgres
    // (dead socket from Vercel freeze). Safe to retry once — postgres.js picks a
    // different connection. Prevents a single stale socket from tripping the breaker.
    // Probes don't retry — they're already a recovery mechanism.
    const maxAttempts = isProbe ? 1 : 2;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await Promise.race([fn(), timeoutPromise]);

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
        lastErr = err;
        // Only retry on stale connection errors (query never reached DB = safe to retry).
        // Don't retry QUERY_TIMEOUT (query may have executed) or "too many clients" (real
        // exhaustion where retrying just adds pressure).
        if (attempt < maxAttempts && isStaleConnection(err)) {
          _silentRetryCount++;
          console.warn(
            `[pool-guard] Stale connection in ${opName} — silent retry (attempt ${attempt + 1})`,
          );
          continue;
        }
        break;
      }
    }

    // All attempts exhausted — decide whether to trip the breaker
    const duration = Date.now() - start;
    if (isPoolExhaustion(lastErr)) {
      console.error(`[pool-guard] Pool exhaustion detected in ${opName} after ${duration}ms`);
      // Record failure into the sliding window. Only trip when 2+ failures land
      // within 5s — a single ECONNRESET that survived the retry isn't enough to
      // declare the DB down (could be two stale sockets cleaned up in sequence).
      recordFailure();
      if (shouldTrip()) {
        tripBreaker();
      }
    } else if (isProbe) {
      // Non-pool error during probe — still re-trip to be safe
      console.error(`[pool-guard] Half-open probe failed (${opName}, ${duration}ms) — breaker re-OPEN`);
      tripBreaker();
    }
    throw lastErr;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
    consecutiveTrips: _consecutiveTrips,
    silentRetryCount: _silentRetryCount,
    failuresAbsorbed: _failuresAbsorbed,
    poolResetCount: _poolResetCount,
    deadMansSwitchCount: _deadMansSwitchCount,
    concurrencyLimit: CONCURRENCY_LIMIT,
    maxQueueSize: MAX_QUEUE_SIZE,
    queryTimeoutMs: QUERY_TIMEOUT_MS,
    queueTimeoutMs: QUEUE_TIMEOUT_MS,
    zombieDetectCount: _zombieDetectCount,
    zombieKillCount: _zombieKillCount,
    activeOps,
  };
}
