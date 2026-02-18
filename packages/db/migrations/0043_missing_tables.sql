-- Migration: 0043_missing_tables
-- Fills 6 tables identified as missing during the reconciliation audit:
-- course_layout_rec_dates, course_suggestion_coordinates,
-- course_suggestion_coordinate_details, customer_pace_of_play,
-- golf_outing_golfer_details, on_demand_orders

-- ══════════════════════════════════════════════════════════════════
-- COURSES DOMAIN — MISSING TABLES
-- ══════════════════════════════════════════════════════════════════

-- ── course_layout_rec_dates ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_layout_rec_dates (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  course_layout_id  TEXT NOT NULL REFERENCES course_layouts(id) ON DELETE CASCADE,
  course_id         TEXT NOT NULL REFERENCES courses(id),
  rec_date          TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_layout_rec_dates_tenant_layout
  ON course_layout_rec_dates (tenant_id, course_layout_id);

ALTER TABLE course_layout_rec_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_layout_rec_dates_select ON course_layout_rec_dates FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layout_rec_dates_insert ON course_layout_rec_dates FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layout_rec_dates_update ON course_layout_rec_dates FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_layout_rec_dates_delete ON course_layout_rec_dates FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));


-- ── course_suggestion_coordinates ────────────────────────────────
CREATE TABLE IF NOT EXISTS course_suggestion_coordinates (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  course_id         TEXT NOT NULL REFERENCES courses(id),
  status            TEXT NOT NULL DEFAULT 'pending',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_suggestion_coordinates_tenant_course
  ON course_suggestion_coordinates (tenant_id, course_id);

ALTER TABLE course_suggestion_coordinates ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_suggestion_coordinates_select ON course_suggestion_coordinates FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestion_coordinates_insert ON course_suggestion_coordinates FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestion_coordinates_update ON course_suggestion_coordinates FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestion_coordinates_delete ON course_suggestion_coordinates FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));


-- ── course_suggestion_coordinate_details ─────────────────────────
CREATE TABLE IF NOT EXISTS course_suggestion_coordinate_details (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  suggestion_coordinate_id  TEXT NOT NULL REFERENCES course_suggestion_coordinates(id) ON DELETE CASCADE,
  hole_number               INTEGER NOT NULL,
  longitude                 NUMERIC(11, 8),
  latitude                  NUMERIC(11, 8),
  marker_type               TEXT NOT NULL DEFAULT 'pin',
  description               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_suggestion_coord_details_tenant_coord
  ON course_suggestion_coordinate_details (tenant_id, suggestion_coordinate_id);

ALTER TABLE course_suggestion_coordinate_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_suggestion_coordinate_details_select ON course_suggestion_coordinate_details FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestion_coordinate_details_insert ON course_suggestion_coordinate_details FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestion_coordinate_details_update ON course_suggestion_coordinate_details FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY course_suggestion_coordinate_details_delete ON course_suggestion_coordinate_details FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));


-- ══════════════════════════════════════════════════════════════════
-- CUSTOMER_GAPS DOMAIN — MISSING TABLE
-- ══════════════════════════════════════════════════════════════════

-- ── customer_pace_of_play ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_pace_of_play (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  customer_id       TEXT NOT NULL,
  course_id         TEXT,
  game_round_id     TEXT,
  latitude          NUMERIC(10, 7),
  longitude         NUMERIC(10, 7),
  tracked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hole_number       INTEGER,
  position          TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  details           JSONB,
  tracking_type     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_pace_of_play_tenant_customer
  ON customer_pace_of_play (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_pace_of_play_tenant_round
  ON customer_pace_of_play (tenant_id, game_round_id)
  WHERE game_round_id IS NOT NULL;

ALTER TABLE customer_pace_of_play ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_pace_of_play_select ON customer_pace_of_play FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_pace_of_play_insert ON customer_pace_of_play FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_pace_of_play_update ON customer_pace_of_play FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_pace_of_play_delete ON customer_pace_of_play FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));


-- ══════════════════════════════════════════════════════════════════
-- EVENTS DOMAIN — MISSING TABLE
-- ══════════════════════════════════════════════════════════════════

-- ── golf_outing_golfer_details ───────────────────────────────────
CREATE TABLE IF NOT EXISTS golf_outing_golfer_details (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  event_id                TEXT NOT NULL,
  total_golfers            INTEGER,
  price_per_golfer_cents   INTEGER,
  includes_cart            BOOLEAN NOT NULL DEFAULT false,
  total_carts              INTEGER,
  price_per_cart_cents      INTEGER,
  remarks                  TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_golf_outing_golfer_details_tenant_event
  ON golf_outing_golfer_details (tenant_id, event_id);

ALTER TABLE golf_outing_golfer_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY golf_outing_golfer_details_select ON golf_outing_golfer_details FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_outing_golfer_details_insert ON golf_outing_golfer_details FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_outing_golfer_details_update ON golf_outing_golfer_details FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY golf_outing_golfer_details_delete ON golf_outing_golfer_details FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));


-- ══════════════════════════════════════════════════════════════════
-- RESERVATIONS DOMAIN — MISSING TABLE
-- ══════════════════════════════════════════════════════════════════

-- ── on_demand_orders ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS on_demand_orders (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  order_id            TEXT NOT NULL,
  intended_tip_cents  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_on_demand_orders_tenant_order
  ON on_demand_orders (tenant_id, order_id);

ALTER TABLE on_demand_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY on_demand_orders_select ON on_demand_orders FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY on_demand_orders_insert ON on_demand_orders FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY on_demand_orders_update ON on_demand_orders FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY on_demand_orders_delete ON on_demand_orders FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
