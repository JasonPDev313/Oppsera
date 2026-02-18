-- ─── capture_results.sql ───
-- Run AFTER a load test to capture DB-side metrics.
-- Exports results as JSON for the comparison script.
--
-- Usage: psql $DATABASE_URL -f scripts/capture_results.sql -o results/db-stats.json

-- ═══════════════════════════════════════════════════════
-- 1. Top 20 Queries by Total Time
-- ═══════════════════════════════════════════════════════
\echo '=== TOP QUERIES BY TOTAL TIME ==='
SELECT
  queryid,
  LEFT(query, 120) AS query_preview,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_ms,
  ROUND(mean_exec_time::numeric, 2) AS avg_ms,
  ROUND(min_exec_time::numeric, 2) AS min_ms,
  ROUND(max_exec_time::numeric, 2) AS max_ms,
  ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows AS total_rows,
  ROUND((rows::numeric / NULLIF(calls, 0)), 1) AS avg_rows,
  shared_blks_hit,
  shared_blks_read,
  ROUND(
    shared_blks_hit::numeric * 100.0 /
    NULLIF(shared_blks_hit + shared_blks_read, 0), 1
  ) AS cache_hit_pct
FROM pg_stat_statements
WHERE dbname = current_database()
  AND query NOT LIKE '%pg_stat%'
ORDER BY total_exec_time DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════
-- 2. Top 20 Queries by Mean Time (slow queries)
-- ═══════════════════════════════════════════════════════
\echo '=== SLOWEST QUERIES (BY AVERAGE) ==='
SELECT
  queryid,
  LEFT(query, 120) AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS avg_ms,
  ROUND(max_exec_time::numeric, 2) AS max_ms,
  rows AS total_rows
FROM pg_stat_statements
WHERE dbname = current_database()
  AND calls > 10
  AND query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════
-- 3. Table I/O Stats (seq scan vs index scan)
-- ═══════════════════════════════════════════════════════
\echo '=== TABLE I/O STATS ==='
SELECT
  schemaname,
  relname AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  n_tup_ins AS inserts,
  n_tup_upd AS updates,
  n_tup_del AS deletes,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  ROUND(
    idx_scan::numeric * 100.0 /
    NULLIF(seq_scan + idx_scan, 0), 1
  ) AS index_usage_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan + idx_scan DESC
LIMIT 30;

-- ═══════════════════════════════════════════════════════
-- 4. Index Usage Stats
-- ═══════════════════════════════════════════════════════
\echo '=== INDEX USAGE STATS ==='
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 30;

-- ═══════════════════════════════════════════════════════
-- 5. Unused Indexes (candidates for removal)
-- ═══════════════════════════════════════════════════════
\echo '=== UNUSED INDEXES ==='
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS scans,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- ═══════════════════════════════════════════════════════
-- 6. Connection Stats
-- ═══════════════════════════════════════════════════════
\echo '=== CONNECTION STATS ==='
SELECT
  state,
  count(*) AS connections,
  max(now() - state_change) AS max_duration
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count(*) DESC;

-- ═══════════════════════════════════════════════════════
-- 7. Lock Contention
-- ═══════════════════════════════════════════════════════
\echo '=== LOCK CONTENTION ==='
SELECT
  locktype,
  mode,
  count(*) AS lock_count,
  count(*) FILTER (WHERE NOT granted) AS waiting
FROM pg_locks
WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
GROUP BY locktype, mode
HAVING count(*) > 1
ORDER BY count(*) DESC;

-- ═══════════════════════════════════════════════════════
-- 8. Table Sizes
-- ═══════════════════════════════════════════════════════
\echo '=== TABLE SIZES ==='
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS data_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
  n_live_tup AS live_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════
-- 9. Buffer Cache Hit Ratio
-- ═══════════════════════════════════════════════════════
\echo '=== BUFFER CACHE HIT RATIO ==='
SELECT
  ROUND(
    sum(heap_blks_hit)::numeric * 100.0 /
    NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2
  ) AS heap_cache_hit_pct,
  ROUND(
    sum(idx_blks_hit)::numeric * 100.0 /
    NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2
  ) AS index_cache_hit_pct
FROM pg_statio_user_tables
WHERE schemaname = 'public';

-- ═══════════════════════════════════════════════════════
-- 10. WAL Stats
-- ═══════════════════════════════════════════════════════
\echo '=== WAL STATS ==='
SELECT
  wal_records,
  wal_fpi,
  pg_size_pretty(wal_bytes) AS wal_generated
FROM pg_stat_wal;
