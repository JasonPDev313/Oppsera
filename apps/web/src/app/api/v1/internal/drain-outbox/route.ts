import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { db, sql, recordZombieDetection, recordZombieKill } from '@oppsera/db';
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
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    // 1. Kill zombie connections FIRST — uses a fresh connection that bypasses
    // the shared pool. This is critical: if the shared pool is fully exhausted
    // by zombies, all subsequent steps would hang. A fresh TCP connection
    // ensures we can always reach Postgres to terminate zombie PIDs.
    try {
      const connectionString = process.env.DATABASE_URL;
      if (connectionString) {
        const freshConn = postgres(connectionString, {
          max: 1,
          prepare: false,
          connect_timeout: 5,
          idle_timeout: 1,
        });
        try {
          let zombieTimer: ReturnType<typeof setTimeout> | undefined;
          const zombies = await Promise.race([
            freshConn`
              SELECT pid, state,
                     EXTRACT(EPOCH FROM (NOW() - state_change))::int AS idle_seconds,
                     LEFT(query, 150) AS query_prefix
              FROM pg_stat_activity
              WHERE datname = current_database()
                AND pid != pg_backend_pid()
                AND backend_type = 'client backend'
                AND state IN ('idle', 'active')
                AND wait_event_type = 'Client'
                AND wait_event = 'ClientRead'
                AND NOW() - state_change > INTERVAL '60 seconds'
                AND query NOT ILIKE '%LISTEN%'
                AND query NOT ILIKE '%archive_mode%'
                AND query NOT ILIKE '%get_auth%'
                AND query NOT ILIKE '%pg_stat_wal_receiver%'
            `,
            new Promise<never>((_, reject) => {
              zombieTimer = setTimeout(() => reject(new Error('zombie query timeout')), 5_000);
            }),
          ]).finally(() => { if (zombieTimer) clearTimeout(zombieTimer); }) as unknown as Array<{ pid: number; idle_seconds: number; query_prefix: string; state: string }>;
          const zombieArr = Array.from(zombies as Iterable<{ pid: number; idle_seconds: number; query_prefix: string; state: string }>);

          results.zombieConnectionsFound = zombieArr.length;
          results.zombieConnectionsKilled = 0;

          if (zombieArr.length > 0) {
            recordZombieDetection(zombieArr.length);
            for (const z of zombieArr) {
              try {
                await freshConn`SELECT pg_terminate_backend(${z.pid})`;
                (results.zombieConnectionsKilled as number)++;
                recordZombieKill();
                console.warn(JSON.stringify({
                  level: 'warn',
                  event: 'zombie_connection_killed',
                  pid: z.pid,
                  state: z.state,
                  idle_seconds: z.idle_seconds,
                  query_prefix: z.query_prefix,
                  source: 'drain-outbox-cron-fresh',
                }));
              } catch (killErr) {
                console.error(`[drain-outbox] Failed to kill zombie PID ${z.pid}:`, killErr);
              }
            }
          }
        } finally {
          try { await freshConn.end({ timeout: 1 }); } catch { /* best-effort */ }
        }
      }
    } catch (zombieErr) {
      console.warn('[drain-outbox] Zombie detection (fresh conn) failed:', (zombieErr as Error).message);
      results.zombieConnectionsFound = -1;
      results.zombieConnectionsKilled = -1;
    }

    // 2. Recover stale claims — events claimed >5 min ago but never consumed.
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

    // 3. Check pending event count
    const pending = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM event_outbox WHERE published_at IS NULL
    `) as unknown as Array<{ cnt: string }>;
    results.pendingCount = Number(pending[0]?.cnt ?? 0);

    // 4. Process a batch if there are pending events
    const pendingCount = results.pendingCount as number;
    if (pendingCount > 0) {
      const worker = getOutboxWorker();
      const published = await worker.processBatch();
      results.publishedCount = published;
    } else {
      results.publishedCount = 0;
    }

    // 5. Check for idle-in-transaction connections (early warning)
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

    // 10. KDS reconciliation sweep — find orders with food/bev lines but no KDS tickets.
    // This catches orders that failed to send to KDS due to pool exhaustion, circuit breaker,
    // or any transient error. Only checks orders from the last 30 minutes to keep the query fast.
    // No vendor in the industry does automated reconciliation — this is a reliability differentiator.
    try {
      const orphanedOrders = await db.execute(sql`
        SELECT DISTINCT o.id AS order_id, o.tenant_id, o.business_date,
               l.location_id
        FROM orders o
        INNER JOIN order_lines ol ON ol.order_id = o.id AND ol.tenant_id = o.tenant_id
        LEFT JOIN fnb_kitchen_ticket_items kti ON kti.order_line_id = ol.id AND kti.tenant_id = o.tenant_id
        LEFT JOIN locations l ON l.id = o.location_id AND l.tenant_id = o.tenant_id
        WHERE o.status = 'open'
          AND ol.item_type IN ('food', 'beverage')
          AND kti.id IS NULL
          AND o.created_at > NOW() - INTERVAL '30 minutes'
          AND o.created_at < NOW() - INTERVAL '2 minutes'
        LIMIT 20
      `) as unknown as Array<{ order_id: string; tenant_id: string; business_date: string; location_id: string }>;

      const orphanArr = Array.from(orphanedOrders as Iterable<{ order_id: string; tenant_id: string; business_date: string; location_id: string }>);
      results.kdsOrphanedOrders = orphanArr.length;

      if (orphanArr.length > 0) {
        console.warn(`[drain-outbox] KDS reconciliation: found ${orphanArr.length} orders with unsent food/bev items`);
        // Log for operator awareness — actual resend happens when cashier presses Send
        // (idempotent, safe to retry). We don't auto-create tickets here because we lack
        // the full RequestContext (user, permissions) needed by createKitchenTicket.
        for (const o of orphanArr) {
          console.warn(JSON.stringify({
            level: 'warn',
            event: 'kds_orphaned_order',
            orderId: o.order_id,
            tenantId: o.tenant_id,
            locationId: o.location_id,
            businessDate: o.business_date,
            source: 'drain-outbox-cron',
          }));
        }
      }
    } catch (reconErr) {
      console.warn('[drain-outbox] KDS reconciliation sweep failed:', reconErr);
      results.kdsOrphanedOrders = -1;
    }

    // 11. Flush usage tracking buffer to DB.
    // The usage tracker accumulates events in-memory. Flushing here is safe because
    // the DB transaction completes BEFORE the response is sent (no fire-and-forget).
    try {
      const { forceFlush } = await import('@oppsera/core/usage/tracker');
      const flushStats = await forceFlush();
      results.usageBufferFlushed = flushStats.flushed;
      if (flushStats.bufferSize > 0) {
        console.log(`[drain-outbox] Usage flush: ${flushStats.bufferSize} buckets, ${flushStats.eventsInBuffer} events, flushed=${flushStats.flushed}`);
      }
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
