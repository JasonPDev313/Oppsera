-- Extend terminal_locations with Profit Center fields
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS location_id text REFERENCES locations(id);
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill existing rows with their tenant's first active location
UPDATE terminal_locations tl
SET location_id = (
  SELECT l.id FROM locations l
  WHERE l.tenant_id = tl.tenant_id AND l.is_active = true
  ORDER BY l.created_at LIMIT 1
)
WHERE tl.location_id IS NULL;

-- Now make location_id NOT NULL (every profit center must belong to a location)
ALTER TABLE terminal_locations ALTER COLUMN location_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_terminal_locations_location
  ON terminal_locations(tenant_id, location_id) WHERE is_active = true;

-- Extend terminals with additional fields
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS location_id text REFERENCES locations(id);
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS terminal_number integer;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS device_identifier text;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_terminals_location
  ON terminals(tenant_id, location_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_terminals_profit_center
  ON terminals(tenant_id, terminal_location_id) WHERE is_active = true;
