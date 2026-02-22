-- Migration 0109: Retail End-of-Day Close Batches
-- One batch per terminal per business date with Z-report data and GL posting

-- ── retail_close_batches ─────────────────────────────────────────
CREATE TABLE retail_close_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  terminal_id TEXT NOT NULL REFERENCES terminals(id),
  business_date DATE NOT NULL,
  drawer_session_id TEXT REFERENCES drawer_sessions(id),
  status TEXT NOT NULL DEFAULT 'open',

  -- Summary data (computed at start)
  gross_sales_cents INTEGER NOT NULL DEFAULT 0,
  net_sales_cents INTEGER NOT NULL DEFAULT 0,
  tax_collected_cents INTEGER NOT NULL DEFAULT 0,
  discount_total_cents INTEGER NOT NULL DEFAULT 0,
  void_total_cents INTEGER NOT NULL DEFAULT 0,
  void_count INTEGER NOT NULL DEFAULT 0,
  service_charge_cents INTEGER NOT NULL DEFAULT 0,
  tips_credit_cents INTEGER NOT NULL DEFAULT 0,
  tips_cash_cents INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  refund_total_cents INTEGER NOT NULL DEFAULT 0,
  refund_count INTEGER NOT NULL DEFAULT 0,

  -- Payment breakdown (JSONB: [{ tenderType, count, totalCents }])
  tender_breakdown JSONB NOT NULL DEFAULT '[]',
  sales_by_department JSONB,
  tax_by_group JSONB,

  -- Cash accountability
  cash_expected_cents INTEGER NOT NULL DEFAULT 0,
  cash_counted_cents INTEGER,
  cash_over_short_cents INTEGER,

  -- Lifecycle
  started_at TIMESTAMPTZ,
  started_by TEXT,
  reconciled_at TIMESTAMPTZ,
  reconciled_by TEXT,
  posted_at TIMESTAMPTZ,
  posted_by TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,

  gl_journal_entry_id TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One close batch per terminal per business date
CREATE UNIQUE INDEX uq_retail_close_terminal_date
  ON retail_close_batches(tenant_id, terminal_id, business_date);

-- Lookup by location + date for dashboard
CREATE INDEX idx_retail_close_location_date
  ON retail_close_batches(tenant_id, location_id, business_date);

-- ── Add cash over/short account to accounting settings ──────────
ALTER TABLE accounting_settings
  ADD COLUMN default_cash_over_short_account_id TEXT REFERENCES gl_accounts(id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE retail_close_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_close_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY rcb_select ON retail_close_batches FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY rcb_insert ON retail_close_batches FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY rcb_update ON retail_close_batches FOR UPDATE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)))
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY rcb_delete ON retail_close_batches FOR DELETE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
