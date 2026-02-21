-- Add nights column to pms_reservations (was in Drizzle schema but missing from migration 0083)
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS nights INTEGER NOT NULL DEFAULT 1;
