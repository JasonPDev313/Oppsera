-- Migration 0279: Add FORCE ROW LEVEL SECURITY to tables missing it
-- Without FORCE, service-role connections bypass RLS policies entirely

ALTER TABLE IF EXISTS fnb_pacing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fnb_server_load_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fnb_turn_time_aggregates FORCE ROW LEVEL SECURITY;
