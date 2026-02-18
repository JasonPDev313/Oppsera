-- Migration: 0025_courses
-- Golf courses domain: courses, holes, layouts, layout holes, blocked users,
-- suggestions, channel partner course availability, channel partner rate availability

-- ══════════════════════════════════════════════════════════════════
-- COURSES DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── courses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  location_id         TEXT NOT NULL REFERENCES locations(id),
  name                TEXT NOT NULL,
  course_type         TEXT NOT NULL DEFAULT 'standard',
  total_holes         INTEGER NOT NULL DEFAULT 18,
  total_par           INTEGER,
  slope_rating        NUMERIC(5,1),
  course_rating       NUMERIC(5,1),
  green_grass_type    TEXT,
  fairway_grass_type  TEXT,
  year_built          INTEGER,
  description         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_tenant_location ON courses (tenant_id, location_id);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_select ON courses FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY courses_insert ON courses FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY courses_update ON courses FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY courses_delete ON courses FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── course_holes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_holes (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  hole_number     INTEGER NOT NULL,
  par             INTEGER NOT NULL,
  yardage_white   INTEGER,
  yardage_blue    INTEGER,
  yardage_red     INTEGER,
  handicap        INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_holes_tenant_course_hole
  ON course_holes (tenant_id, course_id, hole_number);

ALTER TABLE course_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_holes_select ON course_holes FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_holes_insert ON course_holes FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_holes_update ON course_holes FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_holes_delete ON course_holes FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── course_layouts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_layouts (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL REFERENCES courses(id),
  title           TEXT NOT NULL,
  coordinate_type TEXT NOT NULL DEFAULT 'gps',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  valid_from      DATE,
  valid_to        DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_layouts_tenant_course ON course_layouts (tenant_id, course_id);

ALTER TABLE course_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_layouts_select ON course_layouts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layouts_insert ON course_layouts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layouts_update ON course_layouts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layouts_delete ON course_layouts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── course_layout_holes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_layout_holes (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  layout_id       TEXT NOT NULL REFERENCES course_layouts(id) ON DELETE CASCADE,
  hole_number     INTEGER NOT NULL,
  longitude       NUMERIC(11,8),
  latitude        NUMERIC(11,8),
  marker_type     TEXT NOT NULL DEFAULT 'pin',
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_layout_holes_tenant_layout_hole
  ON course_layout_holes (tenant_id, layout_id, hole_number);

ALTER TABLE course_layout_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_layout_holes_select ON course_layout_holes FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layout_holes_insert ON course_layout_holes FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layout_holes_update ON course_layout_holes FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layout_holes_delete ON course_layout_holes FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── course_blocked_users ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_blocked_users (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL REFERENCES courses(id),
  blocked_user_id TEXT NOT NULL,
  blocked_by      TEXT,
  is_golfer       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_blocked_users_tenant_course_user
  ON course_blocked_users (tenant_id, course_id, blocked_user_id);

ALTER TABLE course_blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_blocked_users_select ON course_blocked_users FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_blocked_users_insert ON course_blocked_users FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_blocked_users_update ON course_blocked_users FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_blocked_users_delete ON course_blocked_users FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── course_suggestions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_suggestions (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  name                TEXT NOT NULL,
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7),
  requested_by        TEXT,
  requested_services  TEXT,
  nearby_course_id    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  notes               TEXT,
  device_info         TEXT,
  platform            TEXT,
  coordinates         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_suggestions_tenant_status ON course_suggestions (tenant_id, status);

ALTER TABLE course_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_suggestions_select ON course_suggestions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestions_insert ON course_suggestions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestions_update ON course_suggestions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestions_delete ON course_suggestions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── channel_partner_course_availability ─────────────────────────
CREATE TABLE IF NOT EXISTS channel_partner_course_availability (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL REFERENCES courses(id),
  partner_code    TEXT NOT NULL,
  is_available    BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cp_course_avail_tenant_course_partner
  ON channel_partner_course_availability (tenant_id, course_id, partner_code);

ALTER TABLE channel_partner_course_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_partner_course_availability_select ON channel_partner_course_availability FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY channel_partner_course_availability_insert ON channel_partner_course_availability FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY channel_partner_course_availability_update ON channel_partner_course_availability FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY channel_partner_course_availability_delete ON channel_partner_course_availability FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── channel_partner_rate_availability ───────────────────────────
CREATE TABLE IF NOT EXISTS channel_partner_rate_availability (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  partner_code    TEXT NOT NULL,
  rack_rate_id    TEXT,
  class_rule_id   TEXT,
  is_available    BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_rate_avail_tenant_partner
  ON channel_partner_rate_availability (tenant_id, partner_code);

ALTER TABLE channel_partner_rate_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_partner_rate_availability_select ON channel_partner_rate_availability FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY channel_partner_rate_availability_insert ON channel_partner_rate_availability FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY channel_partner_rate_availability_update ON channel_partner_rate_availability FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY channel_partner_rate_availability_delete ON channel_partner_rate_availability FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
