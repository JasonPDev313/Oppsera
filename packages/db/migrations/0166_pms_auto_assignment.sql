-- PMS Feature #17: Auto Room Assignment
-- Migration 0166: Room assignment preferences table + room/guest column additions

-- ── pms_room_assignment_preferences ─────────────────────────────
CREATE TABLE IF NOT EXISTS pms_room_assignment_preferences (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id         TEXT NOT NULL,
  property_id       TEXT NOT NULL,
  name              TEXT NOT NULL,
  weight            INTEGER NOT NULL DEFAULT 50,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_pms_room_assign_pref_weight CHECK (weight >= 0 AND weight <= 100)
);

-- Unique constraint: one preference per name per property per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_room_assign_pref_tenant_property_name
  ON pms_room_assignment_preferences (tenant_id, property_id, name);

-- Lookup index
CREATE INDEX IF NOT EXISTS idx_pms_room_assign_pref_tenant_property
  ON pms_room_assignment_preferences (tenant_id, property_id);

-- RLS
ALTER TABLE pms_room_assignment_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_room_assignment_preferences FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'pms_room_assign_pref_select' AND tablename = 'pms_room_assignment_preferences'
  ) THEN
    CREATE POLICY pms_room_assign_pref_select ON pms_room_assignment_preferences
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'pms_room_assign_pref_insert' AND tablename = 'pms_room_assignment_preferences'
  ) THEN
    CREATE POLICY pms_room_assign_pref_insert ON pms_room_assignment_preferences
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'pms_room_assign_pref_update' AND tablename = 'pms_room_assignment_preferences'
  ) THEN
    CREATE POLICY pms_room_assign_pref_update ON pms_room_assignment_preferences
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'pms_room_assign_pref_delete' AND tablename = 'pms_room_assignment_preferences'
  ) THEN
    CREATE POLICY pms_room_assign_pref_delete ON pms_room_assignment_preferences
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── Add columns to pms_rooms ────────────────────────────────────
ALTER TABLE pms_rooms ADD COLUMN IF NOT EXISTS accessibility_json JSONB DEFAULT '{}';
ALTER TABLE pms_rooms ADD COLUMN IF NOT EXISTS view_type TEXT;
ALTER TABLE pms_rooms ADD COLUMN IF NOT EXISTS wing TEXT;
ALTER TABLE pms_rooms ADD COLUMN IF NOT EXISTS connecting_room_ids TEXT[] DEFAULT '{}';

-- ── Add columns to pms_guests ───────────────────────────────────
ALTER TABLE pms_guests ADD COLUMN IF NOT EXISTS room_preferences_json JSONB DEFAULT '{}';
