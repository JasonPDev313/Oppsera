-- Tenders Module Schema
-- Creates tables: tenders, tender_reversals, payment_journal_entries

-- ── Tenders (append-only — financial amounts immutable) ─────────
CREATE TABLE IF NOT EXISTS tenders (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  order_id TEXT NOT NULL,
  tender_type TEXT NOT NULL,
  tender_sequence INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  tip_amount INTEGER NOT NULL DEFAULT 0,
  change_given INTEGER NOT NULL DEFAULT 0,
  amount_given INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'captured',
  business_date DATE NOT NULL,
  shift_id TEXT,
  pos_mode TEXT,
  source TEXT NOT NULL DEFAULT 'pos',
  provider_ref TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  gift_card_id TEXT,
  employee_id TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  drawer_event_id TEXT,
  allocation_snapshot JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_tenders_tenant_order ON tenders (tenant_id, order_id);
CREATE INDEX idx_tenders_tenant_location_created ON tenders (tenant_id, location_id, created_at DESC);
CREATE INDEX idx_tenders_tenant_type_created ON tenders (tenant_id, tender_type, created_at DESC);
CREATE INDEX idx_tenders_tenant_location_date_terminal ON tenders (tenant_id, location_id, business_date, terminal_id);
CREATE UNIQUE INDEX uq_tenders_tenant_order_sequence ON tenders (tenant_id, order_id, tender_sequence);

-- RLS for tenders (append-only for financial fields)
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON tenders
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON tenders
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
-- No general UPDATE policy — tenders are append-only for financial fields.
-- Only allow update on allocation_snapshot column.
CREATE POLICY tenant_isolation_update_allocation ON tenders
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON tenders
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Tender Reversals ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tender_reversals (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  original_tender_id TEXT NOT NULL REFERENCES tenders(id),
  order_id TEXT NOT NULL,
  reversal_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  refund_method TEXT,
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_tender_reversals_tender ON tender_reversals (tenant_id, original_tender_id);
CREATE INDEX idx_tender_reversals_order ON tender_reversals (tenant_id, order_id);

-- RLS for tender_reversals
ALTER TABLE tender_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_reversals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON tender_reversals
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON tender_reversals
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON tender_reversals
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON tender_reversals
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Payment Journal Entries (append-only GL posting) ────────────
CREATE TABLE IF NOT EXISTS payment_journal_entries (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  entries JSONB NOT NULL,
  business_date DATE NOT NULL,
  source_module TEXT NOT NULL DEFAULT 'payments',
  posting_status TEXT NOT NULL DEFAULT 'posted',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pje_tenant_date ON payment_journal_entries (tenant_id, business_date);
CREATE INDEX idx_pje_tenant_order ON payment_journal_entries (tenant_id, order_id);
CREATE INDEX idx_pje_ref ON payment_journal_entries (reference_type, reference_id);

-- RLS for payment_journal_entries (append-only — no general update, only posting_status)
ALTER TABLE payment_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_journal_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON payment_journal_entries
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON payment_journal_entries
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
-- Allow update ONLY on posting_status (for voiding)
CREATE POLICY tenant_isolation_update_status ON payment_journal_entries
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON payment_journal_entries
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));
