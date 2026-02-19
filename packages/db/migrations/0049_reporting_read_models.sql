-- Migration: 0049_reporting_read_models
-- CQRS read model tables for the Reporting & Analytics module.
-- These are event-driven projections — never queried by transactional code.

-- ── rm_daily_sales ──────────────────────────────────────────────
-- Pre-aggregated daily sales by location and business date.
CREATE TABLE IF NOT EXISTS rm_daily_sales (
  id               TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  location_id      TEXT NOT NULL REFERENCES locations(id),
  business_date    DATE NOT NULL,
  order_count      INTEGER NOT NULL DEFAULT 0,
  gross_sales      NUMERIC(19,4) NOT NULL DEFAULT 0,
  discount_total   NUMERIC(19,4) NOT NULL DEFAULT 0,
  tax_total        NUMERIC(19,4) NOT NULL DEFAULT 0,
  net_sales        NUMERIC(19,4) NOT NULL DEFAULT 0,
  tender_cash      NUMERIC(19,4) NOT NULL DEFAULT 0,
  tender_card      NUMERIC(19,4) NOT NULL DEFAULT 0,
  void_count       INTEGER NOT NULL DEFAULT 0,
  void_total       NUMERIC(19,4) NOT NULL DEFAULT 0,
  avg_order_value  NUMERIC(19,4) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_daily_sales_tenant_location_date
  ON rm_daily_sales (tenant_id, location_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_daily_sales_tenant_date
  ON rm_daily_sales (tenant_id, business_date);

ALTER TABLE rm_daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_daily_sales FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_daily_sales_select ON rm_daily_sales FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_daily_sales_insert ON rm_daily_sales FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_daily_sales_update ON rm_daily_sales FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_daily_sales_delete ON rm_daily_sales FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_item_sales ───────────────────────────────────────────────
-- Per-item sales aggregation by location and business date.
CREATE TABLE IF NOT EXISTS rm_item_sales (
  id                 TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  location_id        TEXT NOT NULL REFERENCES locations(id),
  business_date      DATE NOT NULL,
  catalog_item_id    TEXT NOT NULL,
  catalog_item_name  TEXT NOT NULL,
  quantity_sold      INTEGER NOT NULL DEFAULT 0,
  gross_revenue      NUMERIC(19,4) NOT NULL DEFAULT 0,
  quantity_voided    INTEGER NOT NULL DEFAULT 0,
  void_revenue       NUMERIC(19,4) NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_item_sales_tenant_loc_date_item
  ON rm_item_sales (tenant_id, location_id, business_date, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_rm_item_sales_tenant_date
  ON rm_item_sales (tenant_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rm_item_sales_tenant_item
  ON rm_item_sales (tenant_id, catalog_item_id);

ALTER TABLE rm_item_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_item_sales FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_item_sales_select ON rm_item_sales FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_item_sales_insert ON rm_item_sales FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_item_sales_update ON rm_item_sales FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_item_sales_delete ON rm_item_sales FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_inventory_on_hand ────────────────────────────────────────
-- Current inventory snapshot per location.
CREATE TABLE IF NOT EXISTS rm_inventory_on_hand (
  id                   TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  location_id          TEXT NOT NULL REFERENCES locations(id),
  inventory_item_id    TEXT NOT NULL,
  item_name            TEXT NOT NULL,
  on_hand              INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold  INTEGER NOT NULL DEFAULT 0,
  is_below_threshold   BOOLEAN NOT NULL DEFAULT false,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_inventory_on_hand_tenant_loc_item
  ON rm_inventory_on_hand (tenant_id, location_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_rm_inventory_on_hand_below
  ON rm_inventory_on_hand (tenant_id, location_id, is_below_threshold);

ALTER TABLE rm_inventory_on_hand ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_inventory_on_hand FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_inventory_on_hand_select ON rm_inventory_on_hand FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_inventory_on_hand_insert ON rm_inventory_on_hand FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_inventory_on_hand_update ON rm_inventory_on_hand FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_inventory_on_hand_delete ON rm_inventory_on_hand FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rm_customer_activity ────────────────────────────────────────
-- Customer engagement summary (visits, spend, last activity).
CREATE TABLE IF NOT EXISTS rm_customer_activity (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  customer_id     TEXT NOT NULL,
  customer_name   TEXT NOT NULL,
  total_visits    INTEGER NOT NULL DEFAULT 0,
  total_spend     NUMERIC(19,4) NOT NULL DEFAULT 0,
  last_visit_at   TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_customer_activity_tenant_customer
  ON rm_customer_activity (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_rm_customer_activity_last_visit
  ON rm_customer_activity (tenant_id, last_visit_at);

ALTER TABLE rm_customer_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_customer_activity FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_customer_activity_select ON rm_customer_activity FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_customer_activity_insert ON rm_customer_activity FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_customer_activity_update ON rm_customer_activity FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_customer_activity_delete ON rm_customer_activity FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Enhance processed_events for tenant isolation ───────────────
-- The existing processed_events table (0001_core_schema) lacks tenant_id.
-- Add it for reporting consumers that need tenant-scoped idempotency.
ALTER TABLE processed_events ADD COLUMN IF NOT EXISTS tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_processed_events_tenant ON processed_events (tenant_id) WHERE tenant_id IS NOT NULL;
