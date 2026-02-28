import { NextResponse } from 'next/server';
import { db, sql, getPoolGuardStats } from '@oppsera/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Pool health diagnostic endpoint.
 *
 * Returns pool-guard stats (active ops, queued, breaker state, query timeout)
 * plus live pg_stat_activity connection snapshot when DB is reachable.
 *
 * Designed for monitoring dashboards and on-call debugging.
 * No auth required — returns operational metrics only, no business data.
 */
export async function GET() {
  const poolGuard = getPoolGuardStats();
  const timestamp = new Date().toISOString();

  // Pool guard stats are pure in-memory — always available, no DB needed
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
      if (dur > 60 && (state === 'idle in transaction' || state === 'idle')) {
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
  } catch {
    response.dbReachable = false;
    response.dbError = 'Could not query pg_stat_activity (pool likely exhausted or timeout)';
  }

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
