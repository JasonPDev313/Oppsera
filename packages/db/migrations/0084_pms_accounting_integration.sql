-- Migration: 0083_pms_accounting_integration.sql
-- PMS-Accounting integration: GL mapping table, COA template, settings column

-- ── 1. Expand control_account_type CHECK to include PMS types ─────
ALTER TABLE gl_accounts DROP CONSTRAINT IF EXISTS gl_accounts_control_account_type_check;
ALTER TABLE gl_accounts ADD CONSTRAINT gl_accounts_control_account_type_check
  CHECK (control_account_type IN ('ap','ar','sales_tax','undeposited_funds','bank','pms_guest_ledger') OR control_account_type IS NULL);

-- ── 2. Add PMS Guest Ledger setting to accounting_settings ────────
ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_pms_guest_ledger_account_id TEXT;

-- ── 3. Create PMS folio entry type GL mapping table ───────────────
CREATE TABLE IF NOT EXISTS pms_folio_entry_type_gl_defaults (
  tenant_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('ROOM_CHARGE','TAX','FEE','ADJUSTMENT','PAYMENT','REFUND')),
  account_id TEXT NOT NULL REFERENCES gl_accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entry_type)
);

CREATE INDEX idx_pms_folio_gl_defaults_tenant ON pms_folio_entry_type_gl_defaults(tenant_id);

ALTER TABLE pms_folio_entry_type_gl_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_folio_entry_type_gl_defaults FORCE ROW LEVEL SECURITY;

CREATE POLICY pms_folio_gl_defaults_select ON pms_folio_entry_type_gl_defaults FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_folio_gl_defaults_insert ON pms_folio_entry_type_gl_defaults FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_folio_gl_defaults_update ON pms_folio_entry_type_gl_defaults FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_folio_gl_defaults_delete ON pms_folio_entry_type_gl_defaults FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── 4. Seed PMS COA Template (USALI-aligned hospitality accounts) ─
-- Uses the shared classification templates already seeded in 0075.
-- template_key = 'pms_default'
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  -- Assets
  ('pat_1010', 'pms_default', '1010', 'Cash on Hand', 'asset', 'debit', 'Cash & Bank', false, NULL, 10),
  ('pat_1020', 'pms_default', '1020', 'Operating Checking', 'asset', 'debit', 'Cash & Bank', false, NULL, 20),
  ('pat_1050', 'pms_default', '1050', 'Undeposited Funds', 'asset', 'debit', 'Cash & Bank', true, 'undeposited_funds', 30),
  ('pat_1100', 'pms_default', '1100', 'Accounts Receivable', 'asset', 'debit', 'Receivables', true, 'ar', 40),
  ('pat_1150', 'pms_default', '1150', 'Guest Ledger', 'asset', 'debit', 'Receivables', true, 'pms_guest_ledger', 50),
  ('pat_1160', 'pms_default', '1160', 'City Ledger', 'asset', 'debit', 'Receivables', false, NULL, 60),
  ('pat_1170', 'pms_default', '1170', 'OTA Receivables', 'asset', 'debit', 'Receivables', false, NULL, 70),
  ('pat_1200', 'pms_default', '1200', 'Inventory - F&B', 'asset', 'debit', 'Inventory', false, NULL, 80),
  ('pat_1210', 'pms_default', '1210', 'Inventory - Guest Supplies', 'asset', 'debit', 'Inventory', false, NULL, 90),
  ('pat_1300', 'pms_default', '1300', 'Prepaid Expenses', 'asset', 'debit', 'Prepaid & Other Current', false, NULL, 100),
  ('pat_1500', 'pms_default', '1500', 'Furniture & Equipment', 'asset', 'debit', 'Fixed Assets', false, NULL, 110),
  ('pat_1510', 'pms_default', '1510', 'Building & Improvements', 'asset', 'debit', 'Fixed Assets', false, NULL, 120),
  ('pat_1520', 'pms_default', '1520', 'Accumulated Depreciation', 'asset', 'credit', 'Fixed Assets', false, NULL, 130),
  -- Liabilities
  ('pat_2000', 'pms_default', '2000', 'Accounts Payable', 'liability', 'credit', 'Payables', true, 'ap', 200),
  ('pat_2100', 'pms_default', '2100', 'Sales Tax Payable', 'liability', 'credit', 'Tax Liabilities', true, 'sales_tax', 210),
  ('pat_2110', 'pms_default', '2110', 'Lodging Tax Payable', 'liability', 'credit', 'Tax Liabilities', false, NULL, 220),
  ('pat_2120', 'pms_default', '2120', 'Tourism/Occupancy Tax Payable', 'liability', 'credit', 'Tax Liabilities', false, NULL, 230),
  ('pat_2150', 'pms_default', '2150', 'Payroll Taxes Payable', 'liability', 'credit', 'Tax Liabilities', false, NULL, 240),
  ('pat_2200', 'pms_default', '2200', 'Guest Advance Deposits', 'liability', 'credit', 'Deferred Revenue', false, NULL, 250),
  ('pat_2210', 'pms_default', '2210', 'Gift Card Liability', 'liability', 'credit', 'Deferred Revenue', false, NULL, 260),
  ('pat_2300', 'pms_default', '2300', 'Accrued Expenses', 'liability', 'credit', 'Accrued Liabilities', false, NULL, 270),
  -- Equity
  ('pat_3000', 'pms_default', '3000', 'Retained Earnings', 'equity', 'credit', 'Retained Earnings', false, NULL, 300),
  ('pat_3100', 'pms_default', '3100', 'Owner Equity / Capital', 'equity', 'credit', 'Owner Equity', false, NULL, 310),
  -- Revenue (USALI Rooms Department)
  ('pat_4100', 'pms_default', '4100', 'Room Revenue - Standard', 'revenue', 'credit', 'Operating Revenue', false, NULL, 400),
  ('pat_4110', 'pms_default', '4110', 'Room Revenue - Suite/Premium', 'revenue', 'credit', 'Operating Revenue', false, NULL, 410),
  ('pat_4120', 'pms_default', '4120', 'Resort Fee Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 420),
  ('pat_4130', 'pms_default', '4130', 'Service Fee Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 430),
  ('pat_4140', 'pms_default', '4140', 'Late Check-Out Fee Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 440),
  ('pat_4150', 'pms_default', '4150', 'No-Show Fee Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 450),
  ('pat_4160', 'pms_default', '4160', 'Cancellation Fee Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 460),
  ('pat_4170', 'pms_default', '4170', 'F&B Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 470),
  ('pat_4180', 'pms_default', '4180', 'Minibar Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 480),
  ('pat_4190', 'pms_default', '4190', 'Parking Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 490),
  ('pat_4200', 'pms_default', '4200', 'Miscellaneous PMS Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 500),
  ('pat_4900', 'pms_default', '4900', 'Discounts & Allowances', 'revenue', 'credit', 'Discounts & Returns', false, NULL, 510),
  -- COGS
  ('pat_5100', 'pms_default', '5100', 'F&B Cost of Sales', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 600),
  ('pat_5200', 'pms_default', '5200', 'Guest Supplies Cost', 'expense', 'debit', 'Cost of Goods Sold', false, NULL, 610),
  -- Rooms Department Expenses (USALI)
  ('pat_6100', 'pms_default', '6100', 'Rooms Dept - Salaries & Wages', 'expense', 'debit', 'Payroll', false, NULL, 700),
  ('pat_6110', 'pms_default', '6110', 'Rooms Dept - Benefits', 'expense', 'debit', 'Payroll', false, NULL, 710),
  ('pat_6200', 'pms_default', '6200', 'Housekeeping Supplies', 'expense', 'debit', 'Operating Expenses', false, NULL, 720),
  ('pat_6210', 'pms_default', '6210', 'Laundry & Linen', 'expense', 'debit', 'Operating Expenses', false, NULL, 730),
  ('pat_6220', 'pms_default', '6220', 'Guest Room Amenities', 'expense', 'debit', 'Operating Expenses', false, NULL, 740),
  ('pat_6300', 'pms_default', '6300', 'OTA Commission Expense', 'expense', 'debit', 'Operating Expenses', false, NULL, 750),
  ('pat_6310', 'pms_default', '6310', 'Reservation System Fees', 'expense', 'debit', 'Operating Expenses', false, NULL, 760),
  ('pat_6320', 'pms_default', '6320', 'Credit Card Processing Fees', 'expense', 'debit', 'Operating Expenses', false, NULL, 770),
  ('pat_6400', 'pms_default', '6400', 'Maintenance & Repairs', 'expense', 'debit', 'Operating Expenses', false, NULL, 780),
  ('pat_6410', 'pms_default', '6410', 'Utilities', 'expense', 'debit', 'Operating Expenses', false, NULL, 790),
  ('pat_6500', 'pms_default', '6500', 'Insurance', 'expense', 'debit', 'Operating Expenses', false, NULL, 800),
  ('pat_6600', 'pms_default', '6600', 'Marketing & Advertising', 'expense', 'debit', 'Operating Expenses', false, NULL, 810),
  ('pat_6700', 'pms_default', '6700', 'Administrative & General', 'expense', 'debit', 'Operating Expenses', false, NULL, 820),
  ('pat_6800', 'pms_default', '6800', 'Property Taxes & Licenses', 'expense', 'debit', 'Operating Expenses', false, NULL, 830),
  ('pat_6900', 'pms_default', '6900', 'Depreciation Expense', 'expense', 'debit', 'Operating Expenses', false, NULL, 840),
  -- System accounts
  ('pat_9999', 'pms_default', '9999', 'Rounding', 'expense', 'debit', 'System Accounts', false, NULL, 999)
ON CONFLICT DO NOTHING;
