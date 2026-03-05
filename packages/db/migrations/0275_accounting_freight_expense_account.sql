-- Add default freight expense account to accounting_settings
ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_freight_expense_account_id TEXT;
