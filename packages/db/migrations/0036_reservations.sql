-- Migration: 0036_reservations
-- Reservations domain: resource types, resources, policies, rate override rules,
-- dependent blocks, on-demand availability schedules, online ordering schedules

-- ══════════════════════════════════════════════════════════════════
-- RESERVATIONS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── reservation_resource_types ──────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_resource_types (
  id                                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                             TEXT NOT NULL REFERENCES tenants(id),
  title                                 TEXT NOT NULL,
  chart_of_account_id                   TEXT,
  icon_id                               TEXT,
  available_online                      BOOLEAN NOT NULL DEFAULT false,
  booking_window_days                   INTEGER,
  online_booking_window_days            INTEGER,
  max_reservations_per_day_per_customer INTEGER,
  buffer_interval_minutes               INTEGER,
  tax_group_id                          TEXT,
  max_participants                      INTEGER,
  user_can_select_resources_online      BOOLEAN NOT NULL DEFAULT false,
  reservation_strategy                  TEXT DEFAULT 'first_available',
  reservation_policies                  TEXT,
  display_sequence                      INTEGER NOT NULL DEFAULT 0,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_resource_types_tenant ON reservation_resource_types (tenant_id);

ALTER TABLE reservation_resource_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservation_resource_types_select ON reservation_resource_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_resource_types_insert ON reservation_resource_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_resource_types_update ON reservation_resource_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_resource_types_delete ON reservation_resource_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── reservation_resources ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_resources (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  title             TEXT NOT NULL,
  type_id           TEXT NOT NULL REFERENCES reservation_resource_types(id),
  available_online  BOOLEAN NOT NULL DEFAULT false,
  display_sequence  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_resources_tenant_type ON reservation_resources (tenant_id, type_id);

ALTER TABLE reservation_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservation_resources_select ON reservation_resources FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_resources_insert ON reservation_resources FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_resources_update ON reservation_resources FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_resources_delete ON reservation_resources FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── reservation_policies ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_policies (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  course_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_policies_tenant_course ON reservation_policies (tenant_id, course_id);

ALTER TABLE reservation_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservation_policies_select ON reservation_policies FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_policies_insert ON reservation_policies FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_policies_update ON reservation_policies FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_policies_delete ON reservation_policies FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── reservation_rate_override_rules ─────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_rate_override_rules (
  id                       TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                TEXT NOT NULL REFERENCES tenants(id),
  course_id                TEXT NOT NULL,
  rack_rate_id             TEXT,
  class_rule_id            TEXT,
  start_date               DATE,
  start_time               TIME,
  end_date                 DATE,
  end_time                 TIME,
  provider_name            TEXT,
  provider_identifier      TEXT,
  rate_cents               INTEGER NOT NULL,
  prevent_further_override BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_rate_override_rules_tenant_course_start ON reservation_rate_override_rules (tenant_id, course_id, start_date);

ALTER TABLE reservation_rate_override_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservation_rate_override_rules_select ON reservation_rate_override_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_rate_override_rules_insert ON reservation_rate_override_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_rate_override_rules_update ON reservation_rate_override_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_rate_override_rules_delete ON reservation_rate_override_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── reservation_dependent_blocks ────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_dependent_blocks (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  reservation_resource_id TEXT NOT NULL REFERENCES reservation_resources(id),
  block_rule_type         TEXT NOT NULL,
  blocked_resource_type_id TEXT,
  blocked_resource_id     TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_dependent_blocks_tenant_resource ON reservation_dependent_blocks (tenant_id, reservation_resource_id);

ALTER TABLE reservation_dependent_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservation_dependent_blocks_select ON reservation_dependent_blocks FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_dependent_blocks_insert ON reservation_dependent_blocks FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_dependent_blocks_update ON reservation_dependent_blocks FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY reservation_dependent_blocks_delete ON reservation_dependent_blocks FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- SCHEDULING DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── on_demand_availability_schedules ────────────────────────────
CREATE TABLE IF NOT EXISTS on_demand_availability_schedules (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  day_of_week INTEGER NOT NULL,
  start_month INTEGER,
  start_day   INTEGER,
  end_month   INTEGER,
  end_day     INTEGER,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  order_type  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_on_demand_availability_schedules_tenant_dow ON on_demand_availability_schedules (tenant_id, day_of_week);

ALTER TABLE on_demand_availability_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY on_demand_availability_schedules_select ON on_demand_availability_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY on_demand_availability_schedules_insert ON on_demand_availability_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY on_demand_availability_schedules_update ON on_demand_availability_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY on_demand_availability_schedules_delete ON on_demand_availability_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── online_ordering_schedules ───────────────────────────────────
CREATE TABLE IF NOT EXISTS online_ordering_schedules (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  day_of_week INTEGER NOT NULL,
  start_month INTEGER,
  start_day   INTEGER,
  end_month   INTEGER,
  end_day     INTEGER,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_online_ordering_schedules_tenant_dow ON online_ordering_schedules (tenant_id, day_of_week);

ALTER TABLE online_ordering_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY online_ordering_schedules_select ON online_ordering_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY online_ordering_schedules_insert ON online_ordering_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY online_ordering_schedules_update ON online_ordering_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY online_ordering_schedules_delete ON online_ordering_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
