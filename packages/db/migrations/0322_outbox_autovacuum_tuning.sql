-- 0322: Tune autovacuum for high-churn event tables.
--
-- event_outbox and processed_events see high INSERT/DELETE throughput.
-- Default autovacuum_vacuum_scale_factor (0.2 = 20% of table must be dead)
-- is too lazy for tables that churn rapidly — dead tuples accumulate,
-- bloating the table and slowing index scans.
--
-- Setting scale_factor to 0.01 (1%) triggers vacuum much sooner,
-- keeping these tables compact without requiring manual VACUUM FULL.

ALTER TABLE event_outbox SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE processed_events SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.01
);
