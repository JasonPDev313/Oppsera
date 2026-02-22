-- Migration 0115: COGS Posting Mode (UXOPS-08)
-- Evolves COGS from boolean to tri-state: disabled/perpetual/periodic
-- Adds periodic COGS calculation table

-- ── Extend accounting_settings ─────────────────────────────────────
ALTER TABLE accounting_settings
  ADD COLUMN cogs_posting_mode TEXT NOT NULL DEFAULT 'disabled',
  ADD COLUMN periodic_cogs_last_calculated_date DATE,
  ADD COLUMN periodic_cogs_method TEXT DEFAULT 'weighted_average';

-- Backfill: existing tenants with enableCogsPosting=true → 'perpetual'
UPDATE accounting_settings
SET cogs_posting_mode = 'perpetual'
WHERE enable_cogs_posting = true;

-- ── periodic_cogs_calculations ─────────────────────────────────────
CREATE TABLE periodic_cogs_calculations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  calculation_method TEXT NOT NULL,
  beginning_inventory_dollars NUMERIC(12,2) NOT NULL,
  purchases_dollars NUMERIC(12,2) NOT NULL,
  ending_inventory_dollars NUMERIC(12,2) NOT NULL,
  cogs_dollars NUMERIC(12,2) NOT NULL,
  detail JSONB,
  gl_journal_entry_id TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  posted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE periodic_cogs_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodic_cogs_calculations FORCE ROW LEVEL SECURITY;

CREATE POLICY periodic_cogs_calculations_select ON periodic_cogs_calculations
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY periodic_cogs_calculations_insert ON periodic_cogs_calculations
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY periodic_cogs_calculations_update ON periodic_cogs_calculations
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY periodic_cogs_calculations_delete ON periodic_cogs_calculations
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE INDEX idx_periodic_cogs_tenant_status
  ON periodic_cogs_calculations(tenant_id, status);
CREATE INDEX idx_periodic_cogs_tenant_period
  ON periodic_cogs_calculations(tenant_id, period_start, period_end);
