-- Fix: ACH Receivable GL account template seeding
-- Migration 0178 used wrong column names (classification_type, business_type, created_at)
-- which silently fail. This migration uses the correct columns (classification_name, template_key).

INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, sort_order)
SELECT gen_random_uuid()::text, tk, '1150', 'ACH Receivable', 'asset', 'debit', 'Current Assets', false, 1150
FROM unnest(ARRAY['retail', 'restaurant', 'golf', 'hybrid']) AS tk
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_templates WHERE account_number = '1150' AND template_key = tk
);
