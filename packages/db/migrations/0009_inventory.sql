-- Inventory Module Schema
-- Creates tables: inventory_items, inventory_movements
-- Provisioned V2 tables: inventory_snapshots, inventory_counts, inventory_count_lines,
--   inventory_vendors, inventory_purchase_orders, inventory_po_lines,
--   inventory_recipes, inventory_recipe_components

-- ══════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ══════════════════════════════════════════════════════════════════

-- ── Inventory Items ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  catalog_item_id TEXT NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  track_inventory BOOLEAN NOT NULL DEFAULT true,
  base_unit TEXT NOT NULL DEFAULT 'each',
  purchase_unit TEXT NOT NULL DEFAULT 'each',
  purchase_to_base_ratio NUMERIC(10,4) NOT NULL DEFAULT '1',
  costing_method TEXT NOT NULL DEFAULT 'fifo',
  standard_cost NUMERIC(12,2),
  reorder_point NUMERIC(10,4),
  reorder_quantity NUMERIC(10,4),
  par_level NUMERIC(10,4),
  allow_negative BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE UNIQUE INDEX uq_inventory_items_tenant_location_catalog ON inventory_items (tenant_id, location_id, catalog_item_id);
CREATE INDEX idx_inventory_items_tenant_location_status ON inventory_items (tenant_id, location_id, status);
CREATE INDEX idx_inventory_items_tenant_sku ON inventory_items (tenant_id, sku) WHERE sku IS NOT NULL;

-- RLS for inventory_items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_items
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_items
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_items
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_items
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Inventory Movements (append-only — never update or delete) ──
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  movement_type TEXT NOT NULL,
  quantity_delta NUMERIC(10,4) NOT NULL,
  unit_cost NUMERIC(12,2),
  extended_cost NUMERIC(12,2),
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  business_date DATE NOT NULL,
  employee_id TEXT,
  terminal_id TEXT,
  batch_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX idx_inventory_movements_item ON inventory_movements (tenant_id, inventory_item_id, created_at);
CREATE INDEX idx_inventory_movements_tenant_location_date ON inventory_movements (tenant_id, location_id, business_date);
CREATE INDEX idx_inventory_movements_reference ON inventory_movements (tenant_id, reference_type, reference_id) WHERE reference_type IS NOT NULL;
CREATE UNIQUE INDEX uq_inventory_movements_idempotency ON inventory_movements (tenant_id, reference_type, reference_id, inventory_item_id, movement_type) WHERE reference_type IS NOT NULL;

-- RLS for inventory_movements (append-only by convention; DB allows update/delete for admin use)
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_movements
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_movements
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_movements
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_movements
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- PROVISIONED V2 TABLES (empty stubs with basic structure)
-- ══════════════════════════════════════════════════════════════════

-- ── Inventory Snapshots ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  snapshot_date DATE NOT NULL,
  on_hand NUMERIC(10,4),
  unit_cost NUMERIC(12,2),
  total_value NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_snapshots_tenant_item ON inventory_snapshots (tenant_id, inventory_item_id, snapshot_date);
CREATE INDEX idx_inventory_snapshots_tenant_location_date ON inventory_snapshots (tenant_id, location_id, snapshot_date);

ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_snapshots
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_snapshots
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_snapshots
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_snapshots
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Inventory Counts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_counts (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  count_type TEXT,
  status TEXT DEFAULT 'in_progress',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_counts_tenant_location ON inventory_counts (tenant_id, location_id);
CREATE INDEX idx_inventory_counts_tenant_status ON inventory_counts (tenant_id, status);

ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_counts
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_counts
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_counts
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_counts
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Inventory Count Lines ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  count_id TEXT NOT NULL REFERENCES inventory_counts(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  expected_qty NUMERIC(10,4),
  counted_qty NUMERIC(10,4),
  variance NUMERIC(10,4),
  status TEXT DEFAULT 'pending',
  counted_by TEXT,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_count_lines_count ON inventory_count_lines (tenant_id, count_id);
CREATE INDEX idx_inventory_count_lines_item ON inventory_count_lines (tenant_id, inventory_item_id);

ALTER TABLE inventory_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_count_lines
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_count_lines
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_count_lines
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_count_lines
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Inventory Vendors ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_vendors (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT,
  code TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_vendors_tenant ON inventory_vendors (tenant_id);
CREATE INDEX idx_inventory_vendors_tenant_status ON inventory_vendors (tenant_id, status);

ALTER TABLE inventory_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_vendors
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_vendors
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_vendors
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_vendors
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Inventory Purchase Orders ───────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_purchase_orders (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  vendor_id TEXT REFERENCES inventory_vendors(id),
  po_number TEXT,
  status TEXT DEFAULT 'draft',
  order_date DATE,
  expected_date DATE,
  total NUMERIC(12,2),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_purchase_orders_tenant ON inventory_purchase_orders (tenant_id);
CREATE INDEX idx_inventory_purchase_orders_tenant_location ON inventory_purchase_orders (tenant_id, location_id);
CREATE INDEX idx_inventory_purchase_orders_tenant_vendor ON inventory_purchase_orders (tenant_id, vendor_id);
CREATE INDEX idx_inventory_purchase_orders_tenant_status ON inventory_purchase_orders (tenant_id, status);

ALTER TABLE inventory_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_purchase_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_purchase_orders
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_purchase_orders
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_purchase_orders
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_purchase_orders
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Inventory PO Lines ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_po_lines (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  purchase_order_id TEXT NOT NULL REFERENCES inventory_purchase_orders(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity NUMERIC(10,4),
  unit_cost NUMERIC(12,2),
  extended_cost NUMERIC(12,2),
  received_qty NUMERIC(10,4) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_po_lines_po ON inventory_po_lines (tenant_id, purchase_order_id);
CREATE INDEX idx_inventory_po_lines_item ON inventory_po_lines (tenant_id, inventory_item_id);

ALTER TABLE inventory_po_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_po_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_po_lines
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_po_lines
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_po_lines
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_po_lines
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Inventory Recipes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_recipes (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  catalog_item_id TEXT,
  name TEXT,
  yield_qty NUMERIC(10,4) DEFAULT 1,
  yield_unit TEXT DEFAULT 'each',
  instructions TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_recipes_tenant ON inventory_recipes (tenant_id);
CREATE INDEX idx_inventory_recipes_tenant_catalog ON inventory_recipes (tenant_id, catalog_item_id);
CREATE INDEX idx_inventory_recipes_tenant_status ON inventory_recipes (tenant_id, status);

ALTER TABLE inventory_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_recipes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_recipes
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_recipes
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_recipes
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_recipes
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Inventory Recipe Components ─────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_recipe_components (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  recipe_id TEXT NOT NULL REFERENCES inventory_recipes(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity NUMERIC(10,4),
  unit TEXT,
  waste_factor NUMERIC(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_recipe_components_recipe ON inventory_recipe_components (tenant_id, recipe_id);
CREATE INDEX idx_inventory_recipe_components_item ON inventory_recipe_components (tenant_id, inventory_item_id);

ALTER TABLE inventory_recipe_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_recipe_components FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON inventory_recipe_components
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON inventory_recipe_components
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON inventory_recipe_components
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON inventory_recipe_components
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));
