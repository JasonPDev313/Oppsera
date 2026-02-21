-- Migration: 0073_accounts_payable.sql
-- Session 30: AP Subledger — vendor extensions, payment terms, bills, payments, allocations + RLS

-- ── Vendor AP Extensions ────────────────────────────────────────
-- Add AP-specific columns to vendors table (IF NOT EXISTS pattern for safety)
DO $$ BEGIN
  ALTER TABLE vendors ADD COLUMN vendor_number TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE vendors ADD COLUMN default_expense_account_id TEXT REFERENCES gl_accounts(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE vendors ADD COLUMN default_ap_account_id TEXT REFERENCES gl_accounts(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE vendors ADD COLUMN payment_terms_id TEXT;
  -- FK added after payment_terms table is created below
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE vendors ADD COLUMN is_1099_eligible BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Unique partial index on vendor_number (only when not null)
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tenant_vendor_number
  ON vendors(tenant_id, vendor_number) WHERE vendor_number IS NOT NULL;

-- ── Payment Terms ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_terms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  days INTEGER NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_terms_tenant_name ON payment_terms(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_payment_terms_tenant_active ON payment_terms(tenant_id, is_active);

ALTER TABLE payment_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_terms FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_terms_select ON payment_terms FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY payment_terms_insert ON payment_terms FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY payment_terms_update ON payment_terms FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY payment_terms_delete ON payment_terms FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Now add the FK from vendors.payment_terms_id → payment_terms.id
DO $$ BEGIN
  ALTER TABLE vendors ADD CONSTRAINT fk_vendors_payment_terms
    FOREIGN KEY (payment_terms_id) REFERENCES payment_terms(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── AP Bills ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_bills (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  bill_number TEXT NOT NULL,
  bill_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','partial','paid','voided')),
  memo TEXT,
  location_id TEXT,
  payment_terms_id TEXT REFERENCES payment_terms(id),
  vendor_invoice_number TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(12,2) NOT NULL,
  gl_journal_entry_id TEXT,
  receiving_receipt_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  posted_at TIMESTAMPTZ,
  posted_by TEXT,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_bills_tenant_status ON ap_bills(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ap_bills_tenant_vendor ON ap_bills(tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_bills_tenant_due_date ON ap_bills(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_ap_bills_tenant_status_due ON ap_bills(tenant_id, status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ap_bills_tenant_vendor_number
  ON ap_bills(tenant_id, vendor_id, bill_number) WHERE status != 'voided';

ALTER TABLE ap_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_bills FORCE ROW LEVEL SECURITY;

CREATE POLICY ap_bills_select ON ap_bills FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_bills_insert ON ap_bills FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_bills_update ON ap_bills FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_bills_delete ON ap_bills FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── AP Bill Lines ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_bill_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  bill_id TEXT NOT NULL REFERENCES ap_bills(id),
  line_type TEXT NOT NULL DEFAULT 'expense'
    CHECK (line_type IN ('expense','inventory','asset','freight')),
  account_id TEXT NOT NULL REFERENCES gl_accounts(id),
  description TEXT,
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  location_id TEXT,
  department_id TEXT,
  inventory_item_id TEXT,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ap_bill_lines_bill ON ap_bill_lines(bill_id);

ALTER TABLE ap_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_bill_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY ap_bill_lines_select ON ap_bill_lines FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_bill_lines_insert ON ap_bill_lines FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_bill_lines_update ON ap_bill_lines FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_bill_lines_delete ON ap_bill_lines FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── AP Payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  payment_date TEXT NOT NULL,
  payment_method TEXT,
  bank_account_id TEXT,
  reference_number TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','voided')),
  gl_journal_entry_id TEXT,
  memo TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_payments_tenant_status ON ap_payments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ap_payments_tenant_vendor ON ap_payments(tenant_id, vendor_id);

ALTER TABLE ap_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY ap_payments_select ON ap_payments FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_payments_insert ON ap_payments FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_payments_update ON ap_payments FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ap_payments_delete ON ap_payments FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── AP Payment Allocations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_payment_allocations (
  payment_id TEXT NOT NULL REFERENCES ap_payments(id),
  bill_id TEXT NOT NULL REFERENCES ap_bills(id),
  amount_applied NUMERIC(12,2) NOT NULL CHECK (amount_applied > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (payment_id, bill_id)
);

-- RLS via parent payment's tenant_id
ALTER TABLE ap_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_payment_allocations FORCE ROW LEVEL SECURITY;

CREATE POLICY ap_payment_allocations_select ON ap_payment_allocations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM ap_payments WHERE ap_payments.id = ap_payment_allocations.payment_id
    AND ap_payments.tenant_id = current_setting('app.current_tenant_id', true)
  ));
CREATE POLICY ap_payment_allocations_insert ON ap_payment_allocations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM ap_payments WHERE ap_payments.id = ap_payment_allocations.payment_id
    AND ap_payments.tenant_id = current_setting('app.current_tenant_id', true)
  ));
CREATE POLICY ap_payment_allocations_update ON ap_payment_allocations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM ap_payments WHERE ap_payments.id = ap_payment_allocations.payment_id
    AND ap_payments.tenant_id = current_setting('app.current_tenant_id', true)
  ));
CREATE POLICY ap_payment_allocations_delete ON ap_payment_allocations FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM ap_payments WHERE ap_payments.id = ap_payment_allocations.payment_id
    AND ap_payments.tenant_id = current_setting('app.current_tenant_id', true)
  ));
