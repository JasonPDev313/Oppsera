import { NextResponse } from 'next/server';
import { db, sql, getPoolGuardStats } from '@oppsera/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Health check timeout — must be longer than postgres.js connect_timeout (10s)
// to avoid false-positive 503s on Vercel cold starts when Supavisor connection
// establishment takes several seconds. Previous value of 3s caused false 503s.
const HEALTH_CHECK_TIMEOUT_MS = 8_000;

/** Wraps a promise with a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Public health endpoint for load balancers and uptime monitors.
 * Returns minimal info — detailed diagnostics are at /api/admin/health (auth required).
 *
 * Checks:
 * 1. DB connectivity (SELECT 1) — with 8s timeout (allows cold-start connection)
 * 2. Stuck transactions (idle in transaction >60s) — early warning for pool exhaustion
 * 3. Outbox lag (pending events >5 min old) — early warning for event processing stall
 *
 */
export async function GET() {
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const warnings: string[] = [];

  try {
    // Primary check: can we talk to the DB at all?
    // 8s timeout — allows for cold-start Supavisor connection establishment.
    await withTimeout(db.execute(sql`SELECT 1`), HEALTH_CHECK_TIMEOUT_MS);

    // Secondary check: are there stuck transactions that could exhaust the pool?
    // This is the exact pattern that caused the 2026-02-27 production outage.
    const stuck = await db.execute(sql`
      SELECT pid, now() - state_change AS duration
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'idle in transaction'
        AND now() - state_change > INTERVAL '60 seconds'
        AND pid != pg_backend_pid()
    `) as unknown as Array<{ pid: number; duration: string }>;
    const stuckPids = Array.from(stuck as Iterable<{ pid: number; duration: string }>);
    if (stuckPids.length > 0) {
      status = 'degraded';
      warnings.push(`${stuckPids.length} connection(s) stuck in idle-in-transaction >60s`);
      console.error(`[health] WARNING: ${stuckPids.length} stuck idle-in-transaction connections detected`);
      // NOTE: pg_terminate_backend removed from public endpoint — use /api/admin/health for self-healing
    }

    // Tertiary check: zombie idle+ClientRead connections (Vercel freeze survivors).
    // These are connections where Postgres completed the query but the client never
    // read the response (event loop frozen). Neither statement_timeout nor
    // idle_in_transaction_session_timeout catches these — only external monitoring.
    const zombies = await db.execute(sql`
      SELECT COUNT(*) as cnt
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
    `) as unknown as Array<{ cnt: string }>;
    const zombieCount = Number(zombies[0]?.cnt ?? 0);
    if (zombieCount > 0) {
      status = 'degraded';
      warnings.push(`${zombieCount} zombie idle+ClientRead connection(s) detected >60s`);
      console.error(`[health] WARNING: ${zombieCount} zombie idle+ClientRead connections detected`);
      // NOTE: no pg_terminate_backend here — public endpoint, detection only.
      // The drain-outbox cron (every 60s) handles killing.
    }

    // Quaternary check: is the outbox backing up?
    const staleOutbox = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM event_outbox
      WHERE published_at IS NULL
        AND created_at < NOW() - INTERVAL '5 minutes'
    `) as unknown as Array<{ cnt: string }>;
    const staleCount = Number(staleOutbox[0]?.cnt ?? 0);
    if (staleCount > 0) {
      status = 'degraded';
      warnings.push(`${staleCount} outbox event(s) pending >5 minutes`);
    }
  } catch (err) {
    status = 'unhealthy';
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[health] DB check failed: ${msg}`);
    // If the health check itself timed out, that's pool exhaustion
    if (msg.includes('timed out')) {
      warnings.push('DB pool likely exhausted — health check could not acquire connection in 8s');
    }
  }

  // Pool guard stats — always included for observability
  const poolGuard = getPoolGuardStats();

  const body: Record<string, unknown> = { status, poolGuard };
  if (warnings.length > 0) body.warnings = warnings;

  return NextResponse.json(body, {
    status: status === 'unhealthy' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
