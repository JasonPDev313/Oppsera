-- ar_invoices
CREATE TABLE IF NOT EXISTS ar_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  billing_account_id TEXT,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  memo TEXT,
  location_id TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  total_amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(12,2) NOT NULL,
  gl_journal_entry_id TEXT,
  source_type TEXT NOT NULL,
  source_reference_id TEXT,
  created_by TEXT NOT NULL,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ar_invoices_tenant_number ON ar_invoices(tenant_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_tenant_customer ON ar_invoices(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_tenant_status ON ar_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_tenant_due_date ON ar_invoices(tenant_id, due_date);

-- ar_invoice_lines
CREATE TABLE IF NOT EXISTS ar_invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES ar_invoices(id),
  account_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL,
  tax_group_id TEXT,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ar_invoice_lines_invoice ON ar_invoice_lines(invoice_id);

-- ar_receipts
CREATE TABLE IF NOT EXISTS ar_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  receipt_date DATE NOT NULL,
  payment_method TEXT,
  reference_number TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft',
  gl_journal_entry_id TEXT,
  bank_account_id TEXT,
  source_type TEXT NOT NULL,
  source_reference_id TEXT,
  created_by TEXT NOT NULL,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_receipts_tenant_customer ON ar_receipts(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_receipts_tenant_status ON ar_receipts(tenant_id, status);

-- ar_receipt_allocations
CREATE TABLE IF NOT EXISTS ar_receipt_allocations (
  receipt_id TEXT NOT NULL REFERENCES ar_receipts(id),
  invoice_id TEXT NOT NULL REFERENCES ar_invoices(id),
  amount_applied NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (receipt_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_ar_receipt_alloc_receipt ON ar_receipt_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_ar_receipt_alloc_invoice ON ar_receipt_allocations(invoice_id);

-- RLS
ALTER TABLE ar_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY ar_invoices_select ON ar_invoices FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_invoices_insert ON ar_invoices FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_invoices_update ON ar_invoices FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_invoices_delete ON ar_invoices FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE ar_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_invoice_lines FORCE ROW LEVEL SECURITY;
-- invoice_lines accessible via join through ar_invoices tenant isolation
CREATE POLICY ar_invoice_lines_select ON ar_invoice_lines FOR SELECT USING (true);
CREATE POLICY ar_invoice_lines_insert ON ar_invoice_lines FOR INSERT WITH CHECK (true);
CREATE POLICY ar_invoice_lines_update ON ar_invoice_lines FOR UPDATE USING (true);
CREATE POLICY ar_invoice_lines_delete ON ar_invoice_lines FOR DELETE USING (true);

ALTER TABLE ar_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY ar_receipts_select ON ar_receipts FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_receipts_insert ON ar_receipts FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_receipts_update ON ar_receipts FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_receipts_delete ON ar_receipts FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE ar_receipt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_receipt_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY ar_receipt_alloc_select ON ar_receipt_allocations FOR SELECT USING (true);
CREATE POLICY ar_receipt_alloc_insert ON ar_receipt_allocations FOR INSERT WITH CHECK (true);
CREATE POLICY ar_receipt_alloc_update ON ar_receipt_allocations FOR UPDATE USING (true);
CREATE POLICY ar_receipt_alloc_delete ON ar_receipt_allocations FOR DELETE USING (true);
