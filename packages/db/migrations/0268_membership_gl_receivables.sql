-- Migration 0268: Add receivable-side GL account columns to membership_accounting_settings
-- Enables CMAA/USFRC-compliant account separation:
--   Dues Receivable (1110) vs House Account Receivable (1120) vs Notes Receivable (1130)

ALTER TABLE membership_accounting_settings
  ADD COLUMN IF NOT EXISTS default_dues_receivable_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_house_account_receivable_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_initiation_deferred_revenue_account_id TEXT;
