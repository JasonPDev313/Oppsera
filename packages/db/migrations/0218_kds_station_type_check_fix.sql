-- Migration 0218: Fix fnb_kitchen_stations station_type CHECK constraint
-- The original migration 0082 restricted station_type to ('prep','expo','bar').
-- Migration 0209 added comprehensive KDS settings but didn't update the constraint.
-- The Drizzle schema and UI now support 9 station types.

-- Drop the old check constraint and add an expanded one
DO $$
BEGIN
  -- Drop existing check constraint (name may vary)
  ALTER TABLE fnb_kitchen_stations DROP CONSTRAINT IF EXISTS fnb_kitchen_stations_station_type_check;

  -- Add updated constraint with all 9 station types
  ALTER TABLE fnb_kitchen_stations ADD CONSTRAINT fnb_kitchen_stations_station_type_check
    CHECK (station_type IN ('prep','expo','bar','dessert','salad','grill','fry','pizza','custom'));
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet (migration 0082 not run) — skip
    NULL;
END $$;
