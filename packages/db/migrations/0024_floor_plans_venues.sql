-- Migration: 0024_floor_plans_venues
-- Floor Plans and Venues domain tables

-- ══════════════════════════════════════════════════════════════════
-- FLOOR PLANS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── floor_plans ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS floor_plans (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  floor_plan_type       TEXT NOT NULL,
  floor_plan_data       JSONB NOT NULL,
  terminal_location_id  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_floor_plans_tenant_type ON floor_plans (tenant_id, floor_plan_type);

ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY floor_plans_select ON floor_plans FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plans_insert ON floor_plans FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plans_update ON floor_plans FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plans_delete ON floor_plans FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── floor_plan_templates ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS floor_plan_templates (
  id               TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  title            TEXT NOT NULL,
  floor_plan_type  TEXT NOT NULL,
  floor_plan_data  JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_floor_plan_templates_tenant_title ON floor_plan_templates (tenant_id, title);

ALTER TABLE floor_plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY floor_plan_templates_select ON floor_plan_templates FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_templates_insert ON floor_plan_templates FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_templates_update ON floor_plan_templates FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_templates_delete ON floor_plan_templates FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- VENUES DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── venue_types ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_types (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_venue_types_tenant_title ON venue_types (tenant_id, title);

ALTER TABLE venue_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_types_select ON venue_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venue_types_insert ON venue_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venue_types_update ON venue_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venue_types_delete ON venue_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── venues ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venues (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  title                       TEXT NOT NULL,
  venue_type_id               TEXT REFERENCES venue_types(id),
  default_setup_minutes       INTEGER NOT NULL DEFAULT 0,
  default_tear_down_minutes   INTEGER NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_venues_tenant_type ON venues (tenant_id, venue_type_id);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY venues_select ON venues FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venues_insert ON venues FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venues_update ON venues FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venues_delete ON venues FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── venue_schedules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_schedules (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  venue_id            TEXT NOT NULL REFERENCES venues(id),
  event_id            TEXT,
  customer_id         TEXT,
  start_at            TIMESTAMPTZ NOT NULL,
  end_at              TIMESTAMPTZ NOT NULL,
  setup_minutes       INTEGER NOT NULL DEFAULT 0,
  tear_down_minutes   INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  is_archived         BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_venue_schedules_tenant_venue_start ON venue_schedules (tenant_id, venue_id, start_at);
CREATE INDEX idx_venue_schedules_tenant_event ON venue_schedules (tenant_id, event_id) WHERE event_id IS NOT NULL;

ALTER TABLE venue_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_schedules_select ON venue_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venue_schedules_insert ON venue_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venue_schedules_update ON venue_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY venue_schedules_delete ON venue_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
