/**
 * Database health monitoring queries.
 *
 * These queries run against Supabase Postgres 16.
 * pg_stat_statements must be enabled (it is by default on Supabase).
 */

import { db, sql } from '@oppsera/db';

export const dbHealth = {
  /** Top 10 slowest queries by mean execution time */
  async slowestQueries() {
    const result = await db.execute(sql`
      SELECT
        queryid,
        LEFT(query, 200) AS query_preview,
        calls,
        ROUND(mean_exec_time::numeric, 2) AS mean_ms,
        ROUND(total_exec_time::numeric, 2) AS total_ms,
        ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
        rows
      FROM pg_stat_statements
      WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
      ORDER BY mean_exec_time DESC
      LIMIT 10
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Top 10 most frequently called queries */
  async mostCalledQueries() {
    const result = await db.execute(sql`
      SELECT
        queryid,
        LEFT(query, 200) AS query_preview,
        calls,
        ROUND(mean_exec_time::numeric, 2) AS mean_ms,
        ROUND(total_exec_time::numeric, 2) AS total_ms,
        rows
      FROM pg_stat_statements
      WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
      ORDER BY calls DESC
      LIMIT 10
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Top 10 queries by total time (slow x frequent = worst offenders) */
  async worstOffenderQueries() {
    const result = await db.execute(sql`
      SELECT
        queryid,
        LEFT(query, 200) AS query_preview,
        calls,
        ROUND(mean_exec_time::numeric, 2) AS mean_ms,
        ROUND(total_exec_time::numeric, 2) AS total_ms,
        ROUND((total_exec_time / NULLIF(calls, 0))::numeric, 2) AS avg_ms
      FROM pg_stat_statements
      WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
      ORDER BY total_exec_time DESC
      LIMIT 10
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Queries with high variance (inconsistent performance) */
  async highVarianceQueries() {
    const result = await db.execute(sql`
      SELECT
        queryid,
        LEFT(query, 200) AS query_preview,
        calls,
        ROUND(mean_exec_time::numeric, 2) AS mean_ms,
        ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
        ROUND((stddev_exec_time / NULLIF(mean_exec_time, 0))::numeric, 2) AS cv
      FROM pg_stat_statements
      WHERE calls > 10
        AND userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
        AND stddev_exec_time / NULLIF(mean_exec_time, 0) > 2
      ORDER BY stddev_exec_time / NULLIF(mean_exec_time, 0) DESC
      LIMIT 10
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Tables with sequential scans (missing index candidates) */
  async sequentialScans() {
    const result = await db.execute(sql`
      SELECT
        schemaname,
        relname AS table_name,
        seq_scan,
        seq_tup_read,
        idx_scan,
        CASE WHEN (seq_scan + idx_scan) > 0
          THEN ROUND(100.0 * idx_scan / (seq_scan + idx_scan), 1)
          ELSE 0 END AS idx_scan_pct
      FROM pg_stat_user_tables
      WHERE seq_scan > 100
      ORDER BY seq_tup_read DESC
      LIMIT 10
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Unused indexes (candidates for removal) */
  async unusedIndexes() {
    const result = await db.execute(sql`
      SELECT
        schemaname,
        relname AS table_name,
        indexrelname AS index_name,
        idx_scan,
        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0
        AND indexrelname NOT LIKE 'pg_%'
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 20
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Table bloat — dead tuples vs live tuples */
  async tableBloat() {
    const result = await db.execute(sql`
      SELECT
        schemaname,
        relname AS table_name,
        n_live_tup AS live_tuples,
        n_dead_tup AS dead_tuples,
        CASE WHEN n_live_tup > 0
          THEN ROUND(100.0 * n_dead_tup / n_live_tup, 1)
          ELSE 0 END AS dead_pct,
        last_vacuum,
        last_autovacuum
      FROM pg_stat_user_tables
      WHERE n_dead_tup > 1000
      ORDER BY n_dead_tup DESC
      LIMIT 10
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Connection utilization */
  async connectionStats() {
    const result = await db.execute(sql`
      SELECT
        state,
        COUNT(*) AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
      ORDER BY count DESC
    `);
    const maxResult = await db.execute(sql`
      SELECT setting::int AS max_connections FROM pg_settings WHERE name = 'max_connections'
    `);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    const maxRows = Array.from(maxResult as Iterable<Record<string, unknown>>);
    const maxConnections = maxRows[0]?.max_connections ?? 100;
    const totalActive = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
    return {
      states: rows,
      totalActive,
      maxConnections,
      utilizationPct: Math.round(100 * totalActive / Number(maxConnections)),
    };
  },

  /** Cache hit ratio (should be > 99%) */
  async cacheHitRatio() {
    const result = await db.execute(sql`
      SELECT
        ROUND(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS cache_hit_pct
      FROM pg_statio_user_tables
    `);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    return { cacheHitPct: rows[0]?.cache_hit_pct ?? null };
  },

  /** Table sizes for capacity planning */
  async tableSizes() {
    const result = await db.execute(sql`
      SELECT
        relname AS table_name,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
        pg_size_pretty(pg_relation_size(relid)) AS data_size,
        pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
        n_live_tup AS row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 20
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Full health snapshot for automated daily check */
  async fullSnapshot() {
    const [
      connections,
      cacheHit,
      bloat,
      seqScans,
      worstOffenders,
      sizes,
    ] = await Promise.all([
      this.connectionStats(),
      this.cacheHitRatio(),
      this.tableBloat(),
      this.sequentialScans(),
      this.worstOffenderQueries(),
      this.tableSizes(),
    ]);

    // Determine alerts
    const alerts: Array<{ metric: string; level: 'warning' | 'critical'; message: string }> = [];

    if (connections.utilizationPct > 80) {
      alerts.push({
        metric: 'connections',
        level: connections.utilizationPct > 90 ? 'critical' : 'warning',
        message: `Connection utilization at ${connections.utilizationPct}% (${connections.totalActive}/${connections.maxConnections})`,
      });
    }

    const cacheHitNum = Number(cacheHit.cacheHitPct);
    if (cacheHitNum > 0 && cacheHitNum < 99) {
      alerts.push({
        metric: 'cache_hit',
        level: cacheHitNum < 95 ? 'critical' : 'warning',
        message: `Cache hit ratio at ${cacheHitNum}% (target: >99%)`,
      });
    }

    return {
      capturedAt: new Date().toISOString(),
      connections,
      cacheHit,
      tableBloat: bloat,
      sequentialScans: seqScans,
      worstOffenders,
      tableSizes: sizes,
      alerts,
    };
  },
};
