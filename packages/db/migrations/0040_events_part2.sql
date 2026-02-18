-- Migration: 0040_events_part2
-- Events golf domain (part 2): golfers, registration order lines, event order lines,
-- payments, schedules, schedule resources, timeline venue schedules, terminal locations,
-- type departments, type meals, golf league profiles, golf league fee types,
-- golf league checkins, golf league golfer details, golf outing profiles

-- ══════════════════════════════════════════════════════════════════
-- EVENTS GOLF DOMAIN (PART 2)
-- ══════════════════════════════════════════════════════════════════

-- ── event_golfers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_golfers (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  event_id        TEXT NOT NULL,
  customer_id     TEXT,
  fee_type_id     TEXT,
  fee_price_cents INTEGER NOT NULL DEFAULT 0,
  source          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_golfers_tenant_event ON event_golfers (tenant_id, event_id);

ALTER TABLE event_golfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_golfers_select ON event_golfers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_golfers_insert ON event_golfers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_golfers_update ON event_golfers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_golfers_delete ON event_golfers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_registration_order_lines ───────────────────────────────
CREATE TABLE IF NOT EXISTS event_registration_order_lines (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  event_id              TEXT NOT NULL,
  customer_id           TEXT,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  amount_cents          INTEGER NOT NULL DEFAULT 0,
  order_line_id         TEXT,
  order_id              TEXT,
  event_registration_id TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_registration_order_lines_tenant_event ON event_registration_order_lines (tenant_id, event_id);

ALTER TABLE event_registration_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_registration_order_lines_select ON event_registration_order_lines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_registration_order_lines_insert ON event_registration_order_lines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_registration_order_lines_update ON event_registration_order_lines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_registration_order_lines_delete ON event_registration_order_lines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_order_lines ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_order_lines (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  event_id    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_order_lines_tenant_event ON event_order_lines (tenant_id, event_id);

ALTER TABLE event_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_order_lines_select ON event_order_lines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_order_lines_insert ON event_order_lines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_order_lines_update ON event_order_lines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_order_lines_delete ON event_order_lines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_payments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_payments (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  event_id              TEXT NOT NULL,
  customer_id           TEXT,
  payment_type          TEXT NOT NULL,
  payment_status        TEXT NOT NULL DEFAULT 'pending',
  amount_cents          INTEGER NOT NULL DEFAULT 0,
  transaction_reference TEXT,
  paid_at               TIMESTAMPTZ,
  online_fee_type_id    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_payments_tenant_event ON event_payments (tenant_id, event_id);

ALTER TABLE event_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_payments_select ON event_payments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_payments_insert ON event_payments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_payments_update ON event_payments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_payments_delete ON event_payments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_schedules ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_schedules (
  id             TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  event_id       TEXT NOT NULL,
  schedule_date  DATE NOT NULL,
  hole_group     TEXT,
  start_time     TIME,
  end_time       TIME,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_schedules_tenant_event_date ON event_schedules (tenant_id, event_id, schedule_date);

ALTER TABLE event_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_schedules_select ON event_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_schedules_insert ON event_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_schedules_update ON event_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_schedules_delete ON event_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_schedule_resources ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_schedule_resources (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  event_id          TEXT NOT NULL,
  event_schedule_id TEXT NOT NULL,
  resource_type_id  TEXT,
  resource_id       TEXT,
  course_id         TEXT,
  start_date        DATE,
  start_time        TIME,
  end_date          DATE,
  end_time          TIME,
  hole_groups       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_schedule_resources_tenant_event ON event_schedule_resources (tenant_id, event_id);

ALTER TABLE event_schedule_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_schedule_resources_select ON event_schedule_resources FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_schedule_resources_insert ON event_schedule_resources FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_schedule_resources_update ON event_schedule_resources FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_schedule_resources_delete ON event_schedule_resources FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_timeline_venue_schedules ───────────────────────────────
CREATE TABLE IF NOT EXISTS event_timeline_venue_schedules (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  event_id            TEXT NOT NULL,
  event_timeline_id   TEXT NOT NULL,
  venue_id            TEXT NOT NULL,
  venue_schedule_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_timeline_venue_schedules_tenant_event ON event_timeline_venue_schedules (tenant_id, event_id);

ALTER TABLE event_timeline_venue_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_timeline_venue_schedules_select ON event_timeline_venue_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_timeline_venue_schedules_insert ON event_timeline_venue_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_timeline_venue_schedules_update ON event_timeline_venue_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_timeline_venue_schedules_delete ON event_timeline_venue_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_terminal_locations ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_terminal_locations (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  event_id              TEXT NOT NULL,
  terminal_location_id  TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_terminal_locations_tenant_event_terminal
  ON event_terminal_locations (tenant_id, event_id, terminal_location_id);

ALTER TABLE event_terminal_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_terminal_locations_select ON event_terminal_locations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_terminal_locations_insert ON event_terminal_locations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_terminal_locations_update ON event_terminal_locations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_terminal_locations_delete ON event_terminal_locations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_type_departments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_type_departments (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  event_type            TEXT NOT NULL,
  title                 TEXT NOT NULL,
  default_instructions  TEXT,
  display_sequence      INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_type_departments_tenant_type ON event_type_departments (tenant_id, event_type);

ALTER TABLE event_type_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_type_departments_select ON event_type_departments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_type_departments_insert ON event_type_departments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_type_departments_update ON event_type_departments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_type_departments_delete ON event_type_departments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_type_meals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_type_meals (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  event_type  TEXT NOT NULL,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_type_meals_tenant_type ON event_type_meals (tenant_id, event_type);

ALTER TABLE event_type_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_type_meals_select ON event_type_meals FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_type_meals_insert ON event_type_meals FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_type_meals_update ON event_type_meals FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_type_meals_delete ON event_type_meals FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── golf_league_profiles ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS golf_league_profiles (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  event_id                        TEXT NOT NULL,
  first_week_hole_group           TEXT,
  rotate_front_and_back           BOOLEAN NOT NULL DEFAULT false,
  weekly_occurrence               TEXT,
  rotate_hole_group               TEXT,
  first_instance_selected_courses JSONB,
  rotation_selected_courses       JSONB,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_golf_league_profiles_tenant_event
  ON golf_league_profiles (tenant_id, event_id);

ALTER TABLE golf_league_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY golf_league_profiles_select ON golf_league_profiles FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_profiles_insert ON golf_league_profiles FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_profiles_update ON golf_league_profiles FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_profiles_delete ON golf_league_profiles FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── golf_league_fee_types ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS golf_league_fee_types (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  event_id              TEXT NOT NULL,
  title                 TEXT NOT NULL,
  total_golfers         INTEGER,
  price_per_golfer_cents INTEGER,
  includes_cart         BOOLEAN NOT NULL DEFAULT false,
  price_per_cart_cents  INTEGER,
  tax_per_golfer_cents  INTEGER,
  tax_percentage        NUMERIC(5,2),
  gratuity_applicable   BOOLEAN NOT NULL DEFAULT false,
  available_online      BOOLEAN NOT NULL DEFAULT false,
  tax_exempt            BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_league_fee_types_tenant_event ON golf_league_fee_types (tenant_id, event_id);

ALTER TABLE golf_league_fee_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY golf_league_fee_types_select ON golf_league_fee_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_fee_types_insert ON golf_league_fee_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_fee_types_update ON golf_league_fee_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_fee_types_delete ON golf_league_fee_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── golf_league_checkins ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS golf_league_checkins (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  event_id                TEXT NOT NULL,
  golf_league_fee_type_id TEXT,
  customer_id             TEXT,
  total_cents             INTEGER NOT NULL DEFAULT 0,
  tax_cents               INTEGER NOT NULL DEFAULT 0,
  green_fee_cents         INTEGER NOT NULL DEFAULT 0,
  cart_fee_cents          INTEGER NOT NULL DEFAULT 0,
  includes_cart           BOOLEAN NOT NULL DEFAULT false,
  checkin_date            DATE NOT NULL,
  order_id                TEXT,
  order_line_id           TEXT,
  event_schedule_id       TEXT,
  event_golfer_id         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_league_checkins_tenant_event_date ON golf_league_checkins (tenant_id, event_id, checkin_date);

ALTER TABLE golf_league_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY golf_league_checkins_select ON golf_league_checkins FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_checkins_insert ON golf_league_checkins FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_checkins_update ON golf_league_checkins FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_checkins_delete ON golf_league_checkins FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── golf_league_golfer_details ───────────────────────────────────
CREATE TABLE IF NOT EXISTS golf_league_golfer_details (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  event_id              TEXT NOT NULL,
  golfers_per_week      INTEGER,
  price_per_golfer_cents INTEGER,
  includes_cart         BOOLEAN NOT NULL DEFAULT false,
  total_carts           INTEGER,
  price_per_cart_cents  INTEGER,
  remarks               TEXT,
  number_of_weeks       INTEGER,
  pre_league_fees_cents INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_golf_league_golfer_details_tenant_event
  ON golf_league_golfer_details (tenant_id, event_id);

ALTER TABLE golf_league_golfer_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY golf_league_golfer_details_select ON golf_league_golfer_details FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_golfer_details_insert ON golf_league_golfer_details FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_golfer_details_update ON golf_league_golfer_details FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_league_golfer_details_delete ON golf_league_golfer_details FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── golf_outing_profiles ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS golf_outing_profiles (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  event_id              TEXT NOT NULL,
  hole_groups           TEXT,
  courses               TEXT,
  selected_courses      JSONB,
  total_golfers         INTEGER,
  price_per_golfer_cents INTEGER,
  includes_cart         BOOLEAN NOT NULL DEFAULT false,
  total_carts           INTEGER,
  price_per_cart_cents  INTEGER,
  remarks               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_golf_outing_profiles_tenant_event
  ON golf_outing_profiles (tenant_id, event_id);

ALTER TABLE golf_outing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY golf_outing_profiles_select ON golf_outing_profiles FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_outing_profiles_insert ON golf_outing_profiles FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_outing_profiles_update ON golf_outing_profiles FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_outing_profiles_delete ON golf_outing_profiles FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
