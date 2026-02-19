-- Migration: 0053_golf_lifecycle_tables
-- Golf lifecycle read model tables for Session 24.
-- Individual tee time tracking, operations, pace, revenue, customer, channel analytics.

-- ── rm_golf_tee_time_fact ─────────────────────────────────────────
-- Individual tee time lifecycle tracking (one row per reservation).
-- Created on booking, updated through check-in → start → completion.
CREATE TABLE IF NOT EXISTS rm_golf_tee_time_fact (
  id                     TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  course_id              TEXT NOT NULL REFERENCES courses(id),
  location_id            TEXT NOT NULL,
  reservation_id         TEXT NOT NULL,
  business_date          DATE NOT NULL,
  start_at               TIMESTAMPTZ NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'booked',
  party_size_booked      INTEGER NOT NULL,
  party_size_actual      INTEGER,
  booking_source         TEXT NOT NULL,
  booking_type           TEXT NOT NULL DEFAULT 'public',
  customer_id            TEXT,
  customer_name          TEXT,
  walking_count          INTEGER,
  riding_count           INTEGER,
  holes                  INTEGER NOT NULL DEFAULT 18,
  green_fee_cents        INTEGER NOT NULL DEFAULT 0,
  checked_in_at          TIMESTAMPTZ,
  started_at             TIMESTAMPTZ,
  start_delay_min        INTEGER,
  is_late_start          BOOLEAN NOT NULL DEFAULT false,
  completed_at           TIMESTAMPTZ,
  holes_completed        INTEGER,
  duration_minutes       INTEGER,
  pace_minutes_per_hole  NUMERIC(5,1),
  actual_green_fee       NUMERIC(19,4) NOT NULL DEFAULT 0,
  actual_cart_fee        NUMERIC(19,4) NOT NULL DEFAULT 0,
  actual_other_fees      NUMERIC(19,4) NOT NULL DEFAULT 0,
  food_bev               NUMERIC(19,4) NOT NULL DEFAULT 0,
  pro_shop               NUMERIC(19,4) NOT NULL DEFAULT 0,
  tax                    NUMERIC(19,4) NOT NULL DEFAULT 0,
  total_revenue          NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_fact_tenant_reservation
  ON rm_golf_tee_time_fact (tenant_id, reservation_id);
CREATE INDEX IF NOT EXISTS idx_rm_golf_fact_tenant_course_date
  ON rm_golf_tee_time_fact (tenant_id, course_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_golf_fact_tenant_customer
  ON rm_golf_tee_time_fact (tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rm_golf_fact_tenant_status
  ON rm_golf_tee_time_fact (tenant_id, status);

ALTER TABLE rm_golf_tee_time_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_tee_time_fact FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_tee_time_fact_select ON rm_golf_tee_time_fact FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_tee_time_fact_insert ON rm_golf_tee_time_fact FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_tee_time_fact_update ON rm_golf_tee_time_fact FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_tee_time_fact_delete ON rm_golf_tee_time_fact FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_golf_ops_daily ─────────────────────────────────────────────
-- Start delay and schedule compliance per course per day.
CREATE TABLE IF NOT EXISTS rm_golf_ops_daily (
  id                       TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                TEXT NOT NULL REFERENCES tenants(id),
  course_id                TEXT NOT NULL REFERENCES courses(id),
  business_date            DATE NOT NULL,
  starts_count             INTEGER NOT NULL DEFAULT 0,
  late_starts_count        INTEGER NOT NULL DEFAULT 0,
  total_start_delay_min    INTEGER NOT NULL DEFAULT 0,
  avg_start_delay_min      NUMERIC(8,2) NOT NULL DEFAULT 0,
  interval_compliance_pct  INTEGER NOT NULL DEFAULT 0,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_ops_daily_tenant_course_date
  ON rm_golf_ops_daily (tenant_id, course_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_golf_ops_daily_tenant_date
  ON rm_golf_ops_daily (tenant_id, business_date);

ALTER TABLE rm_golf_ops_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_ops_daily FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_ops_daily_select ON rm_golf_ops_daily FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_ops_daily_insert ON rm_golf_ops_daily FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_ops_daily_update ON rm_golf_ops_daily FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_ops_daily_delete ON rm_golf_ops_daily FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_golf_pace_daily ────────────────────────────────────────────
-- Round duration and slow rounds per course per day.
CREATE TABLE IF NOT EXISTS rm_golf_pace_daily (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  course_id                 TEXT NOT NULL REFERENCES courses(id),
  business_date             DATE NOT NULL,
  rounds_completed          INTEGER NOT NULL DEFAULT 0,
  total_duration_min        INTEGER NOT NULL DEFAULT 0,
  avg_round_duration_min    NUMERIC(8,2) NOT NULL DEFAULT 0,
  slow_rounds_count         INTEGER NOT NULL DEFAULT 0,
  avg_minutes_per_hole      NUMERIC(8,2) NOT NULL DEFAULT 0,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_pace_daily_tenant_course_date
  ON rm_golf_pace_daily (tenant_id, course_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_golf_pace_daily_tenant_date
  ON rm_golf_pace_daily (tenant_id, business_date);

ALTER TABLE rm_golf_pace_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_pace_daily FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_pace_daily_select ON rm_golf_pace_daily FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_pace_daily_insert ON rm_golf_pace_daily FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_pace_daily_update ON rm_golf_pace_daily FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_pace_daily_delete ON rm_golf_pace_daily FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_golf_revenue_daily ─────────────────────────────────────────
-- Revenue breakdown by category per course per day.
CREATE TABLE IF NOT EXISTS rm_golf_revenue_daily (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  course_id           TEXT NOT NULL REFERENCES courses(id),
  business_date       DATE NOT NULL,
  green_fee_revenue   NUMERIC(19,4) NOT NULL DEFAULT 0,
  cart_fee_revenue    NUMERIC(19,4) NOT NULL DEFAULT 0,
  range_fee_revenue   NUMERIC(19,4) NOT NULL DEFAULT 0,
  food_bev_revenue    NUMERIC(19,4) NOT NULL DEFAULT 0,
  pro_shop_revenue    NUMERIC(19,4) NOT NULL DEFAULT 0,
  tax_total           NUMERIC(19,4) NOT NULL DEFAULT 0,
  total_revenue       NUMERIC(19,4) NOT NULL DEFAULT 0,
  rounds_played       INTEGER NOT NULL DEFAULT 0,
  rev_per_round       NUMERIC(19,4) NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_revenue_daily_tenant_course_date
  ON rm_golf_revenue_daily (tenant_id, course_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_golf_revenue_daily_tenant_date
  ON rm_golf_revenue_daily (tenant_id, business_date);

ALTER TABLE rm_golf_revenue_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_revenue_daily FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_revenue_daily_select ON rm_golf_revenue_daily FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_revenue_daily_insert ON rm_golf_revenue_daily FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_revenue_daily_update ON rm_golf_revenue_daily FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_revenue_daily_delete ON rm_golf_revenue_daily FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_golf_customer_play ─────────────────────────────────────────
-- Customer play activity (lifetime aggregate).
CREATE TABLE IF NOT EXISTS rm_golf_customer_play (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  customer_id       TEXT NOT NULL,
  customer_name     TEXT,
  total_rounds      INTEGER NOT NULL DEFAULT 0,
  total_revenue     NUMERIC(19,4) NOT NULL DEFAULT 0,
  last_played_at    TIMESTAMPTZ,
  total_party_size  INTEGER NOT NULL DEFAULT 0,
  avg_party_size    NUMERIC(5,1) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_customer_play_tenant_customer
  ON rm_golf_customer_play (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_rm_golf_customer_play_last_played
  ON rm_golf_customer_play (tenant_id, last_played_at);

ALTER TABLE rm_golf_customer_play ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_customer_play FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_customer_play_select ON rm_golf_customer_play FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_customer_play_insert ON rm_golf_customer_play FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_customer_play_update ON rm_golf_customer_play FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_customer_play_delete ON rm_golf_customer_play FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_golf_channel_daily ─────────────────────────────────────────
-- Channel mix and lead time per course per day.
CREATE TABLE IF NOT EXISTS rm_golf_channel_daily (
  id                     TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  course_id              TEXT NOT NULL REFERENCES courses(id),
  business_date          DATE NOT NULL,
  online_slots_booked    INTEGER NOT NULL DEFAULT 0,
  proshop_slots_booked   INTEGER NOT NULL DEFAULT 0,
  phone_slots_booked     INTEGER NOT NULL DEFAULT 0,
  member_rounds          INTEGER NOT NULL DEFAULT 0,
  public_rounds          INTEGER NOT NULL DEFAULT 0,
  league_rounds          INTEGER NOT NULL DEFAULT 0,
  outing_rounds          INTEGER NOT NULL DEFAULT 0,
  booking_count          INTEGER NOT NULL DEFAULT 0,
  total_lead_time_hours  INTEGER NOT NULL DEFAULT 0,
  avg_lead_time_hours    NUMERIC(8,2) NOT NULL DEFAULT 0,
  last_minute_count      INTEGER NOT NULL DEFAULT 0,
  advanced_count         INTEGER NOT NULL DEFAULT 0,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_channel_daily_tenant_course_date
  ON rm_golf_channel_daily (tenant_id, course_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_golf_channel_daily_tenant_date
  ON rm_golf_channel_daily (tenant_id, business_date);

ALTER TABLE rm_golf_channel_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_channel_daily FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_channel_daily_select ON rm_golf_channel_daily FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_channel_daily_insert ON rm_golf_channel_daily FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_channel_daily_update ON rm_golf_channel_daily FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_channel_daily_delete ON rm_golf_channel_daily FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_golf_pace_checkpoints ──────────────────────────────────────
-- Raw pace checkpoint data for V2 hole-by-hole analytics.
CREATE TABLE IF NOT EXISTS rm_golf_pace_checkpoints (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  reservation_id    TEXT NOT NULL,
  checkpoint        INTEGER NOT NULL,
  recorded_at       TIMESTAMPTZ NOT NULL,
  elapsed_minutes   INTEGER,
  expected_minutes  INTEGER,
  status            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_pace_checkpoints_tenant_res_cp
  ON rm_golf_pace_checkpoints (tenant_id, reservation_id, checkpoint);
CREATE INDEX IF NOT EXISTS idx_rm_golf_pace_checkpoints_tenant_reservation
  ON rm_golf_pace_checkpoints (tenant_id, reservation_id);

ALTER TABLE rm_golf_pace_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_pace_checkpoints FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_pace_checkpoints_select ON rm_golf_pace_checkpoints FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_pace_checkpoints_insert ON rm_golf_pace_checkpoints FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_pace_checkpoints_update ON rm_golf_pace_checkpoints FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_pace_checkpoints_delete ON rm_golf_pace_checkpoints FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
