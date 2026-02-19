-- Session 22: Report Snapshots (V2-ready schema)
-- Schema only — no background logic implemented yet.

CREATE TABLE IF NOT EXISTS report_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  report_id TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS report_snapshots_tenant_report_idx
  ON report_snapshots (tenant_id, report_id, generated_at);

-- RLS
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY report_snapshots_tenant_isolation ON report_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
