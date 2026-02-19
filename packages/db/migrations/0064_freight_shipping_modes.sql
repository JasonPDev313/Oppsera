-- Migration: Freight/Shipping Modes
-- Supports two tenant-configurable modes:
--   EXPENSE: shipping charges post to GL accounts, not allocated to items
--   ALLOCATE: shipping is allocated across receipt lines into item costs

-- 1. Add freight_mode to receiving_receipts
-- Default 'allocate' preserves existing behavior for all current receipts.
ALTER TABLE receiving_receipts
  ADD COLUMN IF NOT EXISTS freight_mode text NOT NULL DEFAULT 'allocate';

-- 2. Add volume to receiving_receipt_lines (for BY_VOLUME allocation)
ALTER TABLE receiving_receipt_lines
  ADD COLUMN IF NOT EXISTS volume numeric(12,4);

-- 3. Create receipt_charges table
-- Stores individual freight/shipping charge line items per receipt.
-- In EXPENSE mode: each charge has a gl_account_code for GL posting.
-- In ALLOCATE mode: sum of charges is allocated across receipt lines.
-- Existing receipts (pre-migration) continue to work via shippingCost field.
CREATE TABLE IF NOT EXISTS receipt_charges (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  receipt_id text NOT NULL REFERENCES receiving_receipts(id) ON DELETE CASCADE,
  charge_type text NOT NULL DEFAULT 'shipping',
  description text,
  amount numeric(12,4) NOT NULL DEFAULT 0,
  gl_account_code text,
  gl_account_name text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_charges_receipt ON receipt_charges(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_charges_tenant ON receipt_charges(tenant_id);

-- RLS
ALTER TABLE receipt_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_charges FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON receipt_charges FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON receipt_charges FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON receipt_charges FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON receipt_charges FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
