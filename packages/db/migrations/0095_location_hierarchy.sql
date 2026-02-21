-- Migration: 0095_location_hierarchy
-- Purpose: Add parent-child location hierarchy (site → venue) to support
--          multi-level operations like Tenant → Site → Venue → Profit Center → Terminal.
--
-- location_type: 'site' = physical address (files taxes, has address)
--                'venue' = operational unit within a site (e.g., Restaurant, Pro Shop)
--
-- Profit centers attach to the most specific location (venue if exists, site if no venues).
-- The rest of the system (orders, inventory, RLS) continues using locationId unchanged.

-- ── Add hierarchy columns to locations ──────────────────────────────
ALTER TABLE locations ADD COLUMN IF NOT EXISTS parent_location_id text REFERENCES locations(id);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'site';

-- Check constraint: only 'site' or 'venue'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_location_type'
  ) THEN
    ALTER TABLE locations ADD CONSTRAINT chk_location_type
      CHECK (location_type IN ('site', 'venue'));
  END IF;
END $$;

-- Venues must have a parent; sites must not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_location_parent_consistency'
  ) THEN
    ALTER TABLE locations ADD CONSTRAINT chk_location_parent_consistency
      CHECK (
        (location_type = 'site' AND parent_location_id IS NULL)
        OR (location_type = 'venue' AND parent_location_id IS NOT NULL)
      );
  END IF;
END $$;

-- Index for fast child-location lookups
CREATE INDEX IF NOT EXISTS idx_locations_parent
  ON locations(tenant_id, parent_location_id)
  WHERE parent_location_id IS NOT NULL;
