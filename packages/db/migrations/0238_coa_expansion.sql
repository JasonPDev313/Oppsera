-- Migration 0238: Comprehensive COA Expansion
-- Fixes 7 data integrity bugs + adds ~40 universal GL accounts across all 5 business types
-- All operations idempotent via ON CONFLICT DO NOTHING / IF NOT EXISTS

-- ════════════════════════════════════════════════════════════════
-- SECTION A: Missing Classification Templates
-- Migrations 0211, 0212, 0215, 0228, 0231 reference classification
-- names that were never defined in gl_classification_templates.
-- Accounts using these names get classification_id = NULL.
-- ════════════════════════════════════════════════════════════════

INSERT INTO gl_classification_templates (id, template_key, name, account_type, sort_order) VALUES
  ('clst_current_assets',      'shared', 'Current Assets',       'asset',    25),
  ('clst_current_liabilities', 'shared', 'Current Liabilities',  'liability', 35),
  ('clst_contra_revenue',      'shared', 'Contra Revenue',       'revenue',  15)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- SECTION B: Account Number Collision Fixes
-- Fix accounts that collide with existing account numbers from
-- earlier migrations. ON CONFLICT skipped the second insert,
-- so the intended account was never created.
-- ════════════════════════════════════════════════════════════════

-- Bug 2: 1300 collision (Prepaid Expenses vs Intercompany Receivable)
-- Renumber Intercompany Receivable from 1300 → 1190
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  (gen_random_uuid()::text, 'golf_default',       '1190', 'Intercompany Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 119),
  (gen_random_uuid()::text, 'retail_default',     '1190', 'Intercompany Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 119),
  (gen_random_uuid()::text, 'restaurant_default', '1190', 'Intercompany Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 119),
  (gen_random_uuid()::text, 'hybrid_default',     '1190', 'Intercompany Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 119),
  (gen_random_uuid()::text, 'pms_default',        '1190', 'Intercompany Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 119)
ON CONFLICT DO NOTHING;

-- Bug 3: 2310 collision (Deferred Revenue vs Employee Reimbursable)
-- Renumber Employee Reimbursable from 2310 → 2350
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  (gen_random_uuid()::text, 'golf_default',       '2350', 'Employee Reimbursable Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 235),
  (gen_random_uuid()::text, 'retail_default',     '2350', 'Employee Reimbursable Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 235),
  (gen_random_uuid()::text, 'restaurant_default', '2350', 'Employee Reimbursable Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 235),
  (gen_random_uuid()::text, 'hybrid_default',     '2350', 'Employee Reimbursable Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 235),
  (gen_random_uuid()::text, 'pms_default',        '2350', 'Employee Reimbursable Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 235)
ON CONFLICT DO NOTHING;

-- Bug 4: PMS 4110 collision (Room Revenue vs Returns & Allowances)
-- PMS keeps Room Revenue at 4110, gets Returns at 4915
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  (gen_random_uuid()::text, 'pms_default', '4915', 'Returns & Allowances', 'revenue', 'debit', 'Discounts & Returns', false, NULL, 4915)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- SECTION C: Fix Orphaned Template Keys (migrations 0184/0185)
-- These used 'retail','golf' etc. instead of 'retail_default','golf_default'.
-- The orphaned rows are harmless. Insert correctly-keyed versions.
-- ════════════════════════════════════════════════════════════════

INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  -- Surcharge Revenue (from 0184)
  (gen_random_uuid()::text, 'golf_default',       '4510', 'Surcharge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 451),
  (gen_random_uuid()::text, 'retail_default',     '4510', 'Surcharge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 451),
  (gen_random_uuid()::text, 'restaurant_default', '4510', 'Surcharge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 451),
  (gen_random_uuid()::text, 'hybrid_default',     '4510', 'Surcharge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 451),
  (gen_random_uuid()::text, 'pms_default',        '4510', 'Surcharge Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 451),
  -- ACH Receivable 1150 (from 0184/0185 — ensure all templates have it)
  (gen_random_uuid()::text, 'golf_default',       '1150', 'ACH Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 115),
  (gen_random_uuid()::text, 'retail_default',     '1150', 'ACH Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 115),
  (gen_random_uuid()::text, 'restaurant_default', '1150', 'ACH Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 115),
  (gen_random_uuid()::text, 'hybrid_default',     '1150', 'ACH Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 115),
  (gen_random_uuid()::text, 'pms_default',        '1150', 'ACH Receivable', 'asset', 'debit', 'Current Assets', false, NULL, 115)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- SECTION D: New Universal Accounts
-- Added across all 5 business types via CROSS JOIN.
-- Covers industry standards: USALI, NRA/USAR, USFRC, NRF.
-- ════════════════════════════════════════════════════════════════

INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order)
SELECT
  gen_random_uuid()::text,
  tk,
  acct.account_number,
  acct.name,
  acct.account_type,
  acct.normal_balance,
  acct.classification_name,
  false,
  NULL,
  acct.sort_order
FROM (VALUES
  -- ── Assets ──
  ('1040', 'Savings / Money Market',              'asset', 'debit', 'Cash & Bank',              104),
  ('1060', 'Merchant Settlement Receivable',      'asset', 'debit', 'Current Assets',           106),
  ('1160', 'Credit Card Receivable',              'asset', 'debit', 'Current Assets',           116),
  ('1170', 'Gift Card Receivable',                'asset', 'debit', 'Current Assets',           117),
  ('1250', 'Allowance for Doubtful Accounts',     'asset', 'debit', 'Receivables',              125),
  ('1400', 'Accumulated Depreciation',            'asset', 'credit', 'Fixed Assets',            140),

  -- ── Liabilities ──
  ('2120', 'Gift Card Liability',                 'liability', 'credit', 'Current Liabilities',  212),
  ('2130', 'Loyalty Points Liability',            'liability', 'credit', 'Current Liabilities',  213),
  ('2200', 'Accrued Wages & Salaries',            'liability', 'credit', 'Accrued Liabilities',  220),
  ('2210', 'Accrued Benefits',                    'liability', 'credit', 'Accrued Liabilities',  221),
  ('2400', 'Current Portion - Long-Term Debt',    'liability', 'credit', 'Current Liabilities',  240),
  ('2510', 'Insurance Payable',                   'liability', 'credit', 'Current Liabilities',  251),
  ('2600', 'Long-Term Debt',                      'liability', 'credit', 'Accrued Liabilities',  260),

  -- ── Equity ──
  ('3100', 'Owner Contributions',                 'equity', 'credit', 'Owner Equity',            310),
  ('3200', 'Owner Draws / Distributions',         'equity', 'debit',  'Owner Equity',            320),

  -- ── Revenue ──
  ('4200', 'Online / E-Commerce Revenue',         'revenue', 'credit', 'Operating Revenue',      420),
  ('4300', 'Delivery / Third-Party Revenue',      'revenue', 'credit', 'Operating Revenue',      430),
  ('4700', 'Interest Income',                     'revenue', 'credit', 'Operating Revenue',      470),
  ('4800', 'Miscellaneous Income',                'revenue', 'credit', 'Operating Revenue',      480),
  ('4900', 'Gain on Asset Disposal',              'revenue', 'credit', 'Operating Revenue',      490),

  -- ── Expenses ──
  ('6010', 'CC Processing Fees',                  'expense', 'debit', 'Operating Expenses',      601),
  ('6020', 'Bank Service Charges',                'expense', 'debit', 'Operating Expenses',      602),
  ('6030', 'Bad Debt Expense',                    'expense', 'debit', 'Operating Expenses',      603),
  ('6040', 'Delivery Commission Expense',         'expense', 'debit', 'Operating Expenses',      604),
  ('6050', 'Marketing & Advertising',             'expense', 'debit', 'Operating Expenses',      605),
  ('6060', 'Rent & Occupancy',                    'expense', 'debit', 'Operating Expenses',      606),
  ('6070', 'Utilities',                           'expense', 'debit', 'Operating Expenses',      607),
  ('6080', 'Insurance Expense',                   'expense', 'debit', 'Operating Expenses',      608),
  ('6090', 'Repairs & Maintenance',               'expense', 'debit', 'Operating Expenses',      609),
  ('6100', 'Office Supplies & General Admin',     'expense', 'debit', 'Operating Expenses',      610),
  ('6110', 'Professional Fees',                   'expense', 'debit', 'Operating Expenses',      611),
  ('6120', 'Technology & Software',               'expense', 'debit', 'Operating Expenses',      612),
  ('6130', 'Depreciation Expense',                'expense', 'debit', 'Operating Expenses',      613),
  ('6140', 'Interest Expense',                    'expense', 'debit', 'Operating Expenses',      614),
  ('6180', 'Loss on Asset Disposal',              'expense', 'debit', 'Operating Expenses',      618),
  ('6190', 'Miscellaneous Expense',               'expense', 'debit', 'Operating Expenses',      619)
) AS acct(account_number, name, account_type, normal_balance, classification_name, sort_order)
CROSS JOIN (VALUES
  ('golf_default'),
  ('retail_default'),
  ('restaurant_default'),
  ('hybrid_default'),
  ('pms_default')
) AS templates(tk)
ON CONFLICT DO NOTHING;

-- Also ensure PMS gets Intercompany Payable (missing from 0228)
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order) VALUES
  (gen_random_uuid()::text, 'pms_default', '2900', 'Intercompany Payable', 'liability', 'credit', 'Current Liabilities', false, NULL, 290)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- SECTION E: New Accounting Settings Columns
-- 7 new columns on accounting_settings for auto-wiring.
-- (petty_cash + employee_reimbursable already exist from 0231)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_credit_card_receivable_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_gift_card_liability_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_cc_processing_fee_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_bad_debt_expense_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_interest_income_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_interest_expense_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_delivery_commission_account_id TEXT;
