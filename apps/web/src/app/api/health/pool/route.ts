import { NextRequest, NextResponse } from 'next/server';
import { db, sql, getPoolGuardStats, resetBreaker } from '@oppsera/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Pool health diagnostic endpoint.
 *
 * GET  — Returns pool-guard stats + live pg_stat_activity snapshot.
 * POST ?action=reset-breaker — Manually close the circuit breaker on this instance.
 *
 * No auth required — returns operational metrics only, no business data.
 */
export async function GET() {
  const poolGuard = getPoolGuardStats();
  const timestamp = new Date().toISOString();

  const response: Record<string, unknown> = {
    timestamp,
    poolGuard,
  };

  // Try to get live connection info from pg_stat_activity.
  // Use a tight 3s timeout — if pool is exhausted, fail fast.
  try {
    const conns = await Promise.race([
      db.execute(sql`
        SELECT
          pid,
          state,
          wait_event_type,
          wait_event,
          EXTRACT(EPOCH FROM (now() - state_change))::int AS state_duration_secs,
          EXTRACT(EPOCH FROM (now() - query_start))::int AS query_duration_secs,
          LEFT(query, 80) AS query_preview
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid != pg_backend_pid()
          AND backend_type = 'client backend'
        ORDER BY state_change ASC
      `),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3_000),
      ),
    ]) as unknown as Array<Record<string, unknown>>;

    const connections = Array.from(conns as Iterable<Record<string, unknown>>);

    // Summarize by state + lock waits
    const stateCounts: Record<string, number> = {};
    let stuckCount = 0;
    let lockWaitCount = 0;
    for (const conn of connections) {
      const state = String(conn.state ?? 'unknown');
      stateCounts[state] = (stateCounts[state] ?? 0) + 1;
      const dur = Number(conn.state_duration_secs ?? 0);
      const waitEvent = String(conn.wait_event ?? '');
      if (dur > 60 && (state === 'idle in transaction' || state === 'idle' ||
          (state === 'active' && waitEvent === 'ClientRead'))) {
        stuckCount++;
      }
      if (String(conn.wait_event_type ?? '') === 'Lock') {
        lockWaitCount++;
      }
    }

    response.connections = {
      total: connections.length,
      byState: stateCounts,
      stuckOver60s: stuckCount,
      lockWaiting: lockWaitCount,
      details: connections,
    };
    response.dbReachable = true;
  } catch (err) {
    response.dbReachable = false;
    const e = err as Error & { code?: string };
    response.dbError = {
      message: e.message ?? 'Unknown error',
      code: e.code ?? undefined,
    };
  }

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * POST /api/health/pool?action=reset-breaker
 *
 * Manually resets the circuit breaker on whichever Vercel instance handles
 * this request. Call multiple times to hit different instances.
 */
export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'reset-breaker') {
    const before = getPoolGuardStats();
    resetBreaker();
    const after = getPoolGuardStats();

    return NextResponse.json({
      action: 'reset-breaker',
      before: { breakerState: before.breakerState, tripCount: before.breakerTripCount },
      after: { breakerState: after.breakerState, tripCount: after.breakerTripCount },
      note: 'Reset applied to this instance only. Call multiple times to cover other instances.',
    });
  }

  return NextResponse.json({ error: 'Unknown action. Supported: reset-breaker' }, { status: 400 });
}
