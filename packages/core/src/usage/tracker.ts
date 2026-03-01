/**
 * Usage Tracker — in-memory buffer that accumulates API usage events
 * and periodically flushes them to the read model tables.
 *
 * Design goals:
 *  - Zero latency on POS hot paths (synchronous Map write)
 *  - Vercel-compatible (each instance flushes independently, ON CONFLICT sums)
 *  - At most 30s of data loss on instance recycle (acceptable for analytics)
 */
import { db, guardedQuery } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────

export interface UsageEvent {
  tenantId: string;
  userId: string;
  moduleKey: string;
  workflowKey: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

interface BucketData {
  requestCount: number;
  writeCount: number;
  readCount: number;
  errorCount: number;
  uniqueUsers: Set<string>;
  totalDurationMs: number;
  maxDurationMs: number;
  workflows: Map<string, { requestCount: number; errorCount: number; uniqueUsers: Set<string> }>;
}

// ── Buffer ───────────────────────────────────────────────────

/** Active buffer keyed by `tenantId:moduleKey:hourBucket` */
let buffer = new Map<string, BucketData>();

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER_SIZE = 5_000;
const MAX_UNIQUE_USERS_PER_BUCKET = 500;
const MAX_WORKFLOWS_PER_BUCKET = 200;

function getHourBucket(ts: number): string {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function getDateBucket(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isWriteMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isError(statusCode: number): boolean {
  return statusCode >= 400;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Record a usage event. Synchronous — sub-microsecond.
 * Called fire-and-forget from withMiddleware.
 *
 * IMPORTANT: This function is PURE IN-MEMORY. No DB access, no timers.
 * Flushing to DB happens via `forceFlush()` called from the drain-outbox
 * cron (every minute). The setInterval timer was removed because it caused
 * zombie DB connections on Vercel — timer callbacks fire after the HTTP
 * response, Vercel freezes the event loop, and in-flight DB queries become
 * stuck connections that exhaust the pool (2026-03-01 outage).
 */
export function recordUsage(event: UsageEvent): void {
  if (!event.tenantId || !event.moduleKey) return;

  const hourBucket = getHourBucket(event.timestamp);
  const key = `${event.tenantId}|${event.moduleKey}|${hourBucket}`;

  let bucket = buffer.get(key);
  if (!bucket) {
    bucket = {
      requestCount: 0,
      writeCount: 0,
      readCount: 0,
      errorCount: 0,
      uniqueUsers: new Set(),
      totalDurationMs: 0,
      maxDurationMs: 0,
      workflows: new Map(),
    };
    buffer.set(key, bucket);
  }

  bucket.requestCount++;
  if (isWriteMethod(event.method)) {
    bucket.writeCount++;
  } else {
    bucket.readCount++;
  }
  if (isError(event.statusCode)) {
    bucket.errorCount++;
  }
  if (bucket.uniqueUsers.size < MAX_UNIQUE_USERS_PER_BUCKET) {
    bucket.uniqueUsers.add(event.userId);
  }
  bucket.totalDurationMs += event.durationMs;
  bucket.maxDurationMs = Math.max(bucket.maxDurationMs, event.durationMs);

  // Workflow sub-bucket
  if (event.workflowKey) {
    let wf = bucket.workflows.get(event.workflowKey);
    if (!wf) {
      if (bucket.workflows.size >= MAX_WORKFLOWS_PER_BUCKET) {
        // Skip tracking new workflows once cap is hit — existing ones still increment
      } else {
        wf = { requestCount: 0, errorCount: 0, uniqueUsers: new Set() };
        bucket.workflows.set(event.workflowKey, wf);
      }
    }
    if (wf) {
      wf.requestCount++;
      if (isError(event.statusCode)) wf.errorCount++;
      if (wf.uniqueUsers.size < MAX_UNIQUE_USERS_PER_BUCKET) {
        wf.uniqueUsers.add(event.userId);
      }
    }
  }

  // Overflow guard: discard oldest entries instead of fire-and-forget DB flush.
  // On Vercel, fire-and-forget flushBuffer() can start db.transaction() which
  // gets frozen by event loop freeze, causing zombie connections (§205 Rule 1).
  if (buffer.size > MAX_BUFFER_SIZE) {
    const keysIter = buffer.keys();
    const toEvict = buffer.size - MAX_BUFFER_SIZE;
    for (let i = 0; i < toEvict; i++) {
      const { value, done } = keysIter.next();
      if (done) break;
      buffer.delete(value);
    }
  }
}

// ── Flush Logic ──────────────────────────────────────────────

/** Once set to true, flush stops retrying — tables don't exist yet. */
let _tablesChecked = false;
let _tablesExist = false;

async function checkTablesExist(): Promise<boolean> {
  if (_tablesChecked) return _tablesExist;
  try {
    // 5s timeout: if DB pool is exhausted, fail fast instead of hanging
    // guardedQuery provides its own timeout (15s), but we also keep the 5s race
    // for this specific check since table existence is critical for startup.
    const result = await Promise.race([
      guardedQuery('usage:checkTables', () =>
        db.execute(sql`
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'rm_usage_hourly' LIMIT 1
        `),
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('checkTablesExist timed out')), 5_000),
      ),
    ]);
    _tablesExist = Array.from(result as Iterable<unknown>).length > 0;
  } catch {
    _tablesExist = false;
  }
  _tablesChecked = true;
  if (!_tablesExist) {
    // Stop the timer — no point retrying every 30s if tables don't exist
    stopFlushTimer();
  }
  return _tablesExist;
}

/**
 * Atomic swap: take ownership of the current buffer and
 * replace it with an empty one so new events accumulate fresh.
 */
async function flushBuffer(): Promise<void> {
  if (buffer.size === 0) return;

  // Skip flush entirely if usage tables haven't been created yet
  if (!(await checkTablesExist())) {
    buffer.clear(); // Discard — no point growing the buffer forever
    return;
  }

  const snapshot = buffer;
  buffer = new Map();

  try {
    await flushToDb(snapshot);
  } catch (err) {
    // Safe to re-merge: flushToDb uses a transaction, so on failure
    // nothing was committed — no double-counting risk.
    for (const [key, data] of snapshot) {
      const existing = buffer.get(key);
      if (existing) {
        existing.requestCount += data.requestCount;
        existing.writeCount += data.writeCount;
        existing.readCount += data.readCount;
        existing.errorCount += data.errorCount;
        for (const u of data.uniqueUsers) existing.uniqueUsers.add(u);
        existing.totalDurationMs += data.totalDurationMs;
        existing.maxDurationMs = Math.max(existing.maxDurationMs, data.maxDurationMs);
        for (const [wk, wd] of data.workflows) {
          const ew = existing.workflows.get(wk);
          if (ew) {
            ew.requestCount += wd.requestCount;
            ew.errorCount += wd.errorCount;
            for (const u of wd.uniqueUsers) ew.uniqueUsers.add(u);
          } else {
            existing.workflows.set(wk, wd);
          }
        }
      } else {
        buffer.set(key, data);
      }
    }
    console.error('[UsageTracker] flush failed, re-merged into buffer:', err);
  }
}

async function flushToDb(snapshot: Map<string, BucketData>): Promise<void> {
  // Pre-aggregate all data in memory before touching DB
  const hourlyRows: Array<{
    tenantId: string; moduleKey: string; hourBucket: string;
    requestCount: number; writeCount: number; readCount: number;
    errorCount: number; uniqueUsers: number; totalDurationMs: number; maxDurationMs: number;
  }> = [];

  const dailyMap = new Map<
    string,
    {
      tenantId: string; moduleKey: string; usageDate: string;
      requestCount: number; writeCount: number; readCount: number;
      errorCount: number; uniqueUsers: number; totalDurationMs: number; maxDurationMs: number;
    }
  >();

  const workflowDailyMap = new Map<
    string,
    {
      tenantId: string; moduleKey: string; workflowKey: string; usageDate: string;
      requestCount: number; errorCount: number; uniqueUsers: number;
    }
  >();

  const adoptionMap = new Map<
    string,
    {
      tenantId: string; moduleKey: string; requests: number;
      users: Set<string>; timestamp: number; dates: Set<string>;
    }
  >();

  for (const [key, data] of snapshot) {
    const [tenantId, moduleKey, hourBucket] = key.split('|');
    if (!tenantId || !moduleKey || !hourBucket) continue;

    const usageDate = getDateBucket(new Date(hourBucket).getTime());
    const uniqueUserCount = data.uniqueUsers.size;

    // Collect hourly row
    hourlyRows.push({
      tenantId, moduleKey, hourBucket,
      requestCount: data.requestCount, writeCount: data.writeCount,
      readCount: data.readCount, errorCount: data.errorCount,
      uniqueUsers: uniqueUserCount, totalDurationMs: data.totalDurationMs,
      maxDurationMs: data.maxDurationMs,
    });

    // Accumulate daily
    const dailyKey = `${tenantId}:${moduleKey}:${usageDate}`;
    const daily = dailyMap.get(dailyKey);
    if (daily) {
      daily.requestCount += data.requestCount;
      daily.writeCount += data.writeCount;
      daily.readCount += data.readCount;
      daily.errorCount += data.errorCount;
      daily.uniqueUsers = Math.max(daily.uniqueUsers, uniqueUserCount);
      daily.totalDurationMs += data.totalDurationMs;
      daily.maxDurationMs = Math.max(daily.maxDurationMs, data.maxDurationMs);
    } else {
      dailyMap.set(dailyKey, {
        tenantId, moduleKey, usageDate,
        requestCount: data.requestCount, writeCount: data.writeCount,
        readCount: data.readCount, errorCount: data.errorCount,
        uniqueUsers: uniqueUserCount, totalDurationMs: data.totalDurationMs,
        maxDurationMs: data.maxDurationMs,
      });
    }

    // Accumulate workflow daily
    for (const [wk, wd] of data.workflows) {
      const wdKey = `${tenantId}:${moduleKey}:${wk}:${usageDate}`;
      const existing = workflowDailyMap.get(wdKey);
      if (existing) {
        existing.requestCount += wd.requestCount;
        existing.errorCount += wd.errorCount;
        existing.uniqueUsers = Math.max(existing.uniqueUsers, wd.uniqueUsers.size);
      } else {
        workflowDailyMap.set(wdKey, {
          tenantId, moduleKey, workflowKey: wk, usageDate,
          requestCount: wd.requestCount, errorCount: wd.errorCount,
          uniqueUsers: wd.uniqueUsers.size,
        });
      }
    }

    // Adoption accumulator — track distinct dates for active_days fix
    const adoptionKey = `${tenantId}:${moduleKey}`;
    const adopt = adoptionMap.get(adoptionKey);
    if (adopt) {
      adopt.requests += data.requestCount;
      if (adopt.users.size < MAX_UNIQUE_USERS_PER_BUCKET) {
        for (const u of data.uniqueUsers) {
          if (adopt.users.size >= MAX_UNIQUE_USERS_PER_BUCKET) break;
          adopt.users.add(u);
        }
      }
      adopt.timestamp = Math.max(adopt.timestamp, new Date(hourBucket).getTime());
      adopt.dates.add(usageDate);
    } else {
      adoptionMap.set(adoptionKey, {
        tenantId, moduleKey,
        requests: data.requestCount,
        users: new Set(data.uniqueUsers),
        timestamp: new Date(hourBucket).getTime(),
        dates: new Set([usageDate]),
      });
    }
  }

  // ── Batch upsert all tables in a single Drizzle transaction ──
  // IMPORTANT: Never use manual BEGIN/COMMIT via db.execute() — with
  // postgres.js connection pooling, each db.execute() can go to a
  // different connection, leaving connections stuck in open transactions.
  // db.transaction() properly holds a single connection for the duration.
  // Safety: SET LOCAL statement_timeout prevents this transaction from holding
  // a connection indefinitely if Vercel freezes the event loop (§205).
  // Wrapped in guardedQuery for concurrency limiting + circuit breaker.
  await guardedQuery('usage:flush', () => db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
    // ── Hourly: batch in chunks of 50 ─────────────────────────
    for (let i = 0; i < hourlyRows.length; i += 50) {
      const chunk = hourlyRows.slice(i, i + 50);
      const values = chunk.map(
        (r) =>
          sql`(${generateId()}, ${r.tenantId}, ${r.moduleKey}, ${r.hourBucket}::timestamptz,
               ${r.requestCount}, ${r.writeCount}, ${r.readCount}, ${r.errorCount},
               ${r.uniqueUsers}, ${r.totalDurationMs}, ${r.maxDurationMs}, NOW())`,
      );
      await tx.execute(sql`
        INSERT INTO rm_usage_hourly (id, tenant_id, module_key, hour_bucket,
          request_count, write_count, read_count, error_count, unique_users,
          total_duration_ms, max_duration_ms, updated_at)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (tenant_id, module_key, hour_bucket) DO UPDATE SET
          request_count = rm_usage_hourly.request_count + EXCLUDED.request_count,
          write_count = rm_usage_hourly.write_count + EXCLUDED.write_count,
          read_count = rm_usage_hourly.read_count + EXCLUDED.read_count,
          error_count = rm_usage_hourly.error_count + EXCLUDED.error_count,
          unique_users = GREATEST(rm_usage_hourly.unique_users, EXCLUDED.unique_users),
          total_duration_ms = rm_usage_hourly.total_duration_ms + EXCLUDED.total_duration_ms,
          max_duration_ms = GREATEST(rm_usage_hourly.max_duration_ms, EXCLUDED.max_duration_ms),
          updated_at = NOW()
      `);
    }

    // ── Daily: batch upsert ─────────────────────────────────────
    const dailyRows = Array.from(dailyMap.values());
    for (let i = 0; i < dailyRows.length; i += 50) {
      const chunk = dailyRows.slice(i, i + 50);
      const values = chunk.map((d) => {
        const avgDuration = d.requestCount > 0 ? (d.totalDurationMs / d.requestCount).toFixed(2) : '0';
        return sql`(${generateId()}, ${d.tenantId}, ${d.moduleKey}, ${d.usageDate}::date,
                    ${d.requestCount}, ${d.writeCount}, ${d.readCount}, ${d.errorCount},
                    ${d.uniqueUsers}, ${d.totalDurationMs}, ${d.maxDurationMs}, ${avgDuration}::numeric, NOW())`;
      });
      await tx.execute(sql`
        INSERT INTO rm_usage_daily (id, tenant_id, module_key, usage_date,
          request_count, write_count, read_count, error_count, unique_users,
          total_duration_ms, max_duration_ms, avg_duration_ms, updated_at)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (tenant_id, module_key, usage_date) DO UPDATE SET
          request_count = rm_usage_daily.request_count + EXCLUDED.request_count,
          write_count = rm_usage_daily.write_count + EXCLUDED.write_count,
          read_count = rm_usage_daily.read_count + EXCLUDED.read_count,
          error_count = rm_usage_daily.error_count + EXCLUDED.error_count,
          unique_users = GREATEST(rm_usage_daily.unique_users, EXCLUDED.unique_users),
          total_duration_ms = rm_usage_daily.total_duration_ms + EXCLUDED.total_duration_ms,
          max_duration_ms = GREATEST(rm_usage_daily.max_duration_ms, EXCLUDED.max_duration_ms),
          avg_duration_ms = CASE
            WHEN (rm_usage_daily.request_count + EXCLUDED.request_count) > 0
            THEN ((rm_usage_daily.total_duration_ms + EXCLUDED.total_duration_ms)::numeric /
                  (rm_usage_daily.request_count + EXCLUDED.request_count))
            ELSE 0
          END,
          updated_at = NOW()
      `);
    }

    // ── Workflow daily: batch upsert ────────────────────────────
    const wfRows = Array.from(workflowDailyMap.values());
    for (let i = 0; i < wfRows.length; i += 50) {
      const chunk = wfRows.slice(i, i + 50);
      const values = chunk.map(
        (w) =>
          sql`(${generateId()}, ${w.tenantId}, ${w.moduleKey}, ${w.workflowKey}, ${w.usageDate}::date,
               ${w.requestCount}, ${w.errorCount}, ${w.uniqueUsers}, NOW())`,
      );
      await tx.execute(sql`
        INSERT INTO rm_usage_workflow_daily (id, tenant_id, module_key, workflow_key, usage_date,
          request_count, error_count, unique_users, updated_at)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (tenant_id, module_key, workflow_key, usage_date) DO UPDATE SET
          request_count = rm_usage_workflow_daily.request_count + EXCLUDED.request_count,
          error_count = rm_usage_workflow_daily.error_count + EXCLUDED.error_count,
          unique_users = GREATEST(rm_usage_workflow_daily.unique_users, EXCLUDED.unique_users),
          updated_at = NOW()
      `);
    }

    // ── Adoption: batch upsert with date-aware active_days ──────
    const adoptRows = Array.from(adoptionMap.values());
    for (let i = 0; i < adoptRows.length; i += 50) {
      const chunk = adoptRows.slice(i, i + 50);
      const values = chunk.map((a) => {
        const now = new Date(a.timestamp).toISOString();
        return sql`(${generateId()}, ${a.tenantId}, ${a.moduleKey},
                    ${now}::timestamptz, ${now}::timestamptz, ${a.requests}, ${a.users.size},
                    ${a.dates.size}, true, NOW())`;
      });
      await tx.execute(sql`
        INSERT INTO rm_usage_module_adoption (id, tenant_id, module_key,
          first_used_at, last_used_at, total_requests, total_unique_users, active_days, is_active, updated_at)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (tenant_id, module_key) DO UPDATE SET
          last_used_at = GREATEST(rm_usage_module_adoption.last_used_at, EXCLUDED.last_used_at),
          total_requests = rm_usage_module_adoption.total_requests + EXCLUDED.total_requests,
          total_unique_users = GREATEST(rm_usage_module_adoption.total_unique_users, EXCLUDED.total_unique_users),
          active_days = rm_usage_module_adoption.active_days + CASE
            WHEN date_trunc('day', rm_usage_module_adoption.last_used_at) < date_trunc('day', EXCLUDED.last_used_at)
            THEN EXCLUDED.active_days
            ELSE 0
          END,
          is_active = true,
          updated_at = NOW()
      `);
    }
  }));
}

// ── ID Generation ────────────────────────────────────────────

function generateId(): string {
  return generateUlid();
}

// ── Timer Setup ──────────────────────────────────────────────
// DEPRECATED: The setInterval timer was the root cause of the 2026-03-01
// production outage. Timer callbacks fire DB queries after Vercel sends
// the HTTP response. When Vercel freezes the event loop, those DB queries
// become zombie connections stuck in idle/ClientRead until statement_timeout
// (30s). With max:2 pool, 2-3 zombies = total pool exhaustion.
//
// Flushing now happens via `forceFlush()` called from the drain-outbox cron
// (every minute), which is request-scoped — DB operations complete BEFORE
// the response is sent. This is safe on Vercel.
//
// startFlushTimer/stopFlushTimer are retained for backward compat but
// should NOT be called on Vercel serverless.

let _flushTimer: ReturnType<typeof setInterval> | null = null;
/** Guard against concurrent flush */
let _flushing = false;

/**
 * @deprecated Do NOT use on Vercel serverless. Use forceFlush() from a
 * request-scoped context (e.g., drain-outbox cron) instead.
 */
export function startFlushTimer(): void {
  if (_flushTimer) return;
  console.warn('[UsageTracker] startFlushTimer() called — this is deprecated on Vercel serverless');
  _flushTimer = setInterval(async () => {
    if (_flushing) return;
    _flushing = true;
    try {
      await flushBuffer();
    } catch (err) {
      console.error('[UsageTracker] timer flush failed:', err instanceof Error ? err.message : err);
    } finally {
      _flushing = false;
    }
  }, FLUSH_INTERVAL_MS);
  if (_flushTimer && typeof _flushTimer === 'object' && 'unref' in _flushTimer) {
    _flushTimer.unref();
  }
}

export function stopFlushTimer(): void {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
}

/**
 * Flush the in-memory usage buffer to the database.
 * Called from drain-outbox cron (every minute) in a request-scoped context.
 * Safe on Vercel because the DB transaction completes before the HTTP response.
 */
export async function forceFlush(): Promise<void> {
  if (_flushing) return; // Prevent concurrent flush
  _flushing = true;
  try {
    await flushBuffer();
  } finally {
    _flushing = false;
  }
}
