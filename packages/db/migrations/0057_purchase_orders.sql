-- Migration: 0057_purchase_orders
-- Purchase Order module: purchase_orders, purchase_order_lines,
-- purchase_order_revisions. Also adds purchase_order_id column to
-- receiving_receipts, FK constraints + indexes on receiving tables.

-- ── Purchase Orders ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  location_id            TEXT NOT NULL REFERENCES locations(id),
  vendor_id              TEXT NOT NULL REFERENCES vendors(id),
  po_number              TEXT NOT NULL,
  version                INTEGER NOT NULL DEFAULT 1,
  status                 TEXT NOT NULL DEFAULT 'draft',

  expected_delivery_date DATE,
  shipping_method        TEXT,
  payment_terms          TEXT,
  notes                  TEXT,

  subtotal               NUMERIC(12,4) NOT NULL DEFAULT 0,
  shipping_cost          NUMERIC(12,4) NOT NULL DEFAULT 0,
  tax_amount             NUMERIC(12,4) NOT NULL DEFAULT 0,
  total                  NUMERIC(12,4) NOT NULL DEFAULT 0,

  submitted_at           TIMESTAMPTZ,
  submitted_by           TEXT,
  sent_at                TIMESTAMPTZ,
  sent_by                TEXT,
  closed_at              TIMESTAMPTZ,
  closed_by              TEXT,
  canceled_at            TIMESTAMPTZ,
  canceled_by            TEXT,
  cancel_reason          TEXT,

  created_by             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_tenant_number
  ON purchase_orders (tenant_id, po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_status
  ON purchase_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_vendor
  ON purchase_orders (tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_location
  ON purchase_orders (tenant_id, location_id);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY purchase_orders_select ON purchase_orders FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_orders_insert ON purchase_orders FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_orders_update ON purchase_orders FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_orders_delete ON purchase_orders FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Purchase Order Lines ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  purchase_order_id   TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id   TEXT NOT NULL REFERENCES inventory_items(id),
  vendor_item_id      TEXT REFERENCES item_vendors(id),

  qty_ordered         NUMERIC(12,4) NOT NULL,
  uom_code            TEXT NOT NULL,
  qty_ordered_base    NUMERIC(12,4) NOT NULL DEFAULT 0,
  qty_received        NUMERIC(12,4) NOT NULL DEFAULT 0,

  unit_cost           NUMERIC(12,4) NOT NULL,
  extended_cost       NUMERIC(12,4) NOT NULL DEFAULT 0,

  sort_order          INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_tenant_po
  ON purchase_order_lines (tenant_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_tenant_item
  ON purchase_order_lines (tenant_id, inventory_item_id);

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY purchase_order_lines_select ON purchase_order_lines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_order_lines_insert ON purchase_order_lines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_order_lines_update ON purchase_order_lines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY purchase_order_lines_delete ON purchase_order_lines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Purchase Order Revisions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_revisions (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  purchase_order_id   TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  revision_number     INTEGER NOT NULL,
  snapshot            JSONB NOT NULL,
  reason              TEXT,

  created_by          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_po_revisions_tenant_po_rev
  ON purchase_order_revisions (tenant_id, purchase_order_id, revision_number);
CREATE INDEX IF NOT EXISTS idx_po_revisions_tenant_po
  ON purchase_order_revisions (tenant_id, purchase_order_id);

ALTER TABLE purchase_order_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_revisions FORCE ROW LEVEL SECURITY;

CREATE POLICY po_revisions_select ON purchase_order_revisions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY po_revisions_insert ON purchase_order_revisions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY po_revisions_update ON purchase_order_revisions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY po_revisions_delete ON purchase_order_revisions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Additive changes to existing receiving tables ───────────────

-- Add purchase_order_id to receiving_receipts header for PO linkage
ALTER TABLE receiving_receipts
  ADD COLUMN IF NOT EXISTS purchase_order_id TEXT REFERENCES purchase_orders(id);

CREATE INDEX IF NOT EXISTS idx_receiving_receipts_tenant_po
  ON receiving_receipts (tenant_id, purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

-- Add FK constraints on existing receiving_receipt_lines columns
-- (these were plain text columns in 0056 since PO tables didn't exist yet)
ALTER TABLE receiving_receipt_lines
  ADD CONSTRAINT fk_receipt_lines_po
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);

ALTER TABLE receiving_receipt_lines
  ADD CONSTRAINT fk_receipt_lines_po_line
  FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id);

-- Index for fast "how much has been received against this PO line?" lookups
CREATE INDEX IF NOT EXISTS idx_receipt_lines_tenant_po_line
  ON receiving_receipt_lines (tenant_id, purchase_order_line_id)
  WHERE purchase_order_line_id IS NOT NULL;
