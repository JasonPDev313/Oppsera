-- Migration: 0010_orders
-- Creates orders, order_lines, order_charges, order_discounts, order_counters, idempotency_keys

-- ── orders ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'pos',
  version INTEGER NOT NULL DEFAULT 1,
  customer_id TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  service_charge_total INTEGER NOT NULL DEFAULT 0,
  discount_total INTEGER NOT NULL DEFAULT 0,
  rounding_adjustment INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  metadata JSONB,
  business_date DATE NOT NULL,
  terminal_id TEXT,
  employee_id TEXT,
  shift_id TEXT,
  receipt_snapshot JSONB,
  placed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  voided_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX uq_orders_tenant_location_number ON orders (tenant_id, location_id, order_number);
CREATE INDEX idx_orders_tenant_location_status ON orders (tenant_id, location_id, status);
CREATE INDEX idx_orders_tenant_location_created ON orders (tenant_id, location_id, created_at);
CREATE INDEX idx_orders_tenant_location_business_date ON orders (tenant_id, location_id, business_date);
CREATE INDEX idx_orders_tenant_customer ON orders (tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_orders_tenant_employee ON orders (tenant_id, employee_id) WHERE employee_id IS NOT NULL;

-- ── order_lines ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  catalog_item_id TEXT NOT NULL,
  catalog_item_name TEXT NOT NULL,
  catalog_item_sku TEXT,
  item_type TEXT NOT NULL,
  qty NUMERIC(10,4) NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  original_unit_price INTEGER,
  price_override_reason TEXT,
  price_overridden_by TEXT,
  line_subtotal INTEGER NOT NULL,
  line_tax INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL,
  tax_calculation_mode TEXT,
  modifiers JSONB,
  special_instructions TEXT,
  selected_options JSONB,
  package_components JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_lines_order_sort ON order_lines (order_id, sort_order);
CREATE INDEX idx_order_lines_tenant_item ON order_lines (tenant_id, catalog_item_id);

-- ── order_charges ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_charges (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  charge_type TEXT NOT NULL,
  name TEXT NOT NULL,
  calculation_type TEXT NOT NULL,
  value INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  is_taxable BOOLEAN NOT NULL DEFAULT FALSE,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_charges_order ON order_charges (order_id);

-- ── order_discounts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_discounts (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  type TEXT NOT NULL,
  value INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_discounts_order ON order_discounts (order_id);

-- ── order_counters ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_counters (
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, location_id)
);

-- ── idempotency_keys ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  result_payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_idempotency_keys_tenant_request ON idempotency_keys (tenant_id, client_request_id);
CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys (expires_at);

-- ── RLS Policies ────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- orders
CREATE POLICY orders_select ON orders FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY orders_insert ON orders FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY orders_update ON orders FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY orders_delete ON orders FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- order_lines
CREATE POLICY order_lines_select ON order_lines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_lines_insert ON order_lines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_lines_update ON order_lines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_lines_delete ON order_lines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- order_charges
CREATE POLICY order_charges_select ON order_charges FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_charges_insert ON order_charges FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_charges_update ON order_charges FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_charges_delete ON order_charges FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- order_discounts
CREATE POLICY order_discounts_select ON order_discounts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_discounts_insert ON order_discounts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_discounts_update ON order_discounts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_discounts_delete ON order_discounts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- order_counters (append-only: SELECT + INSERT only)
CREATE POLICY order_counters_select ON order_counters FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_counters_insert ON order_counters FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_counters_update ON order_counters FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_counters_delete ON order_counters FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- idempotency_keys
CREATE POLICY idempotency_keys_select ON idempotency_keys FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY idempotency_keys_insert ON idempotency_keys FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY idempotency_keys_update ON idempotency_keys FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY idempotency_keys_delete ON idempotency_keys FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
