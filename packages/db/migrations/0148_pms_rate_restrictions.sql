-- Feature #4: Rate Restrictions
-- Per-date restrictions by room type and/or rate plan (CTA, CTD, stop-sell, min/max stay)

-- 1. Create pms_rate_restrictions table
CREATE TABLE IF NOT EXISTS pms_rate_restrictions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  room_type_id TEXT REFERENCES pms_room_types(id),
  rate_plan_id TEXT REFERENCES pms_rate_plans(id),
  restriction_date DATE NOT NULL,
  min_stay INTEGER,
  max_stay INTEGER,
  cta BOOLEAN NOT NULL DEFAULT false,
  ctd BOOLEAN NOT NULL DEFAULT false,
  stop_sell BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);
--> statement-breakpoint

-- Unique constraint: one restriction per date per room type per rate plan
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_rate_restrictions_date
  ON pms_rate_restrictions (tenant_id, property_id, COALESCE(room_type_id, ''), COALESCE(rate_plan_id, ''), restriction_date);
--> statement-breakpoint

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_pms_rate_restrictions_property
  ON pms_rate_restrictions (tenant_id, property_id, restriction_date);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pms_rate_restrictions_room_type
  ON pms_rate_restrictions (tenant_id, property_id, room_type_id, restriction_date)
  WHERE room_type_id IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pms_rate_restrictions_rate_plan
  ON pms_rate_restrictions (tenant_id, property_id, rate_plan_id, restriction_date)
  WHERE rate_plan_id IS NOT NULL;
--> statement-breakpoint

-- 2. Add restriction_override to pms_reservations
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS restriction_override BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint

-- 3. RLS policies
ALTER TABLE pms_rate_restrictions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pms_rate_restrictions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS pms_rate_restrictions_select ON pms_rate_restrictions;
--> statement-breakpoint
CREATE POLICY pms_rate_restrictions_select ON pms_rate_restrictions
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_rate_restrictions_insert ON pms_rate_restrictions;
--> statement-breakpoint
CREATE POLICY pms_rate_restrictions_insert ON pms_rate_restrictions
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_rate_restrictions_update ON pms_rate_restrictions;
--> statement-breakpoint
CREATE POLICY pms_rate_restrictions_update ON pms_rate_restrictions
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_rate_restrictions_delete ON pms_rate_restrictions;
--> statement-breakpoint
CREATE POLICY pms_rate_restrictions_delete ON pms_rate_restrictions
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
