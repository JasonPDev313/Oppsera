-- Migration: 0075_accounting_core.sql
-- Session 28: GL Core — 9 tables + RLS + CHECK constraints + seed data

-- ── gl_classifications ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_classifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_gl_classifications_tenant_name ON gl_classifications(tenant_id, name);
CREATE INDEX idx_gl_classifications_tenant_type ON gl_classifications(tenant_id, account_type);

ALTER TABLE gl_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_classifications FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_classifications_select ON gl_classifications FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_classifications_insert ON gl_classifications FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_classifications_update ON gl_classifications FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_classifications_delete ON gl_classifications FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── gl_accounts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  account_number TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  classification_id TEXT REFERENCES gl_classifications(id),
  parent_account_id TEXT REFERENCES gl_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_control_account BOOLEAN NOT NULL DEFAULT false,
  control_account_type TEXT CHECK (control_account_type IN ('ap','ar','sales_tax','undeposited_funds','bank') OR control_account_type IS NULL),
  allow_manual_posting BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_gl_accounts_tenant_number ON gl_accounts(tenant_id, account_number);
CREATE INDEX idx_gl_accounts_tenant_type ON gl_accounts(tenant_id, account_type);
CREATE INDEX idx_gl_accounts_tenant_active ON gl_accounts(tenant_id, is_active);

ALTER TABLE gl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_accounts_select ON gl_accounts FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_accounts_insert ON gl_accounts FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_accounts_update ON gl_accounts FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_accounts_delete ON gl_accounts FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── gl_journal_entries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_journal_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  journal_number BIGINT NOT NULL,
  source_module TEXT NOT NULL,
  source_reference_id TEXT,
  business_date DATE NOT NULL,
  posting_period TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('draft','posted','voided')),
  memo TEXT,
  posted_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  reversal_of_id TEXT REFERENCES gl_journal_entries(id),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_gl_journal_entries_tenant_number ON gl_journal_entries(tenant_id, journal_number);
CREATE UNIQUE INDEX uq_gl_journal_entries_tenant_src_ref ON gl_journal_entries(tenant_id, source_module, source_reference_id) WHERE source_reference_id IS NOT NULL;
CREATE INDEX idx_gl_journal_entries_tenant_date ON gl_journal_entries(tenant_id, business_date);
CREATE INDEX idx_gl_journal_entries_tenant_status ON gl_journal_entries(tenant_id, status);
CREATE INDEX idx_gl_journal_entries_tenant_period ON gl_journal_entries(tenant_id, posting_period);

ALTER TABLE gl_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_journal_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_journal_entries_select ON gl_journal_entries FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_journal_entries_insert ON gl_journal_entries FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_journal_entries_update ON gl_journal_entries FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
-- No delete policy: journal entries are never deleted, only voided.

-- ── gl_journal_lines ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_journal_lines (
  id TEXT PRIMARY KEY,
  journal_entry_id TEXT NOT NULL REFERENCES gl_journal_entries(id),
  account_id TEXT NOT NULL REFERENCES gl_accounts(id),
  debit_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  location_id TEXT,
  department_id TEXT,
  customer_id TEXT,
  vendor_id TEXT,
  memo TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT chk_gl_journal_lines_not_both CHECK (NOT (debit_amount > 0 AND credit_amount > 0))
);

CREATE INDEX idx_gl_journal_lines_entry ON gl_journal_lines(journal_entry_id);
CREATE INDEX idx_gl_journal_lines_account ON gl_journal_lines(account_id);
CREATE INDEX idx_gl_journal_lines_location ON gl_journal_lines(location_id);
CREATE INDEX idx_gl_journal_lines_account_entry ON gl_journal_lines(account_id, journal_entry_id);

-- RLS on journal lines uses the parent journal entry's tenant_id via join
-- Since lines don't have tenant_id directly, use a policy based on existence in gl_journal_entries
ALTER TABLE gl_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_journal_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_journal_lines_select ON gl_journal_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM gl_journal_entries WHERE gl_journal_entries.id = gl_journal_lines.journal_entry_id
    AND gl_journal_entries.tenant_id = current_setting('app.current_tenant_id', true)
  ));
CREATE POLICY gl_journal_lines_insert ON gl_journal_lines FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM gl_journal_entries WHERE gl_journal_entries.id = gl_journal_lines.journal_entry_id
    AND gl_journal_entries.tenant_id = current_setting('app.current_tenant_id', true)
  ));

-- ── gl_journal_number_counters ──────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_journal_number_counters (
  tenant_id TEXT PRIMARY KEY,
  last_number BIGINT NOT NULL DEFAULT 0
);

-- No RLS needed: accessed only via atomic UPSERT inside transaction with set_config

-- ── accounting_settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  auto_post_mode TEXT NOT NULL DEFAULT 'auto_post' CHECK (auto_post_mode IN ('auto_post','draft_only')),
  lock_period_through TEXT,
  default_ap_control_account_id TEXT REFERENCES gl_accounts(id),
  default_ar_control_account_id TEXT REFERENCES gl_accounts(id),
  default_sales_tax_payable_account_id TEXT REFERENCES gl_accounts(id),
  default_undeposited_funds_account_id TEXT REFERENCES gl_accounts(id),
  default_retained_earnings_account_id TEXT REFERENCES gl_accounts(id),
  default_rounding_account_id TEXT REFERENCES gl_accounts(id),
  rounding_tolerance_cents INTEGER NOT NULL DEFAULT 5,
  enable_cogs_posting BOOLEAN NOT NULL DEFAULT false,
  enable_inventory_posting BOOLEAN NOT NULL DEFAULT false,
  post_by_location BOOLEAN NOT NULL DEFAULT true,
  enable_undeposited_funds_workflow BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY accounting_settings_select ON accounting_settings FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY accounting_settings_insert ON accounting_settings FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY accounting_settings_update ON accounting_settings FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── gl_unmapped_events ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_unmapped_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  source_module TEXT NOT NULL,
  source_reference_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gl_unmapped_events_tenant_unresolved ON gl_unmapped_events(tenant_id, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_gl_unmapped_events_tenant_type ON gl_unmapped_events(tenant_id, event_type);

ALTER TABLE gl_unmapped_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_unmapped_events FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_unmapped_events_select ON gl_unmapped_events FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_unmapped_events_insert ON gl_unmapped_events FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY gl_unmapped_events_update ON gl_unmapped_events FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── gl_account_templates (system-level, no tenant_id, no RLS) ───
CREATE TABLE IF NOT EXISTS gl_account_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL,
  account_number TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  classification_name TEXT NOT NULL,
  is_control_account BOOLEAN NOT NULL DEFAULT false,
  control_account_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_gl_account_templates_key ON gl_account_templates(template_key);

-- ── gl_classification_templates (system-level, no tenant_id, no RLS)
CREATE TABLE IF NOT EXISTS gl_classification_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_gl_classification_templates_key ON gl_classification_templates(template_key);

-- ── Seed: Classification Templates ──────────────────────────────
-- Shared across all business types
INSERT INTO gl_classification_templates (id, template_key, name, account_type, sort_order) VALUES
  -- Assets
  ('clst_cash', 'shared', 'Cash & Bank', 'asset', 10),
  ('clst_receivables', 'shared', 'Receivables', 'asset', 20),
  ('clst_inventory', 'shared', 'Inventory', 'asset', 30),
  ('clst_prepaid', 'shared', 'Prepaid & Other Current', 'asset', 40),
  ('clst_fixed', 'shared', 'Fixed Assets', 'asset', 50),
  -- Liabilities
  ('clst_payables', 'shared', 'Payables', 'liability', 10),
  ('clst_tax_payable', 'shared', 'Tax Liabilities', 'liability', 20),
  ('clst_deferred', 'shared', 'Deferred Revenue', 'liability', 30),
  ('clst_accrued', 'shared', 'Accrued Liabilities', 'liability', 40),
  -- Equity
  ('clst_equity', 'shared', 'Owner Equity', 'equity', 10),
  ('clst_retained', 'shared', 'Retained Earnings', 'equity', 20),
  -- Revenue
  ('clst_revenue', 'shared', 'Operating Revenue', 'revenue', 10),
  ('clst_contra_rev', 'shared', 'Discounts & Returns', 'revenue', 20),
  -- Expenses
  ('clst_cogs', 'shared', 'Cost of Goods Sold', 'expense', 10),
  ('clst_payroll', 'shared', 'Payroll', 'expense', 20),
  ('clst_operating', 'shared', 'Operating Expenses', 'expense', 30),
  ('clst_system', 'shared', 'System Accounts', 'expense', 99)
ON CONFLICT DO NOTHING;

-- ── Seed: Golf Default Account Templates ────────────────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  -- Assets
  ('gat_1010', 'golf_default', '1010', 'Cash on Hand', 'asset', 'debit', 'Cash & Bank', false, NULL, 10),
  ('gat_1020', 'golf_default', '1020', 'Operating Checking', 'asset', 'debit', 'Cash & Bank', false, NULL, 20),
  ('gat_1030', 'golf_default', '1030', 'Payroll Checking', 'asset', 'debit', 'Cash & Bank', false, NULL, 30),
  ('gat_1050', 'golf_default', '1050', 'Undeposited Funds', 'asset', 'debit', 'Cash & Bank', true, 'undeposited_funds', 40),
  ('gat_1100', 'golf_default', '1100', 'Accounts Receivable', 'asset', 'debit', 'Receivables', true, 'ar', 50),
  ('gat_1150', 'golf_default', '1150', 'Member Receivables', 'asset', 'debit', 'Receivables', false, NULL, 60),
  ('gat_1200', 'golf_default', '1200', 'Inventory - Pro Shop', 'asset', 'debit', 'Inventory', false, NULL, 70),
  ('gat_1210', 'golf_default', '1210', 'Inventory - F&B', 'asset', 'debit', 'Inventory', false, NULL, 80),
  ('gat_1220', 'golf_default', '1220', 'Inventory - Course Maintenance', 'asset', 'debit', 'Inventory', false, NULL, 90),
  ('gat_1300', 'golf_default', '1300', 'Prepaid Expenses', 'asset', 'debit', 'Prepaid & Other Current', false, NULL, 100),
  ('gat_1500', 'golf_default', '1500', 'Golf Carts', 'asset', 'debit', 'Fixed Assets', false, NULL, 110),
  ('gat_1510', 'golf_default', '1510', 'Course Equipment', 'asset', 'debit', 'Fixed Assets', false, NULL, 120),
  ('gat_1520', 'golf_default', '1520', 'Clubhouse & Improvements', 'asset', 'debit', 'Fixed Assets', false, NULL, 130),
  ('gat_1530', 'golf_default', '1530', 'Accumulated Depreciation', 'asset', 'credit', 'Fixed Assets', false, NULL, 140),
  -- Liabilities
  ('gat_2000', 'golf_default', '2000', 'Accounts Payable', 'liability', 'credit', 'Payables', true, 'ap', 200),
  ('gat_2100', 'golf_default', '2100', 'Sales Tax Payable', 'liability', 'credit', 'Tax Liabilities', true, 'sales_tax', 210),
  ('gat_2150', 'golf_default', '2150', 'Payroll Taxes Payable', 'liability', 'credit', 'Tax Liabilities', false, NULL, 220),
  ('gat_2200', 'golf_default', '2200', 'Gift Card Liability', 'liability', 'credit', 'Deferred Revenue', false, NULL, 230),
  ('gat_2300', 'golf_default', '2300', 'Deferred Revenue - Memberships', 'liability', 'credit', 'Deferred Revenue', false, NULL, 240),
  ('gat_2310', 'golf_default', '2310', 'Deferred Revenue - Event Deposits', 'liability', 'credit', 'Deferred Revenue', false, NULL, 250),
  ('gat_2400', 'golf_default', '2400', 'Accrued Expenses', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 260),
  -- Equity
  ('gat_3000', 'golf_default', '3000', 'Retained Earnings', 'equity', 'credit', 'Retained Earnings', false, NULL, 300),
  ('gat_3100', 'golf_default', '3100', 'Owner Equity / Capital', 'equity', 'credit', 'Owner Equity', false, NULL, 310),
  -- Revenue
  ('gat_4010', 'golf_default', '4010', 'Green Fees Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 400),
  ('gat_4020', 'golf_default', '4020', 'Cart Rental Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 410),
  ('gat_4030', 'golf_default', '4030', 'Pro Shop Sales', 'revenue', 'credit', 'Operating Revenue', false, NULL, 420),
  ('gat_4040', 'golf_default', '4040', 'F&B Sales', 'revenue', 'credit', 'Operating Revenue', false, NULL, 430),
  ('gat_4050', 'golf_default', '4050', 'Membership Dues', 'revenue', 'credit', 'Operating Revenue', false, NULL, 440),
  ('gat_4060', 'golf_default', '4060', 'Event Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 450),
  ('gat_4070', 'golf_default', '4070', 'Driving Range Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 460),
  ('gat_4080', 'golf_default', '4080', 'Lesson Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 470),
  ('gat_4090', 'golf_default', '4090', 'Other Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 480),
  ('gat_4100', 'golf_default', '4100', 'Discounts Given', 'revenue', 'credit', 'Discounts & Returns', false, NULL, 490),
  -- COGS
  ('gat_5010', 'golf_default', '5010', 'Pro Shop COGS', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 500),
  ('gat_5020', 'golf_default', '5020', 'F&B COGS', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 510),
  ('gat_5030', 'golf_default', '5030', 'Course Maintenance Supplies', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 520),
  -- Operating Expenses
  ('gat_6010', 'golf_default', '6010', 'Payroll - Golf Operations', 'expense', 'debit', 'Payroll', false, NULL, 600),
  ('gat_6020', 'golf_default', '6020', 'Payroll - Pro Shop', 'expense', 'debit', 'Payroll', false, NULL, 610),
  ('gat_6030', 'golf_default', '6030', 'Payroll - F&B', 'expense', 'debit', 'Payroll', false, NULL, 620),
  ('gat_6040', 'golf_default', '6040', 'Payroll - Maintenance', 'expense', 'debit', 'Payroll', false, NULL, 630),
  ('gat_6050', 'golf_default', '6050', 'Course Maintenance', 'expense', 'debit', 'Operating Expenses', false, NULL, 640),
  ('gat_6060', 'golf_default', '6060', 'Equipment Repair', 'expense', 'debit', 'Operating Expenses', false, NULL, 650),
  ('gat_6070', 'golf_default', '6070', 'Utilities', 'expense', 'debit', 'Operating Expenses', false, NULL, 660),
  ('gat_6080', 'golf_default', '6080', 'Insurance', 'expense', 'debit', 'Operating Expenses', false, NULL, 670),
  ('gat_6090', 'golf_default', '6090', 'Marketing', 'expense', 'debit', 'Operating Expenses', false, NULL, 680),
  ('gat_6100', 'golf_default', '6100', 'Credit Card Processing Fees', 'expense', 'debit', 'Operating Expenses', false, NULL, 690),
  ('gat_6110', 'golf_default', '6110', 'Office & Admin', 'expense', 'debit', 'Operating Expenses', false, NULL, 700),
  ('gat_6120', 'golf_default', '6120', 'Professional Services', 'expense', 'debit', 'Operating Expenses', false, NULL, 710),
  ('gat_6130', 'golf_default', '6130', 'Rent / Lease', 'expense', 'debit', 'Operating Expenses', false, NULL, 720),
  ('gat_6140', 'golf_default', '6140', 'Depreciation', 'expense', 'debit', 'Operating Expenses', false, NULL, 730),
  -- System
  ('gat_9999', 'golf_default', '9999', 'Rounding / Reconciliation', 'expense', 'debit', 'System Accounts', false, NULL, 999)
ON CONFLICT DO NOTHING;

-- ── Seed: Retail Default Account Templates ──────────────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  ('rat_1010', 'retail_default', '1010', 'Cash on Hand', 'asset', 'debit', 'Cash & Bank', false, NULL, 10),
  ('rat_1020', 'retail_default', '1020', 'Operating Checking', 'asset', 'debit', 'Cash & Bank', false, NULL, 20),
  ('rat_1050', 'retail_default', '1050', 'Undeposited Funds', 'asset', 'debit', 'Cash & Bank', true, 'undeposited_funds', 30),
  ('rat_1100', 'retail_default', '1100', 'Accounts Receivable', 'asset', 'debit', 'Receivables', true, 'ar', 40),
  ('rat_1200', 'retail_default', '1200', 'Inventory Asset', 'asset', 'debit', 'Inventory', false, NULL, 50),
  ('rat_1300', 'retail_default', '1300', 'Prepaid Expenses', 'asset', 'debit', 'Prepaid & Other Current', false, NULL, 60),
  ('rat_1500', 'retail_default', '1500', 'Furniture & Equipment', 'asset', 'debit', 'Fixed Assets', false, NULL, 70),
  ('rat_1510', 'retail_default', '1510', 'Accumulated Depreciation', 'asset', 'credit', 'Fixed Assets', false, NULL, 80),
  ('rat_2000', 'retail_default', '2000', 'Accounts Payable', 'liability', 'credit', 'Payables', true, 'ap', 200),
  ('rat_2100', 'retail_default', '2100', 'Sales Tax Payable', 'liability', 'credit', 'Tax Liabilities', true, 'sales_tax', 210),
  ('rat_2150', 'retail_default', '2150', 'Payroll Taxes Payable', 'liability', 'credit', 'Tax Liabilities', false, NULL, 220),
  ('rat_2200', 'retail_default', '2200', 'Gift Card Liability', 'liability', 'credit', 'Deferred Revenue', false, NULL, 230),
  ('rat_2400', 'retail_default', '2400', 'Accrued Expenses', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 240),
  ('rat_3000', 'retail_default', '3000', 'Retained Earnings', 'equity', 'credit', 'Retained Earnings', false, NULL, 300),
  ('rat_3100', 'retail_default', '3100', 'Owner Equity / Capital', 'equity', 'credit', 'Owner Equity', false, NULL, 310),
  ('rat_4010', 'retail_default', '4010', 'Merchandise Sales', 'revenue', 'credit', 'Operating Revenue', false, NULL, 400),
  ('rat_4020', 'retail_default', '4020', 'Service Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 410),
  ('rat_4090', 'retail_default', '4090', 'Other Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 420),
  ('rat_4100', 'retail_default', '4100', 'Discounts Given', 'revenue', 'credit', 'Discounts & Returns', false, NULL, 430),
  ('rat_5010', 'retail_default', '5010', 'Merchandise COGS', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 500),
  ('rat_6010', 'retail_default', '6010', 'Payroll Expense', 'expense', 'debit', 'Payroll', false, NULL, 600),
  ('rat_6050', 'retail_default', '6050', 'Rent / Lease', 'expense', 'debit', 'Operating Expenses', false, NULL, 610),
  ('rat_6060', 'retail_default', '6060', 'Utilities', 'expense', 'debit', 'Operating Expenses', false, NULL, 620),
  ('rat_6070', 'retail_default', '6070', 'Insurance', 'expense', 'debit', 'Operating Expenses', false, NULL, 630),
  ('rat_6080', 'retail_default', '6080', 'Marketing', 'expense', 'debit', 'Operating Expenses', false, NULL, 640),
  ('rat_6090', 'retail_default', '6090', 'Credit Card Processing Fees', 'expense', 'debit', 'Operating Expenses', false, NULL, 650),
  ('rat_6100', 'retail_default', '6100', 'Office & Admin', 'expense', 'debit', 'Operating Expenses', false, NULL, 660),
  ('rat_6110', 'retail_default', '6110', 'Professional Services', 'expense', 'debit', 'Operating Expenses', false, NULL, 670),
  ('rat_6120', 'retail_default', '6120', 'Depreciation', 'expense', 'debit', 'Operating Expenses', false, NULL, 680),
  ('rat_9999', 'retail_default', '9999', 'Rounding / Reconciliation', 'expense', 'debit', 'System Accounts', false, NULL, 999)
ON CONFLICT DO NOTHING;

-- ── Seed: Restaurant Default Account Templates ──────────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  ('rest_1010', 'restaurant_default', '1010', 'Cash on Hand', 'asset', 'debit', 'Cash & Bank', false, NULL, 10),
  ('rest_1020', 'restaurant_default', '1020', 'Operating Checking', 'asset', 'debit', 'Cash & Bank', false, NULL, 20),
  ('rest_1050', 'restaurant_default', '1050', 'Undeposited Funds', 'asset', 'debit', 'Cash & Bank', true, 'undeposited_funds', 30),
  ('rest_1100', 'restaurant_default', '1100', 'Accounts Receivable', 'asset', 'debit', 'Receivables', true, 'ar', 40),
  ('rest_1200', 'restaurant_default', '1200', 'Inventory - Food', 'asset', 'debit', 'Inventory', false, NULL, 50),
  ('rest_1210', 'restaurant_default', '1210', 'Inventory - Beverage', 'asset', 'debit', 'Inventory', false, NULL, 60),
  ('rest_1220', 'restaurant_default', '1220', 'Inventory - Supplies', 'asset', 'debit', 'Inventory', false, NULL, 70),
  ('rest_1300', 'restaurant_default', '1300', 'Prepaid Expenses', 'asset', 'debit', 'Prepaid & Other Current', false, NULL, 80),
  ('rest_1500', 'restaurant_default', '1500', 'Kitchen Equipment', 'asset', 'debit', 'Fixed Assets', false, NULL, 90),
  ('rest_1510', 'restaurant_default', '1510', 'Furniture & Fixtures', 'asset', 'debit', 'Fixed Assets', false, NULL, 100),
  ('rest_1520', 'restaurant_default', '1520', 'Accumulated Depreciation', 'asset', 'credit', 'Fixed Assets', false, NULL, 110),
  ('rest_2000', 'restaurant_default', '2000', 'Accounts Payable', 'liability', 'credit', 'Payables', true, 'ap', 200),
  ('rest_2100', 'restaurant_default', '2100', 'Sales Tax Payable', 'liability', 'credit', 'Tax Liabilities', true, 'sales_tax', 210),
  ('rest_2150', 'restaurant_default', '2150', 'Payroll Taxes Payable', 'liability', 'credit', 'Tax Liabilities', false, NULL, 220),
  ('rest_2200', 'restaurant_default', '2200', 'Gift Card Liability', 'liability', 'credit', 'Deferred Revenue', false, NULL, 230),
  ('rest_2400', 'restaurant_default', '2400', 'Accrued Expenses', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 240),
  ('rest_3000', 'restaurant_default', '3000', 'Retained Earnings', 'equity', 'credit', 'Retained Earnings', false, NULL, 300),
  ('rest_3100', 'restaurant_default', '3100', 'Owner Equity / Capital', 'equity', 'credit', 'Owner Equity', false, NULL, 310),
  ('rest_4010', 'restaurant_default', '4010', 'Food Sales', 'revenue', 'credit', 'Operating Revenue', false, NULL, 400),
  ('rest_4020', 'restaurant_default', '4020', 'Beverage Sales', 'revenue', 'credit', 'Operating Revenue', false, NULL, 410),
  ('rest_4030', 'restaurant_default', '4030', 'Catering Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 420),
  ('rest_4090', 'restaurant_default', '4090', 'Other Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 430),
  ('rest_4100', 'restaurant_default', '4100', 'Discounts Given', 'revenue', 'credit', 'Discounts & Returns', false, NULL, 440),
  ('rest_5010', 'restaurant_default', '5010', 'Food COGS', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 500),
  ('rest_5020', 'restaurant_default', '5020', 'Beverage COGS', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 510),
  ('rest_6010', 'restaurant_default', '6010', 'Payroll - Kitchen', 'expense', 'debit', 'Payroll', false, NULL, 600),
  ('rest_6020', 'restaurant_default', '6020', 'Payroll - Front of House', 'expense', 'debit', 'Payroll', false, NULL, 610),
  ('rest_6030', 'restaurant_default', '6030', 'Payroll - Management', 'expense', 'debit', 'Payroll', false, NULL, 620),
  ('rest_6050', 'restaurant_default', '6050', 'Rent / Lease', 'expense', 'debit', 'Operating Expenses', false, NULL, 630),
  ('rest_6060', 'restaurant_default', '6060', 'Utilities', 'expense', 'debit', 'Operating Expenses', false, NULL, 640),
  ('rest_6070', 'restaurant_default', '6070', 'Insurance', 'expense', 'debit', 'Operating Expenses', false, NULL, 650),
  ('rest_6080', 'restaurant_default', '6080', 'Marketing', 'expense', 'debit', 'Operating Expenses', false, NULL, 660),
  ('rest_6090', 'restaurant_default', '6090', 'Credit Card Processing Fees', 'expense', 'debit', 'Operating Expenses', false, NULL, 670),
  ('rest_6100', 'restaurant_default', '6100', 'Supplies & Smallwares', 'expense', 'debit', 'Operating Expenses', false, NULL, 680),
  ('rest_6110', 'restaurant_default', '6110', 'Professional Services', 'expense', 'debit', 'Operating Expenses', false, NULL, 690),
  ('rest_6120', 'restaurant_default', '6120', 'Depreciation', 'expense', 'debit', 'Operating Expenses', false, NULL, 700),
  ('rest_9999', 'restaurant_default', '9999', 'Rounding / Reconciliation', 'expense', 'debit', 'System Accounts', false, NULL, 999)
ON CONFLICT DO NOTHING;

-- ── Seed: Hybrid Default (combines golf + restaurant) ───────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  ('hyb_1010', 'hybrid_default', '1010', 'Cash on Hand', 'asset', 'debit', 'Cash & Bank', false, NULL, 10),
  ('hyb_1020', 'hybrid_default', '1020', 'Operating Checking', 'asset', 'debit', 'Cash & Bank', false, NULL, 20),
  ('hyb_1030', 'hybrid_default', '1030', 'Payroll Checking', 'asset', 'debit', 'Cash & Bank', false, NULL, 30),
  ('hyb_1050', 'hybrid_default', '1050', 'Undeposited Funds', 'asset', 'debit', 'Cash & Bank', true, 'undeposited_funds', 40),
  ('hyb_1100', 'hybrid_default', '1100', 'Accounts Receivable', 'asset', 'debit', 'Receivables', true, 'ar', 50),
  ('hyb_1150', 'hybrid_default', '1150', 'Member Receivables', 'asset', 'debit', 'Receivables', false, NULL, 60),
  ('hyb_1200', 'hybrid_default', '1200', 'Inventory - Pro Shop', 'asset', 'debit', 'Inventory', false, NULL, 70),
  ('hyb_1210', 'hybrid_default', '1210', 'Inventory - Food', 'asset', 'debit', 'Inventory', false, NULL, 80),
  ('hyb_1220', 'hybrid_default', '1220', 'Inventory - Beverage', 'asset', 'debit', 'Inventory', false, NULL, 90),
  ('hyb_1230', 'hybrid_default', '1230', 'Inventory - Course Maintenance', 'asset', 'debit', 'Inventory', false, NULL, 100),
  ('hyb_1300', 'hybrid_default', '1300', 'Prepaid Expenses', 'asset', 'debit', 'Prepaid & Other Current', false, NULL, 110),
  ('hyb_1500', 'hybrid_default', '1500', 'Golf Carts', 'asset', 'debit', 'Fixed Assets', false, NULL, 120),
  ('hyb_1510', 'hybrid_default', '1510', 'Course Equipment', 'asset', 'debit', 'Fixed Assets', false, NULL, 130),
  ('hyb_1520', 'hybrid_default', '1520', 'Kitchen Equipment', 'asset', 'debit', 'Fixed Assets', false, NULL, 140),
  ('hyb_1530', 'hybrid_default', '1530', 'Clubhouse & Improvements', 'asset', 'debit', 'Fixed Assets', false, NULL, 150),
  ('hyb_1540', 'hybrid_default', '1540', 'Accumulated Depreciation', 'asset', 'credit', 'Fixed Assets', false, NULL, 160),
  ('hyb_2000', 'hybrid_default', '2000', 'Accounts Payable', 'liability', 'credit', 'Payables', true, 'ap', 200),
  ('hyb_2100', 'hybrid_default', '2100', 'Sales Tax Payable', 'liability', 'credit', 'Tax Liabilities', true, 'sales_tax', 210),
  ('hyb_2150', 'hybrid_default', '2150', 'Payroll Taxes Payable', 'liability', 'credit', 'Tax Liabilities', false, NULL, 220),
  ('hyb_2200', 'hybrid_default', '2200', 'Gift Card Liability', 'liability', 'credit', 'Deferred Revenue', false, NULL, 230),
  ('hyb_2300', 'hybrid_default', '2300', 'Deferred Revenue - Memberships', 'liability', 'credit', 'Deferred Revenue', false, NULL, 240),
  ('hyb_2310', 'hybrid_default', '2310', 'Deferred Revenue - Events', 'liability', 'credit', 'Deferred Revenue', false, NULL, 250),
  ('hyb_2400', 'hybrid_default', '2400', 'Accrued Expenses', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 260),
  ('hyb_3000', 'hybrid_default', '3000', 'Retained Earnings', 'equity', 'credit', 'Retained Earnings', false, NULL, 300),
  ('hyb_3100', 'hybrid_default', '3100', 'Owner Equity / Capital', 'equity', 'credit', 'Owner Equity', false, NULL, 310),
  ('hyb_4010', 'hybrid_default', '4010', 'Green Fees Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 400),
  ('hyb_4020', 'hybrid_default', '4020', 'Cart Rental Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 410),
  ('hyb_4030', 'hybrid_default', '4030', 'Pro Shop Sales', 'revenue', 'credit', 'Operating Revenue', false, NULL, 420),
  ('hyb_4040', 'hybrid_default', '4040', 'Food Sales', 'revenue', 'credit', 'Operating Revenue', false, NULL, 430),
  ('hyb_4050', 'hybrid_default', '4050', 'Beverage Sales', 'revenue', 'credit', 'Operating Revenue', false, NULL, 440),
  ('hyb_4060', 'hybrid_default', '4060', 'Membership Dues', 'revenue', 'credit', 'Operating Revenue', false, NULL, 450),
  ('hyb_4070', 'hybrid_default', '4070', 'Event Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 460),
  ('hyb_4080', 'hybrid_default', '4080', 'Driving Range Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 470),
  ('hyb_4090', 'hybrid_default', '4090', 'Other Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 480),
  ('hyb_4100', 'hybrid_default', '4100', 'Discounts Given', 'revenue', 'credit', 'Discounts & Returns', false, NULL, 490),
  ('hyb_5010', 'hybrid_default', '5010', 'Pro Shop COGS', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 500),
  ('hyb_5020', 'hybrid_default', '5020', 'Food COGS', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 510),
  ('hyb_5030', 'hybrid_default', '5030', 'Beverage COGS', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 520),
  ('hyb_5040', 'hybrid_default', '5040', 'Course Maintenance Supplies', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 530),
  ('hyb_6010', 'hybrid_default', '6010', 'Payroll - Golf Operations', 'expense', 'debit', 'Payroll', false, NULL, 600),
  ('hyb_6020', 'hybrid_default', '6020', 'Payroll - Kitchen', 'expense', 'debit', 'Payroll', false, NULL, 610),
  ('hyb_6030', 'hybrid_default', '6030', 'Payroll - Front of House', 'expense', 'debit', 'Payroll', false, NULL, 620),
  ('hyb_6040', 'hybrid_default', '6040', 'Payroll - Maintenance', 'expense', 'debit', 'Payroll', false, NULL, 630),
  ('hyb_6050', 'hybrid_default', '6050', 'Course Maintenance', 'expense', 'debit', 'Operating Expenses', false, NULL, 640),
  ('hyb_6060', 'hybrid_default', '6060', 'Rent / Lease', 'expense', 'debit', 'Operating Expenses', false, NULL, 650),
  ('hyb_6070', 'hybrid_default', '6070', 'Utilities', 'expense', 'debit', 'Operating Expenses', false, NULL, 660),
  ('hyb_6080', 'hybrid_default', '6080', 'Insurance', 'expense', 'debit', 'Operating Expenses', false, NULL, 670),
  ('hyb_6090', 'hybrid_default', '6090', 'Marketing', 'expense', 'debit', 'Operating Expenses', false, NULL, 680),
  ('hyb_6100', 'hybrid_default', '6100', 'Credit Card Processing Fees', 'expense', 'debit', 'Operating Expenses', false, NULL, 690),
  ('hyb_6110', 'hybrid_default', '6110', 'Office & Admin', 'expense', 'debit', 'Operating Expenses', false, NULL, 700),
  ('hyb_6120', 'hybrid_default', '6120', 'Professional Services', 'expense', 'debit', 'Operating Expenses', false, NULL, 710),
  ('hyb_6130', 'hybrid_default', '6130', 'Depreciation', 'expense', 'debit', 'Operating Expenses', false, NULL, 720),
  ('hyb_9999', 'hybrid_default', '9999', 'Rounding / Reconciliation', 'expense', 'debit', 'System Accounts', false, NULL, 999)
ON CONFLICT DO NOTHING;
