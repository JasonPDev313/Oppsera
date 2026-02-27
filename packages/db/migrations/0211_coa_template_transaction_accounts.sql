-- Migration 0211: Add missing GL accounts to all COA templates
-- These 7 accounts were created by fix-transaction-type-mappings.ts for the
-- existing tenant, but the COA templates (used by bootstrapTenantCoa for NEW
-- tenants) were never updated. This ensures all 5 business types get the
-- complete set of accounts needed for transaction type mapping coverage.
--
-- Accounts added:
--   2320 Customer Deposits Payable  (liability, credit)
--   2500 Payroll Clearing           (liability, credit)
--   4110 Returns & Allowances       (revenue, debit — contra-revenue)
--   4510 Surcharge Revenue          (revenue, credit)
--   6150 Comp Expense               (expense, debit)
--   6160 Cash Over/Short            (expense, debit)
--   6170 Chargeback Expense         (expense, debit)

-- ============================================================
-- golf_default
-- ============================================================
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order)
VALUES
  (gen_random_uuid()::text, 'golf_default', '2320', 'Customer Deposits Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 232),
  (gen_random_uuid()::text, 'golf_default', '2500', 'Payroll Clearing',          'liability', 'credit', 'Current Liabilities', false, NULL, 250),
  (gen_random_uuid()::text, 'golf_default', '4110', 'Returns & Allowances',      'revenue',   'debit',  'Operating Revenue',    false, NULL, 411),
  (gen_random_uuid()::text, 'golf_default', '4510', 'Surcharge Revenue',         'revenue',   'credit', 'Operating Revenue',    false, NULL, 451),
  (gen_random_uuid()::text, 'golf_default', '6150', 'Comp Expense',              'expense',   'debit',  'Operating Expenses',   false, NULL, 615),
  (gen_random_uuid()::text, 'golf_default', '6160', 'Cash Over/Short',           'expense',   'debit',  'Operating Expenses',   false, NULL, 616),
  (gen_random_uuid()::text, 'golf_default', '6170', 'Chargeback Expense',        'expense',   'debit',  'Operating Expenses',   false, NULL, 617)
ON CONFLICT DO NOTHING;

-- ============================================================
-- retail_default
-- ============================================================
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order)
VALUES
  (gen_random_uuid()::text, 'retail_default', '2320', 'Customer Deposits Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 232),
  (gen_random_uuid()::text, 'retail_default', '2500', 'Payroll Clearing',          'liability', 'credit', 'Current Liabilities', false, NULL, 250),
  (gen_random_uuid()::text, 'retail_default', '4110', 'Returns & Allowances',      'revenue',   'debit',  'Operating Revenue',    false, NULL, 411),
  (gen_random_uuid()::text, 'retail_default', '4510', 'Surcharge Revenue',         'revenue',   'credit', 'Operating Revenue',    false, NULL, 451),
  (gen_random_uuid()::text, 'retail_default', '6150', 'Comp Expense',              'expense',   'debit',  'Operating Expenses',   false, NULL, 615),
  (gen_random_uuid()::text, 'retail_default', '6160', 'Cash Over/Short',           'expense',   'debit',  'Operating Expenses',   false, NULL, 616),
  (gen_random_uuid()::text, 'retail_default', '6170', 'Chargeback Expense',        'expense',   'debit',  'Operating Expenses',   false, NULL, 617)
ON CONFLICT DO NOTHING;

-- ============================================================
-- restaurant_default
-- ============================================================
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order)
VALUES
  (gen_random_uuid()::text, 'restaurant_default', '2320', 'Customer Deposits Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 232),
  (gen_random_uuid()::text, 'restaurant_default', '2500', 'Payroll Clearing',          'liability', 'credit', 'Current Liabilities', false, NULL, 250),
  (gen_random_uuid()::text, 'restaurant_default', '4110', 'Returns & Allowances',      'revenue',   'debit',  'Operating Revenue',    false, NULL, 411),
  (gen_random_uuid()::text, 'restaurant_default', '4510', 'Surcharge Revenue',         'revenue',   'credit', 'Operating Revenue',    false, NULL, 451),
  (gen_random_uuid()::text, 'restaurant_default', '6150', 'Comp Expense',              'expense',   'debit',  'Operating Expenses',   false, NULL, 615),
  (gen_random_uuid()::text, 'restaurant_default', '6160', 'Cash Over/Short',           'expense',   'debit',  'Operating Expenses',   false, NULL, 616),
  (gen_random_uuid()::text, 'restaurant_default', '6170', 'Chargeback Expense',        'expense',   'debit',  'Operating Expenses',   false, NULL, 617)
ON CONFLICT DO NOTHING;

-- ============================================================
-- hybrid_default
-- ============================================================
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order)
VALUES
  (gen_random_uuid()::text, 'hybrid_default', '2320', 'Customer Deposits Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 232),
  (gen_random_uuid()::text, 'hybrid_default', '2500', 'Payroll Clearing',          'liability', 'credit', 'Current Liabilities', false, NULL, 250),
  (gen_random_uuid()::text, 'hybrid_default', '4110', 'Returns & Allowances',      'revenue',   'debit',  'Operating Revenue',    false, NULL, 411),
  (gen_random_uuid()::text, 'hybrid_default', '4510', 'Surcharge Revenue',         'revenue',   'credit', 'Operating Revenue',    false, NULL, 451),
  (gen_random_uuid()::text, 'hybrid_default', '6150', 'Comp Expense',              'expense',   'debit',  'Operating Expenses',   false, NULL, 615),
  (gen_random_uuid()::text, 'hybrid_default', '6160', 'Cash Over/Short',           'expense',   'debit',  'Operating Expenses',   false, NULL, 616),
  (gen_random_uuid()::text, 'hybrid_default', '6170', 'Chargeback Expense',        'expense',   'debit',  'Operating Expenses',   false, NULL, 617)
ON CONFLICT DO NOTHING;

-- ============================================================
-- pms_default
-- ============================================================
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order)
VALUES
  (gen_random_uuid()::text, 'pms_default', '2320', 'Customer Deposits Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 232),
  (gen_random_uuid()::text, 'pms_default', '2500', 'Payroll Clearing',          'liability', 'credit', 'Current Liabilities', false, NULL, 250),
  (gen_random_uuid()::text, 'pms_default', '4110', 'Returns & Allowances',      'revenue',   'debit',  'Operating Revenue',    false, NULL, 411),
  (gen_random_uuid()::text, 'pms_default', '4510', 'Surcharge Revenue',         'revenue',   'credit', 'Operating Revenue',    false, NULL, 451),
  (gen_random_uuid()::text, 'pms_default', '6150', 'Comp Expense',              'expense',   'debit',  'Operating Expenses',   false, NULL, 615),
  (gen_random_uuid()::text, 'pms_default', '6160', 'Cash Over/Short',           'expense',   'debit',  'Operating Expenses',   false, NULL, 616),
  (gen_random_uuid()::text, 'pms_default', '6170', 'Chargeback Expense',        'expense',   'debit',  'Operating Expenses',   false, NULL, 617)
ON CONFLICT DO NOTHING;
