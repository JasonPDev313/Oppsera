-- ─── reset_stats.sql ───
-- Run BEFORE a load test to zero out pg_stat_statements
-- and table stats so capture_results.sql gets clean data.
--
-- Usage: psql $DATABASE_URL -f scripts/reset_stats.sql

-- Reset query stats (requires pg_stat_statements extension)
SELECT pg_stat_statements_reset();

-- Reset table stats for all oppsera tables
SELECT pg_stat_reset();

-- Reset WAL stats
SELECT pg_stat_reset_shared('wal');

-- Confirm reset
SELECT NOW() AS stats_reset_at,
       (SELECT count(*) FROM pg_stat_statements) AS stmt_count_after_reset;
