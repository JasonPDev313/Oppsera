-- Migration: Add index for efficient reservation conflict detection
-- This partial index covers only active reservations (the vast majority of
-- conflict queries exclude canceled / no_show / completed rows), dramatically
-- reducing the index size and keeping scans fast even at high reservation volume.
CREATE INDEX IF NOT EXISTS idx_fnb_reservations_conflict_check
  ON fnb_reservations (tenant_id, location_id, reservation_date, assigned_table_id)
  WHERE status NOT IN ('canceled', 'no_show', 'completed');
