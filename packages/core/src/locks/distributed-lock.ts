import { db, sql } from '@oppsera/db';
import { guardedQuery } from '@oppsera/db/pool-guard';

// ── Types ────────────────────────────────────────────────────────────

export interface LockResult {
  acquired: boolean;
  lockKey: string;
  holderId: string;
}

export interface LockMetadata {
  trigger?: string;
  businessDate?: string;
  [key: string]: unknown;
}

// ── Core Lock Operations ────────────────────────────────────────────

/**
 * Attempt to acquire a distributed lock.
 *
 * Uses INSERT ON CONFLICT with stale takeover — if the lock row already
 * exists, the insert succeeds ONLY if `expires_at < NOW()` (stale lock).
 * Empty RETURNING = lock held by someone else. Row returned = acquired.
 *
 * All DB calls are awaited (never fire-and-forget) per gotcha #466.
 */
export async function tryAcquireLock(
  lockKey: string,
  holderId: string,
  ttlMs: number,
  metadata: LockMetadata = {},
): Promise<LockResult> {
  const result = await guardedQuery('tryAcquireLock', () =>
    db.execute(sql`
      INSERT INTO distributed_locks (lock_key, holder_id, expires_at, metadata)
      VALUES (
        ${lockKey},
        ${holderId},
        NOW() + (${ttlMs} || ' milliseconds')::interval,
        ${JSON.stringify(metadata)}::jsonb
      )
      ON CONFLICT (lock_key)
      DO UPDATE SET
        holder_id = EXCLUDED.holder_id,
        acquired_at = NOW(),
        expires_at = EXCLUDED.expires_at,
        metadata = EXCLUDED.metadata
      WHERE distributed_locks.expires_at < NOW()
      RETURNING lock_key
    `),
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  return {
    acquired: rows.length > 0,
    lockKey,
    holderId,
  };
}

/**
 * Renew an existing lock's TTL. Only succeeds if the caller is the current holder.
 */
export async function renewLock(
  lockKey: string,
  holderId: string,
  ttlMs: number,
): Promise<boolean> {
  const result = await guardedQuery('renewLock', () =>
    db.execute(sql`
      UPDATE distributed_locks
      SET expires_at = NOW() + (${ttlMs} || ' milliseconds')::interval
      WHERE lock_key = ${lockKey}
        AND holder_id = ${holderId}
      RETURNING lock_key
    `),
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  return rows.length > 0;
}

/**
 * Release a lock. Only deletes if the caller is the current holder.
 */
export async function releaseLock(
  lockKey: string,
  holderId: string,
): Promise<boolean> {
  const result = await guardedQuery('releaseLock', () =>
    db.execute(sql`
      DELETE FROM distributed_locks
      WHERE lock_key = ${lockKey}
        AND holder_id = ${holderId}
      RETURNING lock_key
    `),
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  return rows.length > 0;
}

/**
 * Delete all locks whose `expires_at` is in the past.
 * Returns the number of expired locks removed.
 */
export async function cleanExpiredLocks(): Promise<number> {
  const result = await guardedQuery('cleanExpiredLocks', () =>
    db.execute(sql`
      DELETE FROM distributed_locks
      WHERE expires_at < NOW()
    `),
  ) as unknown as { count: number };

  return result.count ?? 0;
}

// ── Convenience Wrapper ─────────────────────────────────────────────

/**
 * Generate a unique holder ID for the current process.
 * Combines a random prefix with the current timestamp for uniqueness
 * across Vercel instances (there is no stable PID on serverless).
 */
function generateHolderId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `vercel-${rand}-${Date.now()}`;
}

/**
 * Execute `fn` while holding a distributed lock.
 *
 * - If the lock is already held by another process, returns `null` immediately.
 * - If acquired, runs `fn()` and releases the lock in a `finally` block.
 * - The lock is NOT renewed during execution — set `ttlMs` generously.
 *
 * @returns The result of `fn()`, or `null` if the lock was not acquired.
 */
export async function withDistributedLock<T>(
  lockKey: string,
  ttlMs: number,
  fn: () => Promise<T>,
  metadata: LockMetadata = {},
): Promise<T | null> {
  const holderId = generateHolderId();

  const lock = await tryAcquireLock(lockKey, holderId, ttlMs, metadata);
  if (!lock.acquired) {
    return null;
  }

  try {
    return await fn();
  } finally {
    try {
      await releaseLock(lockKey, holderId);
    } catch (releaseErr) {
      // Release failure is non-fatal — the TTL will expire naturally.
      // Log but never throw from finally (masks the original error).
      console.warn(`[distributed-lock] Failed to release lock '${lockKey}':`, releaseErr);
    }
  }
}
