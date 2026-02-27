-- Migration 0224: Unified Revenue Activity read model
-- Captures ALL revenue-generating activity (POS orders, PMS folios, AR invoices,
-- membership billing, voucher sales) into a single per-transaction table.
-- Also extends rm_daily_sales with non-POS revenue aggregation columns.

-- ── New rm_revenue_activity table ────────────────────────────────
CREATE TABLE IF NOT EXISTS rm_revenue_activity (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  source TEXT NOT NULL,           -- 'pos_order','pms_folio','ar_invoice','membership','voucher'
  source_id TEXT NOT NULL,        -- orderId, folioEntryId, invoiceId, etc.
  source_label TEXT NOT NULL,     -- 'Order #0001', 'Folio Room Charge #F123', etc.
  customer_name TEXT,
  amount_dollars NUMERIC(19,4) NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'completed',  -- completed, voided, refunded
  metadata JSONB,                 -- source-specific extra data
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency: one row per source+sourceId per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_revenue_activity_tenant_source
  ON rm_revenue_activity (tenant_id, source, source_id);
-- Dashboard "recent activity" query (newest first)
CREATE INDEX IF NOT EXISTS idx_rm_revenue_activity_tenant_created
  ON rm_revenue_activity (tenant_id, created_at DESC);
-- Date-range reports
CREATE INDEX IF NOT EXISTS idx_rm_revenue_activity_tenant_date
  ON rm_revenue_activity (tenant_id, business_date DESC);
-- Location-filtered queries
CREATE INDEX IF NOT EXISTS idx_rm_revenue_activity_tenant_loc_created
  ON rm_revenue_activity (tenant_id, location_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE rm_revenue_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_revenue_activity FORCE ROW LEVEL SECURITY;

CREATE POLICY rm_revenue_activity_select ON rm_revenue_activity
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_revenue_activity_insert ON rm_revenue_activity
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_revenue_activity_update ON rm_revenue_activity
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY rm_revenue_activity_delete ON rm_revenue_activity
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- ── Extend rm_daily_sales with non-POS revenue columns ──────────
ALTER TABLE rm_daily_sales
  ADD COLUMN IF NOT EXISTS pms_revenue NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS ar_revenue NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS membership_revenue NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS voucher_revenue NUMERIC(19,4) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS total_business_revenue NUMERIC(19,4) NOT NULL DEFAULT '0';
