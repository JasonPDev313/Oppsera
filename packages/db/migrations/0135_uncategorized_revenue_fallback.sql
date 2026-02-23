-- Migration 0135: Add uncategorized revenue fallback account
-- Ensures POS GL posting NEVER silently drops revenue.
-- When sub-department mapping is missing, revenue posts to this fallback account.

-- 1. Add fallback column to accounting_settings
ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_uncategorized_revenue_account_id TEXT
  REFERENCES gl_accounts(id);

-- 2. Seed "Uncategorized Revenue" (49900) into all COA templates
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order)
VALUES
  (gen_random_uuid()::text, 'retail_default',     '49900', 'Uncategorized Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 990),
  (gen_random_uuid()::text, 'restaurant_default',  '49900', 'Uncategorized Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 990),
  (gen_random_uuid()::text, 'golf_default',        '49900', 'Uncategorized Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 990),
  (gen_random_uuid()::text, 'hybrid_default',      '49900', 'Uncategorized Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 990),
  (gen_random_uuid()::text, 'pms_default',         '49900', 'Uncategorized Revenue', 'revenue', 'credit', 'Operating Revenue', false, NULL, 990)
ON CONFLICT DO NOTHING;
