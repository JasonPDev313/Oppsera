-- accounting_close_periods
CREATE TABLE IF NOT EXISTS accounting_close_periods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  posting_period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  checklist JSONB NOT NULL DEFAULT '{}',
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_close_periods_tenant_period
  ON accounting_close_periods(tenant_id, posting_period);
CREATE INDEX IF NOT EXISTS idx_accounting_close_periods_status
  ON accounting_close_periods(tenant_id, status);

-- RLS
ALTER TABLE accounting_close_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_close_periods FORCE ROW LEVEL SECURITY;

CREATE POLICY accounting_close_periods_select ON accounting_close_periods
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY accounting_close_periods_insert ON accounting_close_periods
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY accounting_close_periods_update ON accounting_close_periods
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY accounting_close_periods_delete ON accounting_close_periods
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));
