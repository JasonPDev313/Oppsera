-- Migration: 0030_inventory_gaps
-- Inventory gaps domain: catalog combos, combo items, purchase invoices, purchase invoice items

-- ══════════════════════════════════════════════════════════════════
-- INVENTORY GAPS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── catalog_combos ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_combos (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  catalog_item_id   TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_combos_tenant_item ON catalog_combos (tenant_id, catalog_item_id);

ALTER TABLE catalog_combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_combos_select ON catalog_combos FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_combos_insert ON catalog_combos FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_combos_update ON catalog_combos FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_combos_delete ON catalog_combos FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── catalog_combo_items ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_combo_items (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  combo_id          TEXT NOT NULL REFERENCES catalog_combos(id) ON DELETE CASCADE,
  catalog_item_id   TEXT NOT NULL,
  quantity          INTEGER NOT NULL DEFAULT 1,
  price_cents       INTEGER,
  unit_price_cents  INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_combo_items_tenant_combo ON catalog_combo_items (tenant_id, combo_id);

ALTER TABLE catalog_combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_combo_items_select ON catalog_combo_items FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_combo_items_insert ON catalog_combo_items FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_combo_items_update ON catalog_combo_items FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_combo_items_delete ON catalog_combo_items FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── purchase_invoices ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  ref_name            TEXT,
  vendor_id           TEXT,
  invoice_number      TEXT,
  receive_date        DATE,
  invoice_date        DATE,
  po_number           TEXT,
  purchase_order_id   TEXT,
  subtotal_cents      INTEGER NOT NULL DEFAULT 0,
  tax_cents           INTEGER NOT NULL DEFAULT 0,
  shipping_cost_cents INTEGER NOT NULL DEFAULT 0,
  other_costs_cents   INTEGER NOT NULL DEFAULT 0,
  total_cents         INTEGER NOT NULL DEFAULT 0,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_tenant_vendor ON purchase_invoices (tenant_id, vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_tenant_invoice_number ON purchase_invoices (tenant_id, invoice_number) WHERE invoice_number IS NOT NULL;

ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_invoices_select ON purchase_invoices FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_invoices_insert ON purchase_invoices FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_invoices_update ON purchase_invoices FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_invoices_delete ON purchase_invoices FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── purchase_invoice_items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  purchase_invoice_id   TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  catalog_item_id       TEXT,
  vendor_item_id        TEXT,
  title                 TEXT NOT NULL,
  in_stock_quantity     INTEGER NOT NULL DEFAULT 0,
  purchase_quantity     INTEGER NOT NULL DEFAULT 0,
  unit_cost_cents       INTEGER NOT NULL DEFAULT 0,
  other_cost_cents      INTEGER NOT NULL DEFAULT 0,
  shipping_cost_cents   INTEGER NOT NULL DEFAULT 0,
  product_cost_cents    INTEGER NOT NULL DEFAULT 0,
  total_cost_cents      INTEGER NOT NULL DEFAULT 0,
  total_quantity        INTEGER NOT NULL DEFAULT 0,
  new_cost_cents        INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_tenant_invoice ON purchase_invoice_items (tenant_id, purchase_invoice_id);

ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_invoice_items_select ON purchase_invoice_items FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_invoice_items_insert ON purchase_invoice_items FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_invoice_items_update ON purchase_invoice_items FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_invoice_items_delete ON purchase_invoice_items FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
