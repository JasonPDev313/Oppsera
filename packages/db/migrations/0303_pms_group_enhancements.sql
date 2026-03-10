-- Group booking enhancements: group_code, confirmation_number, version,
-- shoulder dates, auto-release, sales rep, comments, booking metadata

-- New columns on pms_groups
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS group_code VARCHAR(20);
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS confirmation_number INTEGER;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS source VARCHAR(50);
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS market VARCHAR(50);
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS booking_method VARCHAR(50);
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS sales_rep_user_id TEXT REFERENCES users(id);
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS special_requests TEXT;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS group_comments TEXT;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS reservation_comments TEXT;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS auto_release_at_cutoff BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS shoulder_dates_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS shoulder_start_date DATE;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS shoulder_end_date DATE;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS shoulder_rate_cents INTEGER;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS auto_route_packages_to_master BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS auto_route_specials_to_master BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pms_groups ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Unique group code per tenant+property
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_groups_tenant_property_code
  ON pms_groups (tenant_id, property_id, group_code)
  WHERE group_code IS NOT NULL;

-- Unique confirmation number per tenant+property (safety net for MAX+1 race)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_groups_tenant_property_confirmation
  ON pms_groups (tenant_id, property_id, confirmation_number)
  WHERE confirmation_number IS NOT NULL;

-- Also a plain index for fast lookup
CREATE INDEX IF NOT EXISTS idx_pms_groups_tenant_property_confirmation
  ON pms_groups (tenant_id, property_id, confirmation_number)
  WHERE confirmation_number IS NOT NULL;

-- Index for cutoff auto-release job
CREATE INDEX IF NOT EXISTS idx_pms_groups_cutoff_release
  ON pms_groups (cutoff_date, auto_release_at_cutoff)
  WHERE status != 'cancelled' AND auto_release_at_cutoff = true;

-- Index for group code search
CREATE INDEX IF NOT EXISTS idx_pms_groups_group_code
  ON pms_groups (tenant_id, group_code)
  WHERE group_code IS NOT NULL;
