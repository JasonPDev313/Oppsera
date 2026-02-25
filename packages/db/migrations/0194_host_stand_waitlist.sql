-- ═══════════════════════════════════════════════════════════════════
-- 0194 — Host Stand: Waitlist, Reservations & Host Settings
-- ═══════════════════════════════════════════════════════════════════
-- V1 Core: waitlist queue, reservations, host config, wait-time estimation
-- V2 Provisioned: SMS gateway stubs, online booking, third-party integrations

-- ── Waitlist Entries ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fnb_waitlist_entries (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  location_id     TEXT NOT NULL REFERENCES locations(id),
  business_date   DATE NOT NULL,

  -- Party info
  guest_name      TEXT NOT NULL,
  guest_phone     TEXT,                        -- E.164 format for SMS (V2)
  guest_email     TEXT,                        -- for email notifications (V2)
  party_size      INTEGER NOT NULL DEFAULT 2,
  quoted_wait_minutes INTEGER,                 -- estimated wait quoted to guest

  -- Status lifecycle: waiting → notified → seated → no_show → canceled
  status          TEXT NOT NULL DEFAULT 'waiting',
  priority        INTEGER NOT NULL DEFAULT 0,  -- 0=normal, 1=VIP, 2=priority
  position        INTEGER NOT NULL DEFAULT 0,  -- queue position (recomputed)

  -- Seating preferences
  seating_preference TEXT,                     -- indoor, outdoor, bar, patio, window, booth, any
  special_requests TEXT,                       -- dietary, accessibility, occasion
  is_vip          BOOLEAN NOT NULL DEFAULT FALSE,
  vip_note        TEXT,

  -- Customer link
  customer_id     TEXT,                        -- FK to customers table (optional)
  customer_visit_count INTEGER DEFAULT 0,      -- denormalized for host display

  -- Timestamps
  added_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notified_at     TIMESTAMP WITH TIME ZONE,    -- when SMS/notification sent
  seated_at       TIMESTAMP WITH TIME ZONE,
  canceled_at     TIMESTAMP WITH TIME ZONE,
  no_show_at      TIMESTAMP WITH TIME ZONE,
  actual_wait_minutes INTEGER,                 -- computed when seated

  -- Seating result
  seated_table_id TEXT,                        -- FK stub to fnb_tables
  seated_server_user_id TEXT,
  tab_id          TEXT,                        -- FK stub to fnb_tabs

  -- Source
  source          TEXT NOT NULL DEFAULT 'host_stand', -- host_stand, online, phone, reservation_walkin
  notes           TEXT,

  -- V2 stub columns
  notification_count INTEGER NOT NULL DEFAULT 0,
  last_notification_method TEXT,                -- sms, email, push (V2)
  confirmation_status TEXT,                    -- pending, confirmed, declined (V2)
  estimated_arrival_at TIMESTAMP WITH TIME ZONE, -- for call-ahead (V2)

  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ── Reservations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fnb_reservations (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  location_id     TEXT NOT NULL REFERENCES locations(id),

  -- Guest info
  guest_name      TEXT NOT NULL,
  guest_phone     TEXT,
  guest_email     TEXT,
  party_size      INTEGER NOT NULL DEFAULT 2,

  -- Reservation timing
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  end_time        TIME,                        -- computed: reservation_time + duration

  -- Status lifecycle: confirmed → checked_in → seated → completed → no_show → canceled
  status          TEXT NOT NULL DEFAULT 'confirmed',

  -- Preferences
  seating_preference TEXT,                     -- indoor, outdoor, bar, patio, window, booth, any
  special_requests TEXT,
  occasion        TEXT,                        -- birthday, anniversary, business, date_night, celebration
  is_vip          BOOLEAN NOT NULL DEFAULT FALSE,
  vip_note        TEXT,

  -- Customer link
  customer_id     TEXT,
  customer_visit_count INTEGER DEFAULT 0,

  -- Table assignment (pre-assigned or at check-in)
  assigned_table_id TEXT,                      -- FK stub to fnb_tables
  assigned_server_user_id TEXT,

  -- Seating result
  seated_at       TIMESTAMP WITH TIME ZONE,
  tab_id          TEXT,                        -- FK stub to fnb_tabs
  waitlist_entry_id TEXT,                      -- if moved to waitlist at check-in

  -- Confirmation
  confirmed_at    TIMESTAMP WITH TIME ZONE,
  canceled_at     TIMESTAMP WITH TIME ZONE,
  cancel_reason   TEXT,
  no_show_at      TIMESTAMP WITH TIME ZONE,

  -- Source & channel
  source          TEXT NOT NULL DEFAULT 'host_stand', -- host_stand, online, phone, google, third_party
  external_booking_id TEXT,                    -- third-party reference (V2)
  channel         TEXT,                        -- website, google, yelp, opentable (V2)

  -- Confirmation notifications (V2)
  confirmation_sent_at TIMESTAMP WITH TIME ZONE,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  reminder_count  INTEGER NOT NULL DEFAULT 0,

  -- V2 stub: deposit/prepayment
  deposit_amount_cents INTEGER,
  deposit_status  TEXT,                        -- pending, captured, refunded (V2)

  notes           TEXT,

  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by      TEXT
);

-- ── Host Stand Settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fnb_host_settings (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  location_id     TEXT NOT NULL REFERENCES locations(id),

  -- Wait time estimation
  default_turn_time_minutes INTEGER NOT NULL DEFAULT 60,
  wait_time_method TEXT NOT NULL DEFAULT 'historical', -- historical, manual, hybrid
  wait_time_buffer_minutes INTEGER NOT NULL DEFAULT 5,

  -- Seating rules
  auto_assign_server BOOLEAN NOT NULL DEFAULT TRUE,
  rotation_mode   TEXT NOT NULL DEFAULT 'round_robin',  -- round_robin, cover_balance, manual
  max_wait_minutes INTEGER NOT NULL DEFAULT 120,
  auto_no_show_minutes INTEGER NOT NULL DEFAULT 15,      -- mark no-show after N minutes past reservation time

  -- Reservation settings
  reservation_slot_interval_minutes INTEGER NOT NULL DEFAULT 15,
  max_party_size  INTEGER NOT NULL DEFAULT 20,
  min_advance_hours INTEGER NOT NULL DEFAULT 1,          -- minimum advance booking time
  max_advance_days INTEGER NOT NULL DEFAULT 60,          -- how far ahead can book
  default_reservation_duration_minutes INTEGER NOT NULL DEFAULT 90,
  allow_online_reservations BOOLEAN NOT NULL DEFAULT FALSE, -- V2
  allow_online_waitlist BOOLEAN NOT NULL DEFAULT FALSE,     -- V2
  require_phone_for_waitlist BOOLEAN NOT NULL DEFAULT FALSE,
  require_phone_for_reservation BOOLEAN NOT NULL DEFAULT TRUE,

  -- Capacity management
  overbooking_percentage INTEGER NOT NULL DEFAULT 0,     -- allow N% overbooking
  pacing_max_covers_per_slot INTEGER,                    -- max covers per 15-min slot

  -- Notification templates (V2)
  sms_waitlist_added_template TEXT DEFAULT 'Hi {{guestName}}, you''re on the waitlist at {{restaurantName}}. Estimated wait: {{waitMinutes}} min. We''ll text you when your table is ready!',
  sms_table_ready_template TEXT DEFAULT 'Hi {{guestName}}, your table is ready at {{restaurantName}}! Please check in with the host within 5 minutes.',
  sms_reservation_confirmation_template TEXT DEFAULT 'Reservation confirmed at {{restaurantName}} for {{partySize}} on {{date}} at {{time}}. Reply C to cancel.',
  sms_reservation_reminder_template TEXT DEFAULT 'Reminder: Your reservation at {{restaurantName}} is {{timeUntil}}. {{partySize}} guests at {{time}}. Reply C to cancel.',

  -- Display settings
  show_wait_times_to_guests BOOLEAN NOT NULL DEFAULT TRUE,
  show_queue_position BOOLEAN NOT NULL DEFAULT FALSE,
  floor_plan_default_view TEXT NOT NULL DEFAULT 'layout', -- layout, grid, list

  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT uq_fnb_host_settings_tenant_location UNIQUE (tenant_id, location_id)
);

-- ── Wait Time History (for estimation algorithm) ────────────────────
CREATE TABLE IF NOT EXISTS fnb_wait_time_history (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  location_id     TEXT NOT NULL REFERENCES locations(id),
  business_date   DATE NOT NULL,

  party_size      INTEGER NOT NULL,
  quoted_wait_minutes INTEGER,
  actual_wait_minutes INTEGER NOT NULL,
  seating_preference TEXT,
  day_of_week     INTEGER NOT NULL,            -- 0=Sunday, 6=Saturday
  hour_of_day     INTEGER NOT NULL,            -- 0-23
  was_reservation BOOLEAN NOT NULL DEFAULT FALSE,

  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────

-- Waitlist indexes
CREATE INDEX IF NOT EXISTS idx_fnb_waitlist_tenant_location_date_status
  ON fnb_waitlist_entries (tenant_id, location_id, business_date, status);

CREATE INDEX IF NOT EXISTS idx_fnb_waitlist_tenant_status_position
  ON fnb_waitlist_entries (tenant_id, location_id, status, priority DESC, position ASC)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_fnb_waitlist_customer
  ON fnb_waitlist_entries (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fnb_waitlist_phone
  ON fnb_waitlist_entries (tenant_id, guest_phone)
  WHERE guest_phone IS NOT NULL;

-- Reservation indexes
CREATE INDEX IF NOT EXISTS idx_fnb_reservations_tenant_date_status
  ON fnb_reservations (tenant_id, location_id, reservation_date, status);

CREATE INDEX IF NOT EXISTS idx_fnb_reservations_tenant_date_time
  ON fnb_reservations (tenant_id, location_id, reservation_date, reservation_time);

CREATE INDEX IF NOT EXISTS idx_fnb_reservations_customer
  ON fnb_reservations (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fnb_reservations_phone
  ON fnb_reservations (tenant_id, guest_phone)
  WHERE guest_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fnb_reservations_upcoming
  ON fnb_reservations (tenant_id, location_id, reservation_date, reservation_time)
  WHERE status IN ('confirmed', 'checked_in');

-- Wait time history indexes
CREATE INDEX IF NOT EXISTS idx_fnb_wait_time_history_estimation
  ON fnb_wait_time_history (tenant_id, location_id, day_of_week, hour_of_day, party_size);

CREATE INDEX IF NOT EXISTS idx_fnb_wait_time_history_date
  ON fnb_wait_time_history (tenant_id, location_id, business_date);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE fnb_waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_waitlist_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE fnb_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_reservations FORCE ROW LEVEL SECURITY;

ALTER TABLE fnb_host_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_host_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE fnb_wait_time_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_wait_time_history FORCE ROW LEVEL SECURITY;

-- Waitlist RLS policies
DO $$ BEGIN
  DROP POLICY IF EXISTS fnb_waitlist_entries_select ON fnb_waitlist_entries;
  CREATE POLICY fnb_waitlist_entries_select ON fnb_waitlist_entries
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_waitlist_entries_insert ON fnb_waitlist_entries;
  CREATE POLICY fnb_waitlist_entries_insert ON fnb_waitlist_entries
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_waitlist_entries_update ON fnb_waitlist_entries;
  CREATE POLICY fnb_waitlist_entries_update ON fnb_waitlist_entries
    FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_waitlist_entries_delete ON fnb_waitlist_entries;
  CREATE POLICY fnb_waitlist_entries_delete ON fnb_waitlist_entries
    FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END $$;

-- Reservation RLS policies
DO $$ BEGIN
  DROP POLICY IF EXISTS fnb_reservations_select ON fnb_reservations;
  CREATE POLICY fnb_reservations_select ON fnb_reservations
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_reservations_insert ON fnb_reservations;
  CREATE POLICY fnb_reservations_insert ON fnb_reservations
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_reservations_update ON fnb_reservations;
  CREATE POLICY fnb_reservations_update ON fnb_reservations
    FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_reservations_delete ON fnb_reservations;
  CREATE POLICY fnb_reservations_delete ON fnb_reservations
    FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END $$;

-- Host settings RLS policies
DO $$ BEGIN
  DROP POLICY IF EXISTS fnb_host_settings_select ON fnb_host_settings;
  CREATE POLICY fnb_host_settings_select ON fnb_host_settings
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_host_settings_insert ON fnb_host_settings;
  CREATE POLICY fnb_host_settings_insert ON fnb_host_settings
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_host_settings_update ON fnb_host_settings;
  CREATE POLICY fnb_host_settings_update ON fnb_host_settings
    FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END $$;

-- Wait time history RLS policies
DO $$ BEGIN
  DROP POLICY IF EXISTS fnb_wait_time_history_select ON fnb_wait_time_history;
  CREATE POLICY fnb_wait_time_history_select ON fnb_wait_time_history
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS fnb_wait_time_history_insert ON fnb_wait_time_history;
  CREATE POLICY fnb_wait_time_history_insert ON fnb_wait_time_history
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END $$;
