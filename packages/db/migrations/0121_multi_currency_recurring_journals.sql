-- ACCT-CLOSE-06: Multi-Currency Schema Provisioning + Recurring Journal Entry Templates
-- Part A: Add multi-currency columns (schema prep only, no conversion logic)
-- Part B: Add gl_recurring_templates table

-- ═══════════════════════════════════════════════════════════
-- Part A: Multi-Currency Column Provisioning
-- ═══════════════════════════════════════════════════════════

-- gl_journal_entries: transaction currency + exchange rate
ALTER TABLE gl_journal_entries
  ADD COLUMN IF NOT EXISTS transaction_currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12, 6) NOT NULL DEFAULT 1.000000;

-- accounting_settings: supported currencies array
ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS supported_currencies TEXT[] NOT NULL DEFAULT '{USD}';

-- ═══════════════════════════════════════════════════════════
-- Part B: Recurring Journal Entry Templates
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gl_recurring_templates (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  description     TEXT,
  frequency       TEXT NOT NULL,  -- 'monthly' | 'quarterly' | 'annually'
  day_of_period   INTEGER NOT NULL DEFAULT 1,  -- 1-28 or 0 for last day
  start_date      DATE NOT NULL,
  end_date        DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_posted_period TEXT,   -- 'YYYY-MM' of last successful posting
  next_due_date   DATE,      -- Computed/cached next occurrence
  template_lines  JSONB NOT NULL DEFAULT '[]',  -- Array of { accountId, debitAmount, creditAmount, memo }
  source_module   TEXT NOT NULL DEFAULT 'recurring',
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gl_recurring_templates_tenant
  ON gl_recurring_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gl_recurring_templates_active_due
  ON gl_recurring_templates (tenant_id, is_active, next_due_date)
  WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_recurring_templates_tenant_name
  ON gl_recurring_templates (tenant_id, name);

-- ═══════════════════════════════════════════════════════════
-- RLS for gl_recurring_templates
-- ═══════════════════════════════════════════════════════════

ALTER TABLE gl_recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_recurring_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_recurring_templates_select
  ON gl_recurring_templates FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_recurring_templates_insert
  ON gl_recurring_templates FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_recurring_templates_update
  ON gl_recurring_templates FOR UPDATE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_recurring_templates_delete
  ON gl_recurring_templates FOR DELETE
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
