-- Migration: 0070_room_layouts
-- Room Layout Builder: rooms, versions, templates (v2).
-- Does NOT drop the old floor_plans / floor_plan_templates tables (backward compat).

-- ── Floor Plan Rooms ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS floor_plan_rooms (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  location_id         TEXT NOT NULL REFERENCES locations(id),
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  description         TEXT,
  width_ft            NUMERIC(8,2) NOT NULL,
  height_ft           NUMERIC(8,2) NOT NULL,
  grid_size_ft        NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  scale_px_per_ft     INTEGER NOT NULL DEFAULT 20,
  unit                TEXT NOT NULL DEFAULT 'feet',
  default_mode        TEXT DEFAULT 'dining',
  current_version_id  TEXT,
  draft_version_id    TEXT,
  capacity            INTEGER,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  archived_at         TIMESTAMPTZ,
  archived_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_floor_plan_rooms_tenant_location_slug
  ON floor_plan_rooms (tenant_id, location_id, slug);

CREATE INDEX IF NOT EXISTS idx_floor_plan_rooms_tenant_location_active
  ON floor_plan_rooms (tenant_id, location_id, is_active);

ALTER TABLE floor_plan_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_rooms FORCE ROW LEVEL SECURITY;

CREATE POLICY floor_plan_rooms_select ON floor_plan_rooms FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_rooms_insert ON floor_plan_rooms FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_rooms_update ON floor_plan_rooms FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_rooms_delete ON floor_plan_rooms FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Floor Plan Versions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS floor_plan_versions (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  room_id           TEXT NOT NULL REFERENCES floor_plan_rooms(id),
  version_number    INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  snapshot_json     JSONB NOT NULL,
  object_count      INTEGER NOT NULL DEFAULT 0,
  total_capacity    INTEGER NOT NULL DEFAULT 0,
  published_at      TIMESTAMPTZ,
  published_by      TEXT,
  publish_note      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_floor_plan_versions_room_number
  ON floor_plan_versions (room_id, version_number);

CREATE INDEX IF NOT EXISTS idx_floor_plan_versions_room_status
  ON floor_plan_versions (room_id, status);

ALTER TABLE floor_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY floor_plan_versions_select ON floor_plan_versions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_versions_insert ON floor_plan_versions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_versions_update ON floor_plan_versions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_versions_delete ON floor_plan_versions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Floor Plan Templates v2 ────────────────────────────────────

CREATE TABLE IF NOT EXISTS floor_plan_templates_v2 (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  name                TEXT NOT NULL,
  description         TEXT,
  category            TEXT DEFAULT 'custom',
  snapshot_json       JSONB NOT NULL,
  thumbnail_url       TEXT,
  width_ft            NUMERIC(8,2) NOT NULL,
  height_ft           NUMERIC(8,2) NOT NULL,
  object_count        INTEGER NOT NULL DEFAULT 0,
  total_capacity      INTEGER NOT NULL DEFAULT 0,
  is_system_template  BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_floor_plan_templates_v2_tenant_name
  ON floor_plan_templates_v2 (tenant_id, name);

ALTER TABLE floor_plan_templates_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_templates_v2 FORCE ROW LEVEL SECURITY;

CREATE POLICY floor_plan_templates_v2_select ON floor_plan_templates_v2 FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_templates_v2_insert ON floor_plan_templates_v2 FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_templates_v2_update ON floor_plan_templates_v2 FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY floor_plan_templates_v2_delete ON floor_plan_templates_v2 FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── FK from rooms to versions (deferred — both tables must exist) ──

ALTER TABLE floor_plan_rooms
  ADD CONSTRAINT fk_floor_plan_rooms_current_version
  FOREIGN KEY (current_version_id) REFERENCES floor_plan_versions(id);

ALTER TABLE floor_plan_rooms
  ADD CONSTRAINT fk_floor_plan_rooms_draft_version
  FOREIGN KEY (draft_version_id) REFERENCES floor_plan_versions(id);
