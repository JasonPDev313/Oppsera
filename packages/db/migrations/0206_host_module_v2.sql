-- HOST MODULE V2: Enhanced reservations, waitlist, turn log, notifications
-- Migration 0206

-- ── 1. ALTER fnb_reservations: add missing columns ──────────────────
ALTER TABLE fnb_reservations ADD COLUMN IF NOT EXISTS meal_period TEXT;
ALTER TABLE fnb_reservations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE fnb_reservations ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE fnb_reservations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE fnb_reservations ADD COLUMN IF NOT EXISTS canceled_by TEXT;
ALTER TABLE fnb_reservations ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fnb_reservations ADD COLUMN IF NOT EXISTS table_ids TEXT[];

-- ── 2. ALTER fnb_waitlist_entries: add missing columns ──────────────
ALTER TABLE fnb_waitlist_entries ADD COLUMN IF NOT EXISTS guest_token TEXT;
ALTER TABLE fnb_waitlist_entries ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fnb_waitlist_guest_token
  ON fnb_waitlist_entries (guest_token) WHERE guest_token IS NOT NULL;

-- ── 3. CREATE fnb_table_turn_log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS fnb_table_turn_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  table_id TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  meal_period TEXT NOT NULL,
  seated_at TIMESTAMPTZ NOT NULL,
  cleared_at TIMESTAMPTZ,
  turn_time_minutes INTEGER,
  day_of_week INTEGER NOT NULL,
  was_reservation BOOLEAN NOT NULL DEFAULT false,
  reservation_id TEXT,
  waitlist_entry_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_turn_log_tenant
  ON fnb_table_turn_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fnb_turn_log_analytics
  ON fnb_table_turn_log (tenant_id, location_id, meal_period, day_of_week);
CREATE INDEX IF NOT EXISTS idx_fnb_turn_log_table_open
  ON fnb_table_turn_log (tenant_id, table_id) WHERE cleared_at IS NULL;

-- ── 4. CREATE fnb_guest_notifications ───────────────────────────────
CREATE TABLE IF NOT EXISTS fnb_guest_notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_phone TEXT,
  recipient_email TEXT,
  message_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_notifications_ref
  ON fnb_guest_notifications (tenant_id, reference_type, reference_id);

-- ── 5. CREATE fnb_wait_time_history (analytics for wait-time estimator) ─
CREATE TABLE IF NOT EXISTS fnb_wait_time_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  actual_wait_minutes INTEGER NOT NULL,
  seating_preference TEXT,
  day_of_week INTEGER NOT NULL,
  hour_of_day INTEGER NOT NULL,
  was_reservation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_wait_time_history_tenant
  ON fnb_wait_time_history (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fnb_wait_time_history_analytics
  ON fnb_wait_time_history (tenant_id, location_id, party_size, day_of_week, hour_of_day);

-- ── 6. RLS Policies ────────────────────────────────────────────────

ALTER TABLE fnb_wait_time_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_wait_time_history FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_wait_time_history_select' AND tablename = 'fnb_wait_time_history') THEN
    CREATE POLICY fnb_wait_time_history_select ON fnb_wait_time_history FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_wait_time_history_insert' AND tablename = 'fnb_wait_time_history') THEN
    CREATE POLICY fnb_wait_time_history_insert ON fnb_wait_time_history FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_wait_time_history_update' AND tablename = 'fnb_wait_time_history') THEN
    CREATE POLICY fnb_wait_time_history_update ON fnb_wait_time_history FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_wait_time_history_delete' AND tablename = 'fnb_wait_time_history') THEN
    CREATE POLICY fnb_wait_time_history_delete ON fnb_wait_time_history FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

ALTER TABLE fnb_table_turn_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_turn_log FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_table_turn_log_select' AND tablename = 'fnb_table_turn_log') THEN
    CREATE POLICY fnb_table_turn_log_select ON fnb_table_turn_log FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_table_turn_log_insert' AND tablename = 'fnb_table_turn_log') THEN
    CREATE POLICY fnb_table_turn_log_insert ON fnb_table_turn_log FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_table_turn_log_update' AND tablename = 'fnb_table_turn_log') THEN
    CREATE POLICY fnb_table_turn_log_update ON fnb_table_turn_log FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_table_turn_log_delete' AND tablename = 'fnb_table_turn_log') THEN
    CREATE POLICY fnb_table_turn_log_delete ON fnb_table_turn_log FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

ALTER TABLE fnb_guest_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_guest_notifications FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_guest_notifications_select' AND tablename = 'fnb_guest_notifications') THEN
    CREATE POLICY fnb_guest_notifications_select ON fnb_guest_notifications FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_guest_notifications_insert' AND tablename = 'fnb_guest_notifications') THEN
    CREATE POLICY fnb_guest_notifications_insert ON fnb_guest_notifications FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_guest_notifications_update' AND tablename = 'fnb_guest_notifications') THEN
    CREATE POLICY fnb_guest_notifications_update ON fnb_guest_notifications FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_guest_notifications_delete' AND tablename = 'fnb_guest_notifications') THEN
    CREATE POLICY fnb_guest_notifications_delete ON fnb_guest_notifications FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
