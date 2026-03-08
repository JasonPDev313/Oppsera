-- Race condition guard indexes
-- Prevents double-booking of spa appointments and double-finalization of tips

-- #1: Prevent spa appointment double-booking at the DB level.
-- Two concurrent createAppointment calls can both pass conflict detection
-- (TOCTOU race) — this index ensures only one INSERT wins.
-- Uses an exclusion constraint via a GiST index on tstzrange overlap.
-- Partial: only active appointments (not cancelled/no_show/checked_out/completed).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Exclude overlapping appointments for the same provider
-- This catches the TOCTOU race in detectConflicts → INSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spa_appointments_no_provider_overlap'
  ) THEN
    ALTER TABLE spa_appointments
      ADD CONSTRAINT spa_appointments_no_provider_overlap
      EXCLUDE USING gist (
        tenant_id WITH =,
        provider_id WITH =,
        tstzrange(start_at, end_at) WITH &&
      )
      WHERE (status NOT IN ('cancelled', 'no_show', 'checked_out', 'completed'));
  END IF;
END $$;
