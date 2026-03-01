-- 0242_spa_reporting_read_models.sql
-- CQRS read model tables for spa module reporting.
-- 4 tables: rm_spa_daily_operations, rm_spa_provider_metrics,
--           rm_spa_service_metrics, rm_spa_client_metrics

-- ═══════════════════════════════════════════════════════════════════
-- 1. rm_spa_daily_operations — Pre-aggregated daily spa metrics per location
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rm_spa_daily_operations (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  location_id             TEXT NOT NULL,
  business_date           DATE NOT NULL,
  appointment_count       INTEGER NOT NULL DEFAULT 0,
  completed_count         INTEGER NOT NULL DEFAULT 0,
  canceled_count          INTEGER NOT NULL DEFAULT 0,
  no_show_count           INTEGER NOT NULL DEFAULT 0,
  walk_in_count           INTEGER NOT NULL DEFAULT 0,
  online_booking_count    INTEGER NOT NULL DEFAULT 0,
  total_revenue           NUMERIC(19,4) NOT NULL DEFAULT 0,
  service_revenue         NUMERIC(19,4) NOT NULL DEFAULT 0,
  addon_revenue           NUMERIC(19,4) NOT NULL DEFAULT 0,
  retail_revenue          NUMERIC(19,4) NOT NULL DEFAULT 0,
  tip_total               NUMERIC(19,4) NOT NULL DEFAULT 0,
  avg_appointment_duration INTEGER NOT NULL DEFAULT 0,
  utilization_pct         NUMERIC(5,2) NOT NULL DEFAULT 0,
  rebooking_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_spa_daily_ops_tenant_loc_date
  ON rm_spa_daily_operations (tenant_id, location_id, business_date);

CREATE INDEX IF NOT EXISTS idx_rm_spa_daily_ops_tenant_date
  ON rm_spa_daily_operations (tenant_id, business_date);

-- RLS
ALTER TABLE rm_spa_daily_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_spa_daily_operations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rm_spa_daily_operations_select" ON rm_spa_daily_operations;
CREATE POLICY "rm_spa_daily_operations_select" ON rm_spa_daily_operations
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_daily_operations_insert" ON rm_spa_daily_operations;
CREATE POLICY "rm_spa_daily_operations_insert" ON rm_spa_daily_operations
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_daily_operations_update" ON rm_spa_daily_operations;
CREATE POLICY "rm_spa_daily_operations_update" ON rm_spa_daily_operations
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_daily_operations_delete" ON rm_spa_daily_operations;
CREATE POLICY "rm_spa_daily_operations_delete" ON rm_spa_daily_operations
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ═══════════════════════════════════════════════════════════════════
-- 2. rm_spa_provider_metrics — Provider (therapist/stylist) performance per period
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rm_spa_provider_metrics (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  provider_id             TEXT NOT NULL,
  business_date           DATE NOT NULL,
  appointment_count       INTEGER NOT NULL DEFAULT 0,
  completed_count         INTEGER NOT NULL DEFAULT 0,
  canceled_count          INTEGER NOT NULL DEFAULT 0,
  no_show_count           INTEGER NOT NULL DEFAULT 0,
  total_revenue           NUMERIC(19,4) NOT NULL DEFAULT 0,
  commission_total        NUMERIC(19,4) NOT NULL DEFAULT 0,
  tip_total               NUMERIC(19,4) NOT NULL DEFAULT 0,
  avg_service_duration    INTEGER NOT NULL DEFAULT 0,
  utilization_pct         NUMERIC(5,2) NOT NULL DEFAULT 0,
  rebooking_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_rating              NUMERIC(3,2) NOT NULL DEFAULT 0,
  client_count            INTEGER NOT NULL DEFAULT 0,
  new_client_count        INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_spa_provider_tenant_provider_date
  ON rm_spa_provider_metrics (tenant_id, provider_id, business_date);

CREATE INDEX IF NOT EXISTS idx_rm_spa_provider_tenant_date
  ON rm_spa_provider_metrics (tenant_id, business_date);

-- RLS
ALTER TABLE rm_spa_provider_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_spa_provider_metrics FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rm_spa_provider_metrics_select" ON rm_spa_provider_metrics;
CREATE POLICY "rm_spa_provider_metrics_select" ON rm_spa_provider_metrics
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_provider_metrics_insert" ON rm_spa_provider_metrics;
CREATE POLICY "rm_spa_provider_metrics_insert" ON rm_spa_provider_metrics
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_provider_metrics_update" ON rm_spa_provider_metrics;
CREATE POLICY "rm_spa_provider_metrics_update" ON rm_spa_provider_metrics
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_provider_metrics_delete" ON rm_spa_provider_metrics;
CREATE POLICY "rm_spa_provider_metrics_delete" ON rm_spa_provider_metrics
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ═══════════════════════════════════════════════════════════════════
-- 3. rm_spa_service_metrics — Service popularity and revenue
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rm_spa_service_metrics (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  service_id              TEXT NOT NULL,
  business_date           DATE NOT NULL,
  booking_count           INTEGER NOT NULL DEFAULT 0,
  completed_count         INTEGER NOT NULL DEFAULT 0,
  canceled_count          INTEGER NOT NULL DEFAULT 0,
  total_revenue           NUMERIC(19,4) NOT NULL DEFAULT 0,
  avg_price_cents         INTEGER NOT NULL DEFAULT 0,
  package_redemptions     INTEGER NOT NULL DEFAULT 0,
  addon_attachment_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_duration_minutes    INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_spa_service_tenant_service_date
  ON rm_spa_service_metrics (tenant_id, service_id, business_date);

CREATE INDEX IF NOT EXISTS idx_rm_spa_service_tenant_date
  ON rm_spa_service_metrics (tenant_id, business_date);

-- RLS
ALTER TABLE rm_spa_service_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_spa_service_metrics FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rm_spa_service_metrics_select" ON rm_spa_service_metrics;
CREATE POLICY "rm_spa_service_metrics_select" ON rm_spa_service_metrics
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_service_metrics_insert" ON rm_spa_service_metrics;
CREATE POLICY "rm_spa_service_metrics_insert" ON rm_spa_service_metrics
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_service_metrics_update" ON rm_spa_service_metrics;
CREATE POLICY "rm_spa_service_metrics_update" ON rm_spa_service_metrics
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_service_metrics_delete" ON rm_spa_service_metrics;
CREATE POLICY "rm_spa_service_metrics_delete" ON rm_spa_service_metrics
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ═══════════════════════════════════════════════════════════════════
-- 4. rm_spa_client_metrics — Client activity for spa visits
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rm_spa_client_metrics (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  customer_id             TEXT NOT NULL,
  business_date           DATE NOT NULL,
  visit_count             INTEGER NOT NULL DEFAULT 0,
  total_spend             NUMERIC(19,4) NOT NULL DEFAULT 0,
  service_count           INTEGER NOT NULL DEFAULT 0,
  addon_count             INTEGER NOT NULL DEFAULT 0,
  package_purchases       INTEGER NOT NULL DEFAULT 0,
  package_redemptions     INTEGER NOT NULL DEFAULT 0,
  cancel_count            INTEGER NOT NULL DEFAULT 0,
  no_show_count           INTEGER NOT NULL DEFAULT 0,
  tip_total               NUMERIC(19,4) NOT NULL DEFAULT 0,
  last_visit_date         DATE,
  days_since_last_visit   INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_spa_client_tenant_customer_date
  ON rm_spa_client_metrics (tenant_id, customer_id, business_date);

CREATE INDEX IF NOT EXISTS idx_rm_spa_client_tenant_date
  ON rm_spa_client_metrics (tenant_id, business_date);

-- RLS
ALTER TABLE rm_spa_client_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_spa_client_metrics FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rm_spa_client_metrics_select" ON rm_spa_client_metrics;
CREATE POLICY "rm_spa_client_metrics_select" ON rm_spa_client_metrics
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_client_metrics_insert" ON rm_spa_client_metrics;
CREATE POLICY "rm_spa_client_metrics_insert" ON rm_spa_client_metrics
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_client_metrics_update" ON rm_spa_client_metrics;
CREATE POLICY "rm_spa_client_metrics_update" ON rm_spa_client_metrics
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS "rm_spa_client_metrics_delete" ON rm_spa_client_metrics;
CREATE POLICY "rm_spa_client_metrics_delete" ON rm_spa_client_metrics
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
