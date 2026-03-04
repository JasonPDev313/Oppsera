import { NextResponse } from 'next/server';
import { db, sql } from '@oppsera/db';
import { getOutboxWorker } from '@oppsera/core/events';
import { cleanExpiredLocks } from '@oppsera/core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Vercel Cron safety net for the outbox worker.
 *
 * The in-process outbox worker (started via instrumentation.ts) handles
 * events in real-time. This cron endpoint is a FALLBACK that runs every
 * minute to catch events if:
 * - The in-process worker crashed or was frozen by Vercel
 * - A cold start left the worker in a broken state
 * - Events were orphaned (claimed but never published)
 *
 * Also recovers stale claims: events with published_at set >5 minutes ago
 * that were never actually processed (worker crashed after claiming).
 */
export async function GET(request: Request) {
  // Verify this is called by Vercel Cron (not an external attacker)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    // 1. Recover stale claims — events claimed >5 min ago but never consumed.
    // This happens when a Vercel instance claims events then gets frozen/killed.
    const staleRecovered = await db.execute(sql`
      UPDATE event_outbox
      SET published_at = NULL
      WHERE published_at IS NOT NULL
        AND published_at < NOW() - INTERVAL '5 minutes'
        AND id NOT IN (
          SELECT DISTINCT event_id FROM processed_events WHERE event_id IS NOT NULL
        )
    `) as unknown as { count: number };
    results.staleRecovered = staleRecovered.count ?? 0;

    // 2. Check pending event count
    const pending = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM event_outbox WHERE published_at IS NULL
    `) as unknown as Array<{ cnt: string }>;
    results.pendingCount = Number(pending[0]?.cnt ?? 0);

    // 3. Process a batch if there are pending events
    const pendingCount = results.pendingCount as number;
    if (pendingCount > 0) {
      const worker = getOutboxWorker();
      const published = await worker.processBatch();
      results.publishedCount = published;
    } else {
      results.publishedCount = 0;
    }

    // 4. Check for idle-in-transaction connections (early warning)
    const stuck = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'idle in transaction'
        AND now() - state_change > INTERVAL '60 seconds'
        AND pid != pg_backend_pid()
    `) as unknown as Array<{ cnt: string }>;
    results.stuckTransactions = Number(stuck[0]?.cnt ?? 0);

    const stuckTxCount = results.stuckTransactions as number;
    if (stuckTxCount > 0) {
      console.error(`[drain-outbox] WARNING: ${stuckTxCount} connections stuck in idle-in-transaction >60s`);
    }

    // 5. Kill zombie idle+ClientRead connections (Vercel freeze survivors).
    // When Vercel freezes the event loop after sending an HTTP response, in-flight
    // DB operations (e.g., COMMIT) complete on Postgres but the client never reads
    // the response. The connection sits in "idle" state with wait_event=ClientRead
    // indefinitely. Neither statement_timeout nor idle_in_transaction_session_timeout
    // catch this — only external monitoring can detect and kill these zombies.
    // Threshold: 60s (normal idle_timeout is 10s, so 60s is clearly a zombie).
    const zombies = await db.execute(sql`
      SELECT pid,
             EXTRACT(EPOCH FROM (NOW() - state_change))::int AS idle_seconds,
             LEFT(query, 150) AS query_prefix
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND state = 'idle'
        AND wait_event_type = 'Client'
        AND wait_event = 'ClientRead'
        AND NOW() - state_change > INTERVAL '60 seconds'
        AND query NOT ILIKE '%LISTEN%'
        AND query NOT ILIKE '%archive_mode%'
        AND query NOT ILIKE '%get_auth%'
    `) as unknown as Array<{ pid: number; idle_seconds: number; query_prefix: string }>;
    const zombieArr = Array.from(zombies as Iterable<{ pid: number; idle_seconds: number; query_prefix: string }>);

    results.zombieConnectionsFound = zombieArr.length;
    results.zombieConnectionsKilled = 0;

    if (zombieArr.length > 0) {
      for (const z of zombieArr) {
        try {
          await db.execute(sql`SELECT pg_terminate_backend(${z.pid})`);
          (results.zombieConnectionsKilled as number)++;
          console.warn(JSON.stringify({
            level: 'warn',
            event: 'zombie_connection_killed',
            pid: z.pid,
            idle_seconds: z.idle_seconds,
            query_prefix: z.query_prefix,
            source: 'drain-outbox-cron',
          }));
        } catch (killErr) {
          console.error(`[drain-outbox] Failed to kill zombie PID ${z.pid}:`, killErr);
        }
      }
    }

    // 6. Clean expired distributed locks (housekeeping)
    try {
      const expiredLocks = await cleanExpiredLocks();
      results.expiredLocksRemoved = expiredLocks;
    } catch (lockErr) {
      // Non-fatal — log but don't fail the drain-outbox cron
      console.warn('[drain-outbox] Failed to clean expired locks:', lockErr);
      results.expiredLocksRemoved = -1;
    }

    // 7. Clean expired processed_events rows (>90 days) to prevent unbounded table growth.
    // Bounded to 5000 rows per run to keep the delete fast and avoid long locks.
    try {
      const cleaned = await db.execute(sql`
        DELETE FROM processed_events WHERE id IN (
          SELECT id FROM processed_events
          WHERE processed_at < NOW() - INTERVAL '90 days'
          LIMIT 5000
        )
      `) as unknown as { count: number };
      results.processedEventsCleaned = cleaned.count ?? 0;
    } catch (cleanErr) {
      console.warn('[drain-outbox] processed_events cleanup failed:', cleanErr);
      results.processedEventsCleaned = -1;
    }

    // 8. Clean published event_outbox rows older than 7 days.
    // Published events have been consumed — no need to keep them beyond recovery window.
    try {
      const outboxCleaned = await db.execute(sql`
        DELETE FROM event_outbox WHERE id IN (
          SELECT id FROM event_outbox
          WHERE published_at IS NOT NULL
            AND published_at < NOW() - INTERVAL '7 days'
          LIMIT 5000
        )
      `) as unknown as { count: number };
      results.outboxEventsCleaned = outboxCleaned.count ?? 0;
    } catch (outboxErr) {
      console.warn('[drain-outbox] event_outbox cleanup failed:', outboxErr);
      results.outboxEventsCleaned = -1;
    }

    // 9. Auto-create audit_log partitions for the next 3 months.
    // Prevents insert failures when the current partition range is exhausted.
    // Idempotent: skips creation if the partition already exists.
    try {
      await db.execute(sql`
        DO $$
        DECLARE
          m DATE;
          part_name TEXT;
        BEGIN
          FOR i IN 0..2 LOOP
            m := date_trunc('month', NOW()) + (i || ' months')::interval;
            part_name := 'audit_log_' || to_char(m, 'YYYY_MM');
            IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
              EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
                part_name,
                m,
                m + '1 month'::interval
              );
              RAISE NOTICE 'Created audit_log partition: %', part_name;
            END IF;
          END LOOP;
        END $$
      `);
      results.auditPartitionsChecked = true;
    } catch (partErr) {
      console.warn('[drain-outbox] audit_log partition check failed:', partErr);
      results.auditPartitionsChecked = false;
    }

    // 10. Flush usage tracking buffer to DB.
    // The usage tracker accumulates events in-memory. Flushing here is safe because
    // the DB transaction completes BEFORE the response is sent (no fire-and-forget).
    try {
      const { forceFlush } = await import('@oppsera/core/usage/tracker');
      await forceFlush();
      results.usageBufferFlushed = true;
    } catch (flushErr) {
      // Non-fatal — usage data will accumulate and flush next cron cycle
      console.warn('[drain-outbox] Usage buffer flush failed:', flushErr);
      results.usageBufferFlushed = false;
    }

    return NextResponse.json({
      status: 'ok',
      ...results,
    });
  } catch (error) {
    console.error('[drain-outbox] Cron error:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
