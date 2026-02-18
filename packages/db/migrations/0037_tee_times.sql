-- Migration: 0037_tee_times
-- Tee times config domain: seasons, sheets, types, categories, pricing plans,
-- daily periods, overrides, order items, policies, sheet notes, promoted slots,
-- rotation schedules, blocked slots, blocked slot repetitions, shotgun starts

-- ══════════════════════════════════════════════════════════════════
-- TEE TIMES CONFIG DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── tee_seasons ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_seasons (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  course_id             TEXT NOT NULL,
  title                 TEXT NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  cart_price_9_cents    INTEGER,
  cart_price_18_cents   INTEGER,
  position              INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_seasons_tenant_course ON tee_seasons (tenant_id, course_id);

ALTER TABLE tee_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_seasons_select ON tee_seasons FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_seasons_insert ON tee_seasons FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_seasons_update ON tee_seasons FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_seasons_delete ON tee_seasons FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_sheets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_sheets (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  course_id         TEXT NOT NULL,
  tee_season_id     TEXT REFERENCES tee_seasons(id),
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  interval_minutes  INTEGER NOT NULL DEFAULT 10,
  monday            BOOLEAN NOT NULL DEFAULT true,
  tuesday           BOOLEAN NOT NULL DEFAULT true,
  wednesday         BOOLEAN NOT NULL DEFAULT true,
  thursday          BOOLEAN NOT NULL DEFAULT true,
  friday            BOOLEAN NOT NULL DEFAULT true,
  saturday          BOOLEAN NOT NULL DEFAULT true,
  sunday            BOOLEAN NOT NULL DEFAULT true,
  interval_type     TEXT DEFAULT 'fixed',
  interval_value_1  INTEGER,
  interval_value_2  INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_sheets_tenant_course_season ON tee_sheets (tenant_id, course_id, tee_season_id);

ALTER TABLE tee_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_sheets_select ON tee_sheets FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_sheets_insert ON tee_sheets FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_sheets_update ON tee_sheets FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_sheets_delete ON tee_sheets FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_types ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_types (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  course_id           TEXT NOT NULL,
  tee_season_id       TEXT REFERENCES tee_seasons(id),
  title               TEXT NOT NULL,
  includes_cart       BOOLEAN NOT NULL DEFAULT false,
  season_position     INTEGER NOT NULL DEFAULT 0,
  weekend_only        BOOLEAN NOT NULL DEFAULT false,
  valid_on_weekends   BOOLEAN NOT NULL DEFAULT true,
  valid_on_weekdays   BOOLEAN NOT NULL DEFAULT true,
  available_online    BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_types_tenant_course ON tee_types (tenant_id, course_id);

ALTER TABLE tee_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_types_select ON tee_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_types_insert ON tee_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_types_update ON tee_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_types_delete ON tee_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_categories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_categories (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  course_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tee_categories_tenant_course_title
  ON tee_categories (tenant_id, course_id, title);

ALTER TABLE tee_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_categories_select ON tee_categories FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_categories_insert ON tee_categories FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_categories_update ON tee_categories FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_categories_delete ON tee_categories FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_daily_periods ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_daily_periods (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL,
  tee_season_id   TEXT REFERENCES tee_seasons(id),
  title           TEXT NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_daily_periods_tenant_course ON tee_daily_periods (tenant_id, course_id);

ALTER TABLE tee_daily_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_daily_periods_select ON tee_daily_periods FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_daily_periods_insert ON tee_daily_periods FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_daily_periods_update ON tee_daily_periods FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_daily_periods_delete ON tee_daily_periods FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_pricing_plans ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_pricing_plans (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  course_id             TEXT NOT NULL,
  tee_season_id         TEXT REFERENCES tee_seasons(id),
  tee_type_id           TEXT REFERENCES tee_types(id),
  tee_category_id       TEXT REFERENCES tee_categories(id),
  tee_daily_period_id   TEXT,
  hole_rate_9_cents     INTEGER,
  hole_rate_18_cents    INTEGER,
  start_time            TIME,
  end_time              TIME,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_pricing_plans_tenant_course_type ON tee_pricing_plans (tenant_id, course_id, tee_type_id);

ALTER TABLE tee_pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_pricing_plans_select ON tee_pricing_plans FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_pricing_plans_insert ON tee_pricing_plans FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_pricing_plans_update ON tee_pricing_plans FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_pricing_plans_delete ON tee_pricing_plans FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_time_overrides ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_time_overrides (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  course_id   TEXT NOT NULL,
  title       TEXT,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_time_overrides_tenant_course_start ON tee_time_overrides (tenant_id, course_id, start_date);

ALTER TABLE tee_time_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_time_overrides_select ON tee_time_overrides FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_overrides_insert ON tee_time_overrides FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_overrides_update ON tee_time_overrides FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_overrides_delete ON tee_time_overrides FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_time_order_items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_time_order_items (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  order_id            TEXT NOT NULL,
  tee_booking_id      TEXT,
  tee_season_id       TEXT,
  tee_type_id         TEXT,
  tee_category_id     TEXT,
  tee_season_title    TEXT,
  tee_type_title      TEXT,
  tee_category_title  TEXT,
  holes               INTEGER,
  price_cents         INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_time_order_items_tenant_order ON tee_time_order_items (tenant_id, order_id);

ALTER TABLE tee_time_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_time_order_items_select ON tee_time_order_items FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_order_items_insert ON tee_time_order_items FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_order_items_update ON tee_time_order_items FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_order_items_delete ON tee_time_order_items FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_time_policies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_time_policies (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  course_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_time_policies_tenant_course ON tee_time_policies (tenant_id, course_id);

ALTER TABLE tee_time_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_time_policies_select ON tee_time_policies FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_policies_insert ON tee_time_policies FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_policies_update ON tee_time_policies FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_policies_delete ON tee_time_policies FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_sheet_notes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_sheet_notes (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL,
  note_type       TEXT NOT NULL DEFAULT 'tee_sheet',
  note            TEXT NOT NULL,
  note_start_date DATE,
  note_end_date   DATE,
  monday          BOOLEAN NOT NULL DEFAULT false,
  tuesday         BOOLEAN NOT NULL DEFAULT false,
  wednesday       BOOLEAN NOT NULL DEFAULT false,
  thursday        BOOLEAN NOT NULL DEFAULT false,
  friday          BOOLEAN NOT NULL DEFAULT false,
  saturday        BOOLEAN NOT NULL DEFAULT false,
  sunday          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_sheet_notes_tenant_course_type ON tee_sheet_notes (tenant_id, course_id, note_type);

ALTER TABLE tee_sheet_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_sheet_notes_select ON tee_sheet_notes FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_sheet_notes_insert ON tee_sheet_notes FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_sheet_notes_update ON tee_sheet_notes FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_sheet_notes_delete ON tee_sheet_notes FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_promoted_slots ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_promoted_slots (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  course_id             TEXT NOT NULL,
  tee_date              DATE NOT NULL,
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  discount_percentage   NUMERIC(5,2),
  hole_group            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_promoted_slots_tenant_course_date ON tee_promoted_slots (tenant_id, course_id, tee_date);

ALTER TABLE tee_promoted_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_promoted_slots_select ON tee_promoted_slots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_promoted_slots_insert ON tee_promoted_slots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_promoted_slots_update ON tee_promoted_slots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_promoted_slots_delete ON tee_promoted_slots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_rotation_schedules ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_rotation_schedules (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  monday          BOOLEAN NOT NULL DEFAULT false,
  tuesday         BOOLEAN NOT NULL DEFAULT false,
  wednesday       BOOLEAN NOT NULL DEFAULT false,
  thursday        BOOLEAN NOT NULL DEFAULT false,
  friday          BOOLEAN NOT NULL DEFAULT false,
  saturday        BOOLEAN NOT NULL DEFAULT false,
  sunday          BOOLEAN NOT NULL DEFAULT false,
  first_tee       TEXT,
  tenth_tee       TEXT,
  nineteenth_tee  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_rotation_schedules_tenant_course_start ON tee_rotation_schedules (tenant_id, course_id, start_date);

ALTER TABLE tee_rotation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_rotation_schedules_select ON tee_rotation_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_rotation_schedules_insert ON tee_rotation_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_rotation_schedules_update ON tee_rotation_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_rotation_schedules_delete ON tee_rotation_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_blocked_slots ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_blocked_slots (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  course_id                 TEXT NOT NULL,
  tee_date                  DATE NOT NULL,
  start_time                TIME NOT NULL,
  end_time                  TIME NOT NULL,
  description               TEXT,
  hole_group                TEXT,
  event_id                  TEXT,
  block_type                TEXT NOT NULL DEFAULT 'manual',
  repetition_id             TEXT,
  reservation_resource_id   TEXT,
  tee_booking_id            TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_blocked_slots_tenant_course_date ON tee_blocked_slots (tenant_id, course_id, tee_date);

ALTER TABLE tee_blocked_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_blocked_slots_select ON tee_blocked_slots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_blocked_slots_insert ON tee_blocked_slots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_blocked_slots_update ON tee_blocked_slots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_blocked_slots_delete ON tee_blocked_slots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tee_blocked_slot_repetitions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tee_blocked_slot_repetitions (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  course_id                 TEXT NOT NULL,
  tee_date                  DATE NOT NULL,
  start_time                TIME NOT NULL,
  end_time                  TIME NOT NULL,
  description               TEXT,
  hole_group                TEXT,
  event_id                  TEXT,
  reservation_resource_id   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tee_blocked_slot_repetitions_tenant_course ON tee_blocked_slot_repetitions (tenant_id, course_id);

ALTER TABLE tee_blocked_slot_repetitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tee_blocked_slot_repetitions_select ON tee_blocked_slot_repetitions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_blocked_slot_repetitions_insert ON tee_blocked_slot_repetitions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_blocked_slot_repetitions_update ON tee_blocked_slot_repetitions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_blocked_slot_repetitions_delete ON tee_blocked_slot_repetitions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── shotgun_starts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shotgun_starts (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  course_id             TEXT NOT NULL,
  tee_date              DATE NOT NULL,
  title                 TEXT NOT NULL,
  kick_off_time         TIME NOT NULL,
  holes                 INTEGER NOT NULL DEFAULT 18,
  foursomes_per_hole    INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shotgun_starts_tenant_course_date ON shotgun_starts (tenant_id, course_id, tee_date);

ALTER TABLE shotgun_starts ENABLE ROW LEVEL SECURITY;

CREATE POLICY shotgun_starts_select ON shotgun_starts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY shotgun_starts_insert ON shotgun_starts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY shotgun_starts_update ON shotgun_starts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY shotgun_starts_delete ON shotgun_starts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
