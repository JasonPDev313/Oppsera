-- Session 47: Chargeback Support
-- Tracks payment disputes from received → resolved (won/lost).

CREATE TABLE IF NOT EXISTS chargebacks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL,
  tender_id TEXT NOT NULL REFERENCES tenders(id),
  order_id TEXT NOT NULL,
  chargeback_reason TEXT NOT NULL,
  chargeback_amount_cents INTEGER NOT NULL,
  fee_amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',  -- 'received', 'under_review', 'won', 'lost'
  provider_case_id TEXT,
  provider_ref TEXT,
  customer_id TEXT,
  resolution_reason TEXT,
  resolution_date DATE,
  business_date DATE NOT NULL,
  gl_journal_entry_id TEXT,
  reversal_gl_journal_entry_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  resolved_by TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chargebacks_tenant_status
  ON chargebacks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chargebacks_tenant_tender
  ON chargebacks(tenant_id, tender_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_tenant_order
  ON chargebacks(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_tenant_date
  ON chargebacks(tenant_id, business_date);

-- RLS
ALTER TABLE chargebacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chargebacks FORCE ROW LEVEL SECURITY;

CREATE POLICY chargebacks_select ON chargebacks
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY chargebacks_insert ON chargebacks
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY chargebacks_update ON chargebacks
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
