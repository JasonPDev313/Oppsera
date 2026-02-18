/**
 * Migration trigger monitoring — checks current system metrics against
 * the thresholds defined in infra/LIMITS_AND_MIGRATION.ts.
 *
 * Run via: GET /api/admin/migration-readiness
 * Returns which triggers are approaching or have been hit.
 */

import { db, sql } from '@oppsera/db';
import { logger } from './logger';

export interface TriggerStatus {
  id: string;
  component: string;
  metric: string;
  threshold: string;
  currentValue: string | number | null;
  status: 'ok' | 'warning' | 'triggered';
  recommendation: string;
}

export async function checkMigrationTriggers(): Promise<TriggerStatus[]> {
  const triggers: TriggerStatus[] = [];

  // 1. Database size
  try {
    const result = await db.execute(sql`
      SELECT pg_database_size(current_database()) AS size_bytes
    `);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    const sizeGB = Number(rows[0]?.size_bytes ?? 0) / (1024 ** 3);
    const limitGB = 8; // Supabase Pro limit
    triggers.push({
      id: 'database-size',
      component: 'database',
      metric: 'Database size (GB)',
      threshold: `${limitGB}GB (Supabase Pro)`,
      currentValue: Math.round(sizeGB * 100) / 100,
      status: sizeGB > limitGB * 0.8 ? 'triggered' : sizeGB > limitGB * 0.6 ? 'warning' : 'ok',
      recommendation: sizeGB > limitGB * 0.8
        ? 'Upgrade to Supabase Team or migrate to RDS'
        : sizeGB > limitGB * 0.6
        ? 'Monitor growth rate. Consider archiving old audit_log partitions.'
        : 'Healthy',
    });
  } catch {
    triggers.push({
      id: 'database-size',
      component: 'database',
      metric: 'Database size (GB)',
      threshold: '8GB',
      currentValue: null,
      status: 'ok',
      recommendation: 'Unable to check — pg_database_size may require superuser',
    });
  }

  // 2. Connection utilization
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) AS active,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_conn
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    const active = Number(rows[0]?.active ?? 0);
    const maxConn = Number(rows[0]?.max_conn ?? 100);
    const pct = Math.round(100 * active / maxConn);
    triggers.push({
      id: 'connection-pool',
      component: 'database',
      metric: 'Connection utilization %',
      threshold: '80% of max_connections',
      currentValue: `${pct}% (${active}/${maxConn})`,
      status: pct > 80 ? 'triggered' : pct > 60 ? 'warning' : 'ok',
      recommendation: pct > 80
        ? 'Reduce pool size per function or migrate to RDS + PgBouncer'
        : 'Healthy',
    });
  } catch {
    // skip
  }

  // 3. Outbox dispatch lag
  try {
    const result = await db.execute(sql`
      SELECT
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) AS oldest_age_secs,
        COUNT(*) AS pending
      FROM event_outbox
      WHERE published_at IS NULL
    `);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    const ageSecs = Number(rows[0]?.oldest_age_secs ?? 0);
    const pending = Number(rows[0]?.pending ?? 0);
    triggers.push({
      id: 'outbox-lag',
      component: 'workers',
      metric: 'Outbox dispatch lag (seconds)',
      threshold: '15s consistent lag',
      currentValue: ageSecs > 0 ? `${Math.round(ageSecs)}s (${pending} pending)` : '0s (no pending)',
      status: ageSecs > 15 ? 'triggered' : ageSecs > 5 ? 'warning' : 'ok',
      recommendation: ageSecs > 15
        ? 'Deploy dedicated outbox dispatcher (Railway/Fly.io $5/mo or container worker)'
        : 'Healthy',
    });
  } catch {
    // skip
  }

  // 4. Cache hit ratio
  try {
    const result = await db.execute(sql`
      SELECT
        ROUND(100.0 * SUM(heap_blks_hit) / NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0), 2) AS pct
      FROM pg_statio_user_tables
    `);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    const pct = Number(rows[0]?.pct ?? 100);
    triggers.push({
      id: 'cache-hit-ratio',
      component: 'database',
      metric: 'Buffer cache hit ratio %',
      threshold: '<95% → need Postgres config tuning',
      currentValue: `${pct}%`,
      status: pct < 95 ? 'triggered' : pct < 99 ? 'warning' : 'ok',
      recommendation: pct < 95
        ? 'Need to increase shared_buffers — requires RDS or self-hosted Postgres'
        : 'Healthy',
    });
  } catch {
    // skip
  }

  // 5. Table bloat check
  try {
    const result = await db.execute(sql`
      SELECT
        SUM(n_dead_tup) AS total_dead,
        SUM(n_live_tup) AS total_live
      FROM pg_stat_user_tables
    `);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    const dead = Number(rows[0]?.total_dead ?? 0);
    const live = Number(rows[0]?.total_live ?? 1);
    const bloatPct = Math.round(100 * dead / Math.max(live, 1));
    triggers.push({
      id: 'table-bloat',
      component: 'database',
      metric: 'Table bloat (dead tuple %)',
      threshold: '>20% across all tables',
      currentValue: `${bloatPct}% (${dead.toLocaleString()} dead / ${live.toLocaleString()} live)`,
      status: bloatPct > 20 ? 'triggered' : bloatPct > 10 ? 'warning' : 'ok',
      recommendation: bloatPct > 20
        ? 'Run VACUUM FULL on high-bloat tables or increase autovacuum frequency'
        : 'Healthy',
    });
  } catch {
    // skip
  }

  logger.info('Migration trigger check completed', {
    total: triggers.length,
    triggered: triggers.filter(t => t.status === 'triggered').length,
    warning: triggers.filter(t => t.status === 'warning').length,
  });

  return triggers;
}
