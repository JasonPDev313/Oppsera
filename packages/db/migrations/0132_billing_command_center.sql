-- Migration: 0132_billing_command_center.sql
-- Session 10: Billing Command Center - cycle run tracking

-- ── billing_cycle_runs ──────────────────────────────────────────────
CREATE TABLE billing_cycle_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  cycle_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview', -- preview, in_progress, completed, cancelled
  steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { stepName, status, startedAt, completedAt, summary }
  started_by TEXT, -- user ID who initiated
  preview_summary JSONB, -- Cached preview data
  total_dues_billed_cents BIGINT NOT NULL DEFAULT 0,
  total_initiation_billed_cents BIGINT NOT NULL DEFAULT 0,
  total_minimums_charged_cents BIGINT NOT NULL DEFAULT 0,
  total_late_fees_cents BIGINT NOT NULL DEFAULT 0,
  total_statements_generated INTEGER NOT NULL DEFAULT 0,
  total_autopay_collected_cents BIGINT NOT NULL DEFAULT 0,
  exceptions_json JSONB, -- Excluded accounts with reasons
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_cycle_runs_tenant_date ON billing_cycle_runs(tenant_id, cycle_date);
CREATE INDEX idx_billing_cycle_runs_tenant_status ON billing_cycle_runs(tenant_id, status);
CREATE UNIQUE INDEX uq_billing_cycle_runs_tenant_active ON billing_cycle_runs(tenant_id)
  WHERE status IN ('preview', 'in_progress');

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE billing_cycle_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycle_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_cycle_runs_select ON billing_cycle_runs
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

CREATE POLICY billing_cycle_runs_insert ON billing_cycle_runs
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));

CREATE POLICY billing_cycle_runs_update ON billing_cycle_runs
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

CREATE POLICY billing_cycle_runs_delete ON billing_cycle_runs
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
