-- Migration: 0050_custom_report_builder
-- Custom report builder tables: field catalog (system), report definitions, dashboard definitions.

-- ── reporting_field_catalog ────────────────────────────────────
-- System-owned catalog of available fields for the custom report builder.
-- NOT tenant-scoped — no RLS.
CREATE TABLE IF NOT EXISTS reporting_field_catalog (
  id                 TEXT PRIMARY KEY DEFAULT gen_ulid(),
  dataset            TEXT NOT NULL,
  field_key          TEXT NOT NULL,
  label              TEXT NOT NULL,
  data_type          TEXT NOT NULL,
  aggregation        TEXT,
  is_metric          BOOLEAN NOT NULL,
  is_filturable      BOOLEAN NOT NULL DEFAULT true,
  is_sortable        BOOLEAN NOT NULL DEFAULT true,
  column_expression  TEXT NOT NULL,
  table_ref          TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reporting_field_catalog_dataset_key
  ON reporting_field_catalog (dataset, field_key);
CREATE INDEX IF NOT EXISTS idx_reporting_field_catalog_dataset
  ON reporting_field_catalog (dataset);

-- ── report_definitions ─────────────────────────────────────────
-- Tenant-scoped saved report configurations.
CREATE TABLE IF NOT EXISTS report_definitions (
  id           TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  description  TEXT,
  dataset      TEXT NOT NULL,
  definition   JSONB NOT NULL,
  created_by   TEXT NOT NULL,
  is_archived  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_definitions_tenant
  ON report_definitions (tenant_id, is_archived);

ALTER TABLE report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY report_definitions_select ON report_definitions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY report_definitions_insert ON report_definitions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY report_definitions_update ON report_definitions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY report_definitions_delete ON report_definitions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── dashboard_definitions ──────────────────────────────────────
-- Tenant-scoped dashboard layouts with report tiles.
CREATE TABLE IF NOT EXISTS dashboard_definitions (
  id           TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  description  TEXT,
  tiles        JSONB NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_by   TEXT NOT NULL,
  is_archived  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_definitions_tenant
  ON dashboard_definitions (tenant_id, is_archived);

ALTER TABLE dashboard_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY dashboard_definitions_select ON dashboard_definitions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY dashboard_definitions_insert ON dashboard_definitions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY dashboard_definitions_update ON dashboard_definitions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY dashboard_definitions_delete ON dashboard_definitions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Seed: reporting_field_catalog ──────────────────────────────
-- Pre-populate all available fields for the 4 datasets.

-- daily_sales dataset
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'daily_sales', 'business_date',    'Business Date',    'date',   NULL,   false, true, true, 'business_date',    'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'location_id',      'Location',         'string', NULL,   false, true, true, 'location_id',      'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'order_count',      'Order Count',      'number', 'sum',  true,  true, true, 'order_count',      'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'gross_sales',      'Gross Sales',      'number', 'sum',  true,  true, true, 'gross_sales',      'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'discount_total',   'Discount Total',   'number', 'sum',  true,  true, true, 'discount_total',   'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'tax_total',        'Tax Total',        'number', 'sum',  true,  true, true, 'tax_total',        'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'net_sales',        'Net Sales',        'number', 'sum',  true,  true, true, 'net_sales',        'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'tender_cash',      'Cash Tendered',    'number', 'sum',  true,  true, true, 'tender_cash',      'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'tender_card',      'Card Tendered',    'number', 'sum',  true,  true, true, 'tender_card',      'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'void_count',       'Void Count',       'number', 'sum',  true,  true, true, 'void_count',       'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'void_total',       'Void Total',       'number', 'sum',  true,  true, true, 'void_total',       'rm_daily_sales'),
  (gen_ulid(), 'daily_sales', 'avg_order_value',  'Avg Order Value',  'number', 'avg',  true,  true, true, 'avg_order_value',  'rm_daily_sales')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- item_sales dataset
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'item_sales', 'business_date',     'Business Date',     'date',   NULL,   false, true, true, 'business_date',     'rm_item_sales'),
  (gen_ulid(), 'item_sales', 'location_id',       'Location',          'string', NULL,   false, true, true, 'location_id',       'rm_item_sales'),
  (gen_ulid(), 'item_sales', 'catalog_item_id',   'Item ID',           'string', NULL,   false, true, true, 'catalog_item_id',   'rm_item_sales'),
  (gen_ulid(), 'item_sales', 'catalog_item_name', 'Item Name',         'string', NULL,   false, true, true, 'catalog_item_name', 'rm_item_sales'),
  (gen_ulid(), 'item_sales', 'quantity_sold',     'Quantity Sold',     'number', 'sum',  true,  true, true, 'quantity_sold',     'rm_item_sales'),
  (gen_ulid(), 'item_sales', 'gross_revenue',     'Gross Revenue',     'number', 'sum',  true,  true, true, 'gross_revenue',     'rm_item_sales'),
  (gen_ulid(), 'item_sales', 'quantity_voided',   'Quantity Voided',   'number', 'sum',  true,  true, true, 'quantity_voided',   'rm_item_sales'),
  (gen_ulid(), 'item_sales', 'void_revenue',      'Void Revenue',      'number', 'sum',  true,  true, true, 'void_revenue',      'rm_item_sales')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- inventory dataset
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'inventory', 'location_id',          'Location',            'string',  NULL,   false, true, true, 'location_id',          'rm_inventory_on_hand'),
  (gen_ulid(), 'inventory', 'inventory_item_id',    'Inventory Item ID',   'string',  NULL,   false, true, true, 'inventory_item_id',    'rm_inventory_on_hand'),
  (gen_ulid(), 'inventory', 'item_name',            'Item Name',           'string',  NULL,   false, true, true, 'item_name',            'rm_inventory_on_hand'),
  (gen_ulid(), 'inventory', 'on_hand',              'On Hand',             'number',  'sum',  true,  true, true, 'on_hand',              'rm_inventory_on_hand'),
  (gen_ulid(), 'inventory', 'low_stock_threshold',  'Low Stock Threshold', 'number',  'min',  true,  true, true, 'low_stock_threshold',  'rm_inventory_on_hand'),
  (gen_ulid(), 'inventory', 'is_below_threshold',   'Below Threshold',     'boolean', NULL,   false, true, true, 'is_below_threshold',   'rm_inventory_on_hand')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- customers dataset
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'customers', 'customer_id',    'Customer ID',    'string', NULL,   false, true, true, 'customer_id',    'rm_customer_activity'),
  (gen_ulid(), 'customers', 'customer_name',  'Customer Name',  'string', NULL,   false, true, true, 'customer_name',  'rm_customer_activity'),
  (gen_ulid(), 'customers', 'total_visits',   'Total Visits',   'number', 'sum',  true,  true, true, 'total_visits',   'rm_customer_activity'),
  (gen_ulid(), 'customers', 'total_spend',    'Total Spend',    'number', 'sum',  true,  true, true, 'total_spend',    'rm_customer_activity'),
  (gen_ulid(), 'customers', 'last_visit_at',  'Last Visit',     'date',   NULL,   false, true, true, 'last_visit_at',  'rm_customer_activity')
ON CONFLICT (dataset, field_key) DO NOTHING;
