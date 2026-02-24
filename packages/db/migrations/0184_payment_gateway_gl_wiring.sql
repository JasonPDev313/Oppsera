-- Migration 0184: Payment Gateway GL Wiring
-- Adds surcharge revenue GL account setting for proper surcharge GL posting.
-- Previously surcharges fell back to uncategorized revenue.

-- 1. Add surcharge revenue account to accounting_settings
ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_surcharge_revenue_account_id TEXT;

-- 2. Add COA template for surcharge revenue (account 4510)
-- Fixed: use correct column names (template_key, classification_name)
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, sort_order)
SELECT
  gen_random_uuid()::text,
  tk.template_key,
  '4510',
  'Credit Card Surcharge Revenue',
  'revenue',
  'credit',
  'Revenue',
  false,
  4510
FROM (VALUES ('retail'), ('restaurant'), ('golf'), ('hybrid')) AS tk(template_key)
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_templates
  WHERE template_key = tk.template_key AND account_number = '4510'
);

-- 3. Add COA template for ACH receivable (account 1160) if not already present
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, sort_order)
SELECT
  gen_random_uuid()::text,
  tk.template_key,
  '1160',
  'ACH Payments Receivable',
  'asset',
  'debit',
  'Current Assets',
  false,
  1160
FROM (VALUES ('retail'), ('restaurant'), ('golf'), ('hybrid')) AS tk(template_key)
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_templates
  WHERE template_key = tk.template_key AND account_number = '1160'
);
