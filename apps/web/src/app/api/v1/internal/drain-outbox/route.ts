import { NextResponse } from 'next/server';
import { db, sql } from '@oppsera/db';
import { getOutboxWorker } from '@oppsera/core/events';

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
