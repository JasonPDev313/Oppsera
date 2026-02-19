-- Migration: 0056_receiving
-- Receiving module: vendors, UOMs, item conversions, item vendors,
-- item identifiers, receiving receipts, receipt lines.
-- Also adds current_cost column to existing inventory_items table.

-- ── Vendors ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id               TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  name             TEXT NOT NULL,
  account_number   TEXT,
  contact_name     TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  payment_terms    TEXT,
  address_line1    TEXT,
  address_line2    TEXT,
  city             TEXT,
  state            TEXT,
  postal_code      TEXT,
  country          TEXT,
  tax_id           TEXT,
  notes            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_tenant_name
  ON vendors (tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tenant_account_number
  ON vendors (tenant_id, account_number) WHERE account_number IS NOT NULL;

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;

CREATE POLICY vendors_select ON vendors FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY vendors_insert ON vendors FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY vendors_update ON vendors FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY vendors_delete ON vendors FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Units of Measure ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uoms (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_uoms_tenant_code
  ON uoms (tenant_id, code);

ALTER TABLE uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE uoms FORCE ROW LEVEL SECURITY;

CREATE POLICY uoms_select ON uoms FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY uoms_insert ON uoms FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY uoms_update ON uoms FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY uoms_delete ON uoms FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Item UOM Conversions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_uom_conversions (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  inventory_item_id   TEXT NOT NULL REFERENCES inventory_items(id),
  from_uom_id         TEXT NOT NULL REFERENCES uoms(id),
  to_uom_id           TEXT NOT NULL REFERENCES uoms(id),
  conversion_factor   NUMERIC(12,4) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_uom_conversions_tenant_item_from
  ON item_uom_conversions (tenant_id, inventory_item_id, from_uom_id);

ALTER TABLE item_uom_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_uom_conversions FORCE ROW LEVEL SECURITY;

CREATE POLICY item_uom_conversions_select ON item_uom_conversions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_uom_conversions_insert ON item_uom_conversions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_uom_conversions_update ON item_uom_conversions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_uom_conversions_delete ON item_uom_conversions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Item Vendors ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_vendors (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  inventory_item_id   TEXT NOT NULL REFERENCES inventory_items(id),
  vendor_id           TEXT NOT NULL REFERENCES vendors(id),
  vendor_sku          TEXT,
  vendor_cost         NUMERIC(12,4),
  lead_time_days      INTEGER,
  is_preferred        BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_vendors_tenant_item_vendor
  ON item_vendors (tenant_id, inventory_item_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_item_vendors_tenant_vendor
  ON item_vendors (tenant_id, vendor_id);

ALTER TABLE item_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_vendors FORCE ROW LEVEL SECURITY;

CREATE POLICY item_vendors_select ON item_vendors FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_vendors_insert ON item_vendors FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_vendors_update ON item_vendors FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_vendors_delete ON item_vendors FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Item Identifiers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_identifiers (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  inventory_item_id   TEXT NOT NULL REFERENCES inventory_items(id),
  identifier_type     TEXT NOT NULL,
  value               TEXT NOT NULL,
  is_primary          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_identifiers_tenant_type_value
  ON item_identifiers (tenant_id, identifier_type, value);
CREATE INDEX IF NOT EXISTS idx_item_identifiers_tenant_value
  ON item_identifiers (tenant_id, value);
CREATE INDEX IF NOT EXISTS idx_item_identifiers_tenant_item
  ON item_identifiers (tenant_id, inventory_item_id);

ALTER TABLE item_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_identifiers FORCE ROW LEVEL SECURITY;

CREATE POLICY item_identifiers_select ON item_identifiers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_identifiers_insert ON item_identifiers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_identifiers_update ON item_identifiers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY item_identifiers_delete ON item_identifiers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Receiving Receipts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receiving_receipts (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  location_id                 TEXT NOT NULL REFERENCES locations(id),
  vendor_id                   TEXT NOT NULL REFERENCES vendors(id),
  receipt_number              TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'draft',
  vendor_invoice_number       TEXT,
  received_date               DATE NOT NULL,
  shipping_cost               NUMERIC(12,4) NOT NULL DEFAULT 0,
  shipping_allocation_method  TEXT NOT NULL DEFAULT 'none',
  tax_amount                  NUMERIC(12,4) NOT NULL DEFAULT 0,
  subtotal                    NUMERIC(12,4) NOT NULL DEFAULT 0,
  total                       NUMERIC(12,4) NOT NULL DEFAULT 0,
  notes                       TEXT,
  posted_at                   TIMESTAMPTZ,
  posted_by                   TEXT,
  voided_at                   TIMESTAMPTZ,
  voided_by                   TEXT,
  created_by                  TEXT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_receipts_tenant_number
  ON receiving_receipts (tenant_id, receipt_number);
CREATE INDEX IF NOT EXISTS idx_receiving_receipts_tenant_status
  ON receiving_receipts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_receiving_receipts_tenant_vendor
  ON receiving_receipts (tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_receiving_receipts_tenant_location
  ON receiving_receipts (tenant_id, location_id);

ALTER TABLE receiving_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receiving_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY receiving_receipts_select ON receiving_receipts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY receiving_receipts_insert ON receiving_receipts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY receiving_receipts_update ON receiving_receipts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY receiving_receipts_delete ON receiving_receipts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Receiving Receipt Lines ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS receiving_receipt_lines (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  receipt_id            TEXT NOT NULL REFERENCES receiving_receipts(id) ON DELETE CASCADE,
  inventory_item_id     TEXT NOT NULL REFERENCES inventory_items(id),
  vendor_item_id        TEXT REFERENCES item_vendors(id),
  quantity_received     NUMERIC(12,4) NOT NULL,
  uom_code              TEXT NOT NULL,
  unit_cost             NUMERIC(12,4) NOT NULL,
  extended_cost         NUMERIC(12,4) NOT NULL DEFAULT 0,
  allocated_shipping    NUMERIC(12,4) NOT NULL DEFAULT 0,
  landed_cost           NUMERIC(12,4) NOT NULL DEFAULT 0,
  landed_unit_cost      NUMERIC(12,4) NOT NULL DEFAULT 0,
  base_qty              NUMERIC(12,4) NOT NULL DEFAULT 0,
  weight                NUMERIC(12,4),
  lot_number            TEXT,
  serial_numbers        JSONB,
  expiration_date       DATE,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  notes                 TEXT,
  purchase_order_id     TEXT,
  purchase_order_line_id TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receiving_receipt_lines_tenant_receipt
  ON receiving_receipt_lines (tenant_id, receipt_id);
CREATE INDEX IF NOT EXISTS idx_receiving_receipt_lines_tenant_item
  ON receiving_receipt_lines (tenant_id, inventory_item_id);

ALTER TABLE receiving_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE receiving_receipt_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY receiving_receipt_lines_select ON receiving_receipt_lines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY receiving_receipt_lines_insert ON receiving_receipt_lines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY receiving_receipt_lines_update ON receiving_receipt_lines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY receiving_receipt_lines_delete ON receiving_receipt_lines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Add current_cost to inventory_items ─────────────────────────
-- Live weighted avg / last cost — updated when receipts are posted.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS current_cost NUMERIC(12,4) DEFAULT 0;
