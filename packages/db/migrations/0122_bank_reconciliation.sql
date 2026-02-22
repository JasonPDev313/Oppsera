-- Migration 0122: Bank Reconciliation (ACCT-CLOSE-07)
-- Adds bank reconciliation tables for matching GL entries to bank statements

-- Add last_reconciled_date to bank_accounts
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS last_reconciled_date DATE;

-- bank_reconciliations: one per bank account per statement period
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  statement_date DATE NOT NULL,
  statement_ending_balance NUMERIC(12,2) NOT NULL,
  beginning_balance NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',  -- 'in_progress' | 'completed'
  cleared_balance NUMERIC(12,2) NOT NULL DEFAULT '0',
  outstanding_deposits NUMERIC(12,2) NOT NULL DEFAULT '0',
  outstanding_withdrawals NUMERIC(12,2) NOT NULL DEFAULT '0',
  adjustment_total NUMERIC(12,2) NOT NULL DEFAULT '0',
  difference NUMERIC(12,2) NOT NULL DEFAULT '0',
  reconciled_by TEXT,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, bank_account_id, statement_date)
);

-- bank_reconciliation_items: individual items being reconciled
CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
  id TEXT PRIMARY KEY,
  reconciliation_id TEXT NOT NULL REFERENCES bank_reconciliations(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  gl_journal_line_id TEXT REFERENCES gl_journal_lines(id),
  item_type TEXT NOT NULL,  -- 'deposit' | 'withdrawal' | 'fee' | 'interest' | 'adjustment'
  amount NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  is_cleared BOOLEAN NOT NULL DEFAULT false,
  cleared_date DATE,
  gl_journal_entry_id TEXT REFERENCES gl_journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_tenant
  ON bank_reconciliations(tenant_id, bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_status
  ON bank_reconciliations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_items_recon
  ON bank_reconciliation_items(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_items_gl_line
  ON bank_reconciliation_items(gl_journal_line_id)
  WHERE gl_journal_line_id IS NOT NULL;

-- RLS policies
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations FORCE ROW LEVEL SECURITY;

CREATE POLICY bank_reconciliations_select ON bank_reconciliations
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY bank_reconciliations_insert ON bank_reconciliations
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY bank_reconciliations_update ON bank_reconciliations
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

ALTER TABLE bank_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_items FORCE ROW LEVEL SECURITY;

CREATE POLICY bank_reconciliation_items_select ON bank_reconciliation_items
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY bank_reconciliation_items_insert ON bank_reconciliation_items
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY bank_reconciliation_items_update ON bank_reconciliation_items
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY bank_reconciliation_items_delete ON bank_reconciliation_items
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
