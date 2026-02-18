-- ─── compare_baselines.sql ───
-- Compare current pg_stat_statements against a saved baseline.
-- Run after capture_results.sql; compare in the companion JS script.
--
-- This SQL captures the current state in a format suitable for
-- JSON export + diff against a previous run.
--
-- Usage: psql $DATABASE_URL -f scripts/compare_baselines.sql -t -A -o results/current-stats.json

-- Output as JSON for programmatic comparison
SELECT json_build_object(
  'captured_at', NOW(),
  'database', current_database(),

  -- Top queries by total time
  'top_queries', (
    SELECT json_agg(q ORDER BY q.total_ms DESC)
    FROM (
      SELECT
        queryid,
        LEFT(query, 200) AS query,
        calls,
        ROUND(total_exec_time::numeric, 2) AS total_ms,
        ROUND(mean_exec_time::numeric, 2) AS avg_ms,
        ROUND(max_exec_time::numeric, 2) AS max_ms,
        rows AS total_rows,
        ROUND(
          shared_blks_hit::numeric * 100.0 /
          NULLIF(shared_blks_hit + shared_blks_read, 0), 1
        ) AS cache_hit_pct
      FROM pg_stat_statements
      WHERE dbname = current_database()
        AND query NOT LIKE '%pg_stat%'
      ORDER BY total_exec_time DESC
      LIMIT 30
    ) q
  ),

  -- Table stats
  'table_stats', (
    SELECT json_agg(t ORDER BY t.total_ops DESC)
    FROM (
      SELECT
        relname AS table_name,
        seq_scan,
        idx_scan,
        n_tup_ins AS inserts,
        n_tup_upd AS updates,
        n_tup_del AS deletes,
        n_live_tup AS live_rows,
        n_dead_tup AS dead_rows,
        seq_scan + idx_scan AS total_ops,
        ROUND(
          idx_scan::numeric * 100.0 /
          NULLIF(seq_scan + idx_scan, 0), 1
        ) AS index_usage_pct
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY seq_scan + idx_scan DESC
      LIMIT 40
    ) t
  ),

  -- Cache hit ratios
  'cache_stats', (
    SELECT json_build_object(
      'heap_hit_pct', ROUND(
        sum(heap_blks_hit)::numeric * 100.0 /
        NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2
      ),
      'index_hit_pct', ROUND(
        sum(idx_blks_hit)::numeric * 100.0 /
        NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2
      )
    )
    FROM pg_statio_user_tables
    WHERE schemaname = 'public'
  ),

  -- Connection summary
  'connections', (
    SELECT json_agg(c)
    FROM (
      SELECT state, count(*) AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
    ) c
  ),

  -- Table sizes
  'table_sizes', (
    SELECT json_agg(s ORDER BY s.total_bytes DESC)
    FROM (
      SELECT
        relname AS table_name,
        pg_total_relation_size(relid) AS total_bytes,
        pg_relation_size(relid) AS data_bytes,
        n_live_tup AS live_rows
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 30
    ) s
  )
);
