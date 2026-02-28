/**
 * Replay protection via nonce + timestamp validation.
 * Prevents replay attacks on high-risk mutation endpoints.
 *
 * Client sends two headers on every mutation (POST/PUT/PATCH/DELETE):
 *   X-Request-Nonce:     crypto.randomUUID()  — unique per request
 *   X-Request-Timestamp: Date.now()           — millisecond epoch
 *
 * Server validates: timestamp within ±300s, nonce not previously seen (10-min TTL).
 *
 * Stage 1: single-instance (Vercel functions). Upgrade to Redis when Stage 2
 * via setReplayGuardStore().
 */

// ── Interfaces ──────────────────────────────────────────────────

interface ReplayGuardResult {
  allowed: boolean;
  reason?: 'NONCE_REUSED' | 'TIMESTAMP_EXPIRED' | 'MISSING_HEADERS';
}

/**
 * Pluggable replay guard store interface.
 * Default: in-memory Map. Swap to Redis in Stage 2 via setReplayGuardStore().
 */
export interface ReplayGuardStore {
  checkAndRecord(nonce: string, timestampMs: number): ReplayGuardResult;
}

// ── Configuration ───────────────────────────────────────────────

/** Maximum age of a request timestamp (±300 seconds = 5 minutes). */
const TIMESTAMP_WINDOW_MS = 300_000;

/** How long nonces are retained to detect replays (10 minutes). */
const NONCE_TTL_MS = 10 * 60 * 1000;

/** Maximum stored nonces before LRU eviction. */
const MAX_NONCES = 50_000;

// ── In-Memory Replay Guard Store ────────────────────────────────

class InMemoryReplayGuardStore implements ReplayGuardStore {
  /** Map<nonce, expiresAt> — insertion order = age order for LRU eviction. */
  private store = new Map<string, number>();

  checkAndRecord(nonce: string, timestampMs: number): ReplayGuardResult {
    const now = Date.now();

    // 1. Validate timestamp is within the allowed window
    const drift = Math.abs(now - timestampMs);
    if (drift > TIMESTAMP_WINDOW_MS) {
      return { allowed: false, reason: 'TIMESTAMP_EXPIRED' };
    }

    // 2. Prune expired nonces (lazy, capped at 100 per call to limit CPU)
    this.pruneExpired(now);

    // 3. Check for nonce reuse
    if (this.store.has(nonce)) {
      return { allowed: false, reason: 'NONCE_REUSED' };
    }

    // 4. Record the nonce
    this.store.set(nonce, now + NONCE_TTL_MS);

    // 5. Evict oldest 20% if over capacity
    if (this.store.size > MAX_NONCES) {
      const evictCount = Math.floor(this.store.size * 0.2);
      const keysIter = this.store.keys();
      for (let i = 0; i < evictCount; i++) {
        const { value, done } = keysIter.next();
        if (done) break;
        this.store.delete(value);
      }
    }

    return { allowed: true };
  }

  private pruneExpired(now: number): void {
    let pruned = 0;
    for (const [nonce, expiresAt] of this.store) {
      if (expiresAt <= now) {
        this.store.delete(nonce);
        pruned++;
        if (pruned >= 100) break;
      } else {
        // Map is insertion-ordered — once we hit a non-expired entry,
        // all subsequent entries are newer (within the same TTL window).
        break;
      }
    }
  }
}

// ── Store Singleton ─────────────────────────────────────────────

let _replayGuardStore: ReplayGuardStore = new InMemoryReplayGuardStore();

/** Replace the default in-memory store with a custom implementation (e.g. Redis). */
export function setReplayGuardStore(store: ReplayGuardStore): void {
  _replayGuardStore = store;
}

export function getReplayGuardStore(): ReplayGuardStore {
  return _replayGuardStore;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Check replay protection headers on a request.
 * Returns `{ allowed: true }` or `{ allowed: false, reason }`.
 *
 * Missing headers on mutation requests are treated as a failure —
 * old clients that don't send headers will be rejected when
 * `replayGuard: true` is set on a route.
 */
export function checkReplayGuard(request: Request): ReplayGuardResult {
  const nonce = request.headers.get('x-request-nonce');
  const timestampStr = request.headers.get('x-request-timestamp');

  if (!nonce || !timestampStr) {
    return { allowed: false, reason: 'MISSING_HEADERS' };
  }

  const timestampMs = Number(timestampStr);
  if (Number.isNaN(timestampMs)) {
    return { allowed: false, reason: 'TIMESTAMP_EXPIRED' };
  }

  return _replayGuardStore.checkAndRecord(nonce, timestampMs);
}
