-- Migration: 0038_tee_bookings
-- Tee times bookings domain: bookings, slots, players, order lines,
-- payments, repetitions, shotgun starts, group bookings

-- ══════════════════════════════════════════════════════════════════
-- TEE BOOKINGS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── tee_bookings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_bookings (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  course_id                 TEXT NOT NULL,
  tee_date                  DATE NOT NULL,
  holes                     INTEGER NOT NULL DEFAULT 18,
  players                   INTEGER NOT NULL DEFAULT 1,
  carts                     INTEGER NOT NULL DEFAULT 0,
  check_in_status           TEXT NOT NULL DEFAULT 'pending',
  order_id                  TEXT,
  cart_total_cents           INTEGER NOT NULL DEFAULT 0,
  booking_total_cents        INTEGER NOT NULL DEFAULT 0,
  payment_status            TEXT NOT NULL DEFAULT 'unpaid',
  booking_source            TEXT NOT NULL DEFAULT 'manual',
  is_valid                  BOOLEAN NOT NULL DEFAULT true,
  notes                     TEXT,
  booking_clerk_name        TEXT,
  terminal_id               TEXT,
  repetition_id             TEXT,
  prepaid_amount_cents       INTEGER NOT NULL DEFAULT 0,
  partner_code              TEXT,
  commission_amount_cents    INTEGER NOT NULL DEFAULT 0,
  prepaid_tax_cents          INTEGER NOT NULL DEFAULT 0,
  commission_tax_cents       INTEGER NOT NULL DEFAULT 0,
  cancelled_at              TIMESTAMPTZ,
  cancelled_by              TEXT,
  primary_reservation_id    TEXT,
  no_show                   BOOLEAN NOT NULL DEFAULT false,
  lottery_request_id        TEXT,
  is_in_lottery_wait_list   BOOLEAN NOT NULL DEFAULT false,
  is_squeezed               BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_bookings_tenant_course_date ON tee_bookings (tenant_id, course_id, tee_date);
CREATE INDEX IF NOT EXISTS idx_tee_bookings_tenant_order ON tee_bookings (tenant_id, order_id) WHERE order_id IS NOT NULL;

ALTER TABLE tee_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_bookings_select ON tee_bookings FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_bookings_insert ON tee_bookings FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_bookings_update ON tee_bookings FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_bookings_delete ON tee_bookings FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_slots ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_booking_slots (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  tee_booking_id            TEXT NOT NULL REFERENCES tee_bookings(id) ON DELETE CASCADE,
  hole_group                TEXT NOT NULL,
  start_time                TIME NOT NULL,
  end_time                  TIME NOT NULL,
  starter_check_time        TIME,
  starter_check_in_status   TEXT,
  hole_group_end_time       TIME,
  reservation_resource_id   TEXT,
  buffer_interval_minutes   INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_slots_tenant_booking ON tee_booking_slots (tenant_id, tee_booking_id);

ALTER TABLE tee_booking_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_slots_select ON tee_booking_slots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_slots_insert ON tee_booking_slots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_slots_update ON tee_booking_slots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_slots_delete ON tee_booking_slots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_players ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_booking_players (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  tee_booking_id            TEXT NOT NULL REFERENCES tee_bookings(id) ON DELETE CASCADE,
  customer_id               TEXT,
  first_name                TEXT,
  last_name                 TEXT,
  email                     TEXT,
  mobile_no                 TEXT,
  is_organiser              BOOLEAN NOT NULL DEFAULT false,
  tee_pricing_plan_id       TEXT,
  price_cents               INTEGER NOT NULL DEFAULT 0,
  unit_price_cents          INTEGER NOT NULL DEFAULT 0,
  unit_list_price_cents     INTEGER NOT NULL DEFAULT 0,
  discount_amount_cents     INTEGER NOT NULL DEFAULT 0,
  tax_amount_cents          INTEGER NOT NULL DEFAULT 0,
  is_anonymous              BOOLEAN NOT NULL DEFAULT false,
  check_in_status           TEXT NOT NULL DEFAULT 'pending',
  payment_status            TEXT NOT NULL DEFAULT 'unpaid',
  order_id                  TEXT,
  order_line_id             TEXT,
  cart_number               TEXT,
  class_rule_id             TEXT,
  rack_rate_id              TEXT,
  notes                     TEXT,
  punch_card_rate_id        TEXT,
  rate_override_rule_id     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_players_tenant_booking ON tee_booking_players (tenant_id, tee_booking_id);
CREATE INDEX IF NOT EXISTS idx_tee_booking_players_tenant_customer ON tee_booking_players (tenant_id, customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE tee_booking_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_players_select ON tee_booking_players FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_players_insert ON tee_booking_players FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_players_update ON tee_booking_players FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_players_delete ON tee_booking_players FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_order_lines ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_booking_order_lines (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  tee_booking_id            TEXT NOT NULL REFERENCES tee_bookings(id) ON DELETE CASCADE,
  tee_booking_player_id     TEXT,
  customer_id               TEXT,
  first_name                TEXT,
  last_name                 TEXT,
  email                     TEXT,
  mobile_no                 TEXT,
  is_organiser              BOOLEAN NOT NULL DEFAULT false,
  tee_pricing_plan_id       TEXT,
  price_cents               INTEGER NOT NULL DEFAULT 0,
  unit_price_cents          INTEGER NOT NULL DEFAULT 0,
  unit_list_price_cents     INTEGER NOT NULL DEFAULT 0,
  discount_amount_cents     INTEGER NOT NULL DEFAULT 0,
  tax_amount_cents          INTEGER NOT NULL DEFAULT 0,
  is_anonymous              BOOLEAN NOT NULL DEFAULT false,
  check_in_status           TEXT,
  payment_status            TEXT,
  order_id                  TEXT,
  order_line_id             TEXT,
  cart_number               TEXT,
  class_rule_id             TEXT,
  rack_rate_id              TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_order_lines_tenant_booking ON tee_booking_order_lines (tenant_id, tee_booking_id);

ALTER TABLE tee_booking_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_order_lines_select ON tee_booking_order_lines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_order_lines_insert ON tee_booking_order_lines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_order_lines_update ON tee_booking_order_lines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_order_lines_delete ON tee_booking_order_lines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_payments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_booking_payments (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  tee_booking_id            TEXT NOT NULL REFERENCES tee_bookings(id) ON DELETE CASCADE,
  payment_method_id         TEXT,
  wallet_id                 TEXT,
  tee_booking_player_id     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_payments_tenant_booking ON tee_booking_payments (tenant_id, tee_booking_id);

ALTER TABLE tee_booking_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_payments_select ON tee_booking_payments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_payments_insert ON tee_booking_payments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_payments_update ON tee_booking_payments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_payments_delete ON tee_booking_payments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_repetitions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_booking_repetitions (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  course_id                 TEXT NOT NULL,
  holes                     INTEGER NOT NULL DEFAULT 18,
  players                   INTEGER NOT NULL DEFAULT 1,
  booking_total_cents        INTEGER NOT NULL DEFAULT 0,
  booking_source            TEXT NOT NULL DEFAULT 'manual',
  notes                     TEXT,
  booking_clerk_name        TEXT,
  terminal_id               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_repetitions_tenant_course ON tee_booking_repetitions (tenant_id, course_id);

ALTER TABLE tee_booking_repetitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_repetitions_select ON tee_booking_repetitions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetitions_insert ON tee_booking_repetitions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetitions_update ON tee_booking_repetitions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetitions_delete ON tee_booking_repetitions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_repetition_members ────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_booking_repetition_members (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  repetition_id             TEXT NOT NULL REFERENCES tee_booking_repetitions(id) ON DELETE CASCADE,
  customer_id               TEXT,
  first_name                TEXT,
  last_name                 TEXT,
  email                     TEXT,
  mobile_no                 TEXT,
  is_organiser              BOOLEAN NOT NULL DEFAULT false,
  tee_pricing_plan_id       TEXT,
  price_cents               INTEGER NOT NULL DEFAULT 0,
  is_anonymous              BOOLEAN NOT NULL DEFAULT false,
  rack_rate_id              TEXT,
  cart_number               TEXT,
  class_rule_id             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_repetition_members_tenant_rep ON tee_booking_repetition_members (tenant_id, repetition_id);

ALTER TABLE tee_booking_repetition_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_repetition_members_select ON tee_booking_repetition_members FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_members_insert ON tee_booking_repetition_members FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_members_update ON tee_booking_repetition_members FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_members_delete ON tee_booking_repetition_members FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_repetition_rules ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_booking_repetition_rules (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  repetition_id             TEXT NOT NULL REFERENCES tee_booking_repetitions(id) ON DELETE CASCADE,
  frequency                 TEXT NOT NULL,
  interval_value            INTEGER NOT NULL DEFAULT 1,
  interval_unit             TEXT NOT NULL DEFAULT 'week',
  start_date                DATE NOT NULL,
  end_date                  DATE,
  end_type                  TEXT NOT NULL DEFAULT 'date',
  max_occurrences           INTEGER,
  days_of_week              JSONB,
  monthly_repetition_type   TEXT,
  summary                   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_repetition_rules_tenant_rep ON tee_booking_repetition_rules (tenant_id, repetition_id);

ALTER TABLE tee_booking_repetition_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_repetition_rules_select ON tee_booking_repetition_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_rules_insert ON tee_booking_repetition_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_rules_update ON tee_booking_repetition_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_rules_delete ON tee_booking_repetition_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_repetition_rule_interpretations ───────────────────
CREATE TABLE IF NOT EXISTS tee_booking_repetition_rule_interpretations (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  repetition_id             TEXT NOT NULL REFERENCES tee_booking_repetitions(id) ON DELETE CASCADE,
  rule_id                   TEXT NOT NULL,
  first_occurrence_date     DATE NOT NULL,
  day_difference            INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_rep_rule_interps_tenant_rep ON tee_booking_repetition_rule_interpretations (tenant_id, repetition_id);

ALTER TABLE tee_booking_repetition_rule_interpretations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_repetition_rule_interpretations_select ON tee_booking_repetition_rule_interpretations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_rule_interpretations_insert ON tee_booking_repetition_rule_interpretations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_rule_interpretations_update ON tee_booking_repetition_rule_interpretations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_rule_interpretations_delete ON tee_booking_repetition_rule_interpretations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_booking_repetition_slots ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_booking_repetition_slots (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  repetition_id             TEXT NOT NULL REFERENCES tee_booking_repetitions(id) ON DELETE CASCADE,
  start_time                TIME NOT NULL,
  end_time                  TIME NOT NULL,
  hole_group                TEXT NOT NULL,
  reservation_resource_id   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_booking_repetition_slots_tenant_rep ON tee_booking_repetition_slots (tenant_id, repetition_id);

ALTER TABLE tee_booking_repetition_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_booking_repetition_slots_select ON tee_booking_repetition_slots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_slots_insert ON tee_booking_repetition_slots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_slots_update ON tee_booking_repetition_slots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_booking_repetition_slots_delete ON tee_booking_repetition_slots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── shotgun_start_slots ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shotgun_start_slots (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  shotgun_start_id          TEXT NOT NULL,
  start_time                TIME NOT NULL,
  end_time                  TIME NOT NULL,
  hole_group                TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shotgun_start_slots_tenant_shotgun ON shotgun_start_slots (tenant_id, shotgun_start_id);

ALTER TABLE shotgun_start_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY shotgun_start_slots_select ON shotgun_start_slots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY shotgun_start_slots_insert ON shotgun_start_slots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY shotgun_start_slots_update ON shotgun_start_slots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY shotgun_start_slots_delete ON shotgun_start_slots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_group_bookings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_group_bookings (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  course_id                 TEXT NOT NULL,
  tee_date                  DATE NOT NULL,
  customer_id               TEXT,
  players                   INTEGER NOT NULL DEFAULT 1,
  holes                     INTEGER NOT NULL DEFAULT 18,
  description               TEXT,
  payment_status            TEXT NOT NULL DEFAULT 'unpaid',
  booking_source            TEXT NOT NULL DEFAULT 'manual',
  check_in_status           TEXT NOT NULL DEFAULT 'pending',
  is_valid                  BOOLEAN NOT NULL DEFAULT true,
  note                      TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_group_bookings_tenant_course_date ON tee_group_bookings (tenant_id, course_id, tee_date);

ALTER TABLE tee_group_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_group_bookings_select ON tee_group_bookings FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_bookings_insert ON tee_group_bookings FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_bookings_update ON tee_group_bookings FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_bookings_delete ON tee_group_bookings FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_group_booking_checkins ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_group_booking_checkins (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  tee_group_booking_id      TEXT NOT NULL REFERENCES tee_group_bookings(id) ON DELETE CASCADE,
  order_id                  TEXT,
  order_line_id             TEXT,
  players                   INTEGER NOT NULL DEFAULT 1,
  total_cents               INTEGER NOT NULL DEFAULT 0,
  tax_cents                 INTEGER NOT NULL DEFAULT 0,
  discount_amount_cents     INTEGER NOT NULL DEFAULT 0,
  includes_cart             BOOLEAN NOT NULL DEFAULT false,
  pricing_option_id         TEXT,
  rack_rate_id              TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_group_booking_checkins_tenant_group ON tee_group_booking_checkins (tenant_id, tee_group_booking_id);

ALTER TABLE tee_group_booking_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_group_booking_checkins_select ON tee_group_booking_checkins FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_checkins_insert ON tee_group_booking_checkins FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_checkins_update ON tee_group_booking_checkins FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_checkins_delete ON tee_group_booking_checkins FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_group_booking_pricing_options ─────────────────────────────
CREATE TABLE IF NOT EXISTS tee_group_booking_pricing_options (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  tee_group_booking_id      TEXT,
  repetition_id             TEXT,
  price_cents               INTEGER NOT NULL,
  is_default                BOOLEAN NOT NULL DEFAULT false,
  includes_cart             BOOLEAN NOT NULL DEFAULT false,
  rack_rate_id              TEXT,
  group_id                  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_group_booking_pricing_opts_tenant_group ON tee_group_booking_pricing_options (tenant_id, tee_group_booking_id) WHERE tee_group_booking_id IS NOT NULL;

ALTER TABLE tee_group_booking_pricing_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_group_booking_pricing_options_select ON tee_group_booking_pricing_options FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_pricing_options_insert ON tee_group_booking_pricing_options FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_pricing_options_update ON tee_group_booking_pricing_options FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_pricing_options_delete ON tee_group_booking_pricing_options FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_group_booking_slots ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_group_booking_slots (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  tee_group_booking_id      TEXT,
  repetition_id             TEXT,
  start_time                TIME NOT NULL,
  end_time                  TIME NOT NULL,
  hole_group                TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_group_booking_slots_tenant_group ON tee_group_booking_slots (tenant_id, tee_group_booking_id) WHERE tee_group_booking_id IS NOT NULL;

ALTER TABLE tee_group_booking_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_group_booking_slots_select ON tee_group_booking_slots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_slots_insert ON tee_group_booking_slots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_slots_update ON tee_group_booking_slots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_group_booking_slots_delete ON tee_group_booking_slots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
