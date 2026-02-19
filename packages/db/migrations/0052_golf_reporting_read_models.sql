-- Migration: 0052_golf_reporting_read_models
-- CQRS read model tables for the Golf Reporting module (Session 23).
-- These are event-driven projections updated by tee time event consumers.

-- ── rm_golf_tee_time_demand ───────────────────────────────────────
-- Daily tee time booking demand aggregates by course and business date.
CREATE TABLE IF NOT EXISTS rm_golf_tee_time_demand (
  id                   TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  course_id            TEXT NOT NULL REFERENCES courses(id),
  business_date        DATE NOT NULL,
  slots_booked         INTEGER NOT NULL DEFAULT 0,
  slots_available      INTEGER NOT NULL DEFAULT 0,
  online_slots_booked  INTEGER NOT NULL DEFAULT 0,
  cancellations        INTEGER NOT NULL DEFAULT 0,
  no_shows             INTEGER NOT NULL DEFAULT 0,
  utilization_bps      INTEGER NOT NULL DEFAULT 0,
  revenue_booked       NUMERIC(19,4) NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_tee_time_demand_tenant_course_date
  ON rm_golf_tee_time_demand (tenant_id, course_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_golf_tee_time_demand_tenant_date
  ON rm_golf_tee_time_demand (tenant_id, business_date);

ALTER TABLE rm_golf_tee_time_demand ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_tee_time_demand FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_tee_time_demand_select ON rm_golf_tee_time_demand FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_tee_time_demand_insert ON rm_golf_tee_time_demand FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_tee_time_demand_update ON rm_golf_tee_time_demand FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_tee_time_demand_delete ON rm_golf_tee_time_demand FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_golf_hourly_distribution ───────────────────────────────────
-- Demand by hour-of-day for tee time heat maps.
CREATE TABLE IF NOT EXISTS rm_golf_hourly_distribution (
  id               TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  course_id        TEXT NOT NULL REFERENCES courses(id),
  business_date    DATE NOT NULL,
  hour_of_day      SMALLINT NOT NULL,
  slots_booked     INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_hourly_dist_tenant_course_date_hour
  ON rm_golf_hourly_distribution (tenant_id, course_id, business_date, hour_of_day);
CREATE INDEX IF NOT EXISTS idx_rm_golf_hourly_dist_tenant_date
  ON rm_golf_hourly_distribution (tenant_id, business_date);

ALTER TABLE rm_golf_hourly_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_hourly_distribution FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_hourly_distribution_select ON rm_golf_hourly_distribution FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_hourly_distribution_insert ON rm_golf_hourly_distribution FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_hourly_distribution_update ON rm_golf_hourly_distribution FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_hourly_distribution_delete ON rm_golf_hourly_distribution FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_golf_booking_lead_time ─────────────────────────────────────
-- How far in advance tee times are booked (lead time distribution).
CREATE TABLE IF NOT EXISTS rm_golf_booking_lead_time (
  id                   TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  course_id            TEXT NOT NULL REFERENCES courses(id),
  business_date        DATE NOT NULL,
  same_day_count       INTEGER NOT NULL DEFAULT 0,
  one_day_count        INTEGER NOT NULL DEFAULT 0,
  two_to_seven_count   INTEGER NOT NULL DEFAULT 0,
  eight_plus_count     INTEGER NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_golf_booking_lead_time_tenant_course_date
  ON rm_golf_booking_lead_time (tenant_id, course_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_golf_booking_lead_time_tenant_date
  ON rm_golf_booking_lead_time (tenant_id, business_date);

ALTER TABLE rm_golf_booking_lead_time ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_golf_booking_lead_time FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_golf_booking_lead_time_select ON rm_golf_booking_lead_time FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_booking_lead_time_insert ON rm_golf_booking_lead_time FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_booking_lead_time_update ON rm_golf_booking_lead_time FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_golf_booking_lead_time_delete ON rm_golf_booking_lead_time FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
