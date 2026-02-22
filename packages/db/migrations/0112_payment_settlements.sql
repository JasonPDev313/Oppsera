-- Migration 0112: Payment Settlements + Settlement Lines
-- UXOPS-05: Card Settlement + Clearing Accounts

-- ── payment_settlements ─────────────────────────────────────────────
CREATE TABLE payment_settlements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT,
  settlement_date DATE NOT NULL,
  processor_name TEXT NOT NULL,
  processor_batch_id TEXT,
  gross_amount NUMERIC(12,2) NOT NULL,
  fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL,
  chargeback_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  bank_account_id TEXT REFERENCES bank_accounts(id),
  gl_journal_entry_id TEXT,
  import_source TEXT NOT NULL DEFAULT 'manual',
  raw_data JSONB,
  business_date_from DATE,
  business_date_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, processor_name, processor_batch_id)
);

CREATE INDEX idx_payment_settlements_tenant_status ON payment_settlements(tenant_id, status);
CREATE INDEX idx_payment_settlements_tenant_date ON payment_settlements(tenant_id, settlement_date);
CREATE INDEX idx_payment_settlements_tenant_processor ON payment_settlements(tenant_id, processor_name);

-- ── payment_settlement_lines ────────────────────────────────────────
CREATE TABLE payment_settlement_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  settlement_id TEXT NOT NULL REFERENCES payment_settlements(id),
  tender_id TEXT,
  original_amount_cents INTEGER NOT NULL,
  settled_amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unmatched',
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlement_lines_settlement ON payment_settlement_lines(settlement_id);
CREATE INDEX idx_settlement_lines_tender ON payment_settlement_lines(tender_id);
CREATE INDEX idx_settlement_lines_tenant_status ON payment_settlement_lines(tenant_id, status);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE payment_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settlements FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_settlements_select ON payment_settlements
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY payment_settlements_insert ON payment_settlements
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY payment_settlements_update ON payment_settlements
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY payment_settlements_delete ON payment_settlements
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

ALTER TABLE payment_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settlement_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_settlement_lines_select ON payment_settlement_lines
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY payment_settlement_lines_insert ON payment_settlement_lines
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY payment_settlement_lines_update ON payment_settlement_lines
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY payment_settlement_lines_delete ON payment_settlement_lines
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
