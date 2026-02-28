-- Migration 0225: Enrich rm_revenue_activity for unified Sales History
-- Adds columns to make the read model self-sufficient for the unified view:
-- source_sub_type (Retail vs F&B split), financial breakdown, employee, payment method.

ALTER TABLE rm_revenue_activity
  ADD COLUMN IF NOT EXISTS source_sub_type TEXT,              -- 'pos_retail' | 'pos_fnb' (splits 'pos_order')
  ADD COLUMN IF NOT EXISTS reference_number TEXT,             -- order number, invoice number, folio ID
  ADD COLUMN IF NOT EXISTS customer_id TEXT,                  -- FK-free customer reference
  ADD COLUMN IF NOT EXISTS employee_id TEXT,                  -- cashier/server who created it
  ADD COLUMN IF NOT EXISTS employee_name TEXT,                -- denormalized for display
  ADD COLUMN IF NOT EXISTS payment_method TEXT,               -- 'cash', 'card', 'house_account', 'split', etc.
  ADD COLUMN IF NOT EXISTS subtotal_dollars NUMERIC(19,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_dollars NUMERIC(19,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_dollars NUMERIC(19,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_dollars NUMERIC(19,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_dollars NUMERIC(19,4) DEFAULT 0;

-- Index for multi-source filter query (Sales History page)
CREATE INDEX IF NOT EXISTS idx_rm_revenue_activity_source_sub
  ON rm_revenue_activity (tenant_id, COALESCE(source_sub_type, source), occurred_at DESC);

-- Index for date range + tenant filtering
CREATE INDEX IF NOT EXISTS idx_rm_revenue_activity_tenant_occurred
  ON rm_revenue_activity (tenant_id, occurred_at DESC);
