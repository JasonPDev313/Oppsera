-- UXOPS-04: Partial Refunds + Returns Account Strategy
-- Adds isContraAccount flag for P&L display and defaultReturnsAccountId.

-- ── gl_accounts: contra-account flag ──────────────────────────
ALTER TABLE gl_accounts
  ADD COLUMN IF NOT EXISTS is_contra_account BOOLEAN NOT NULL DEFAULT false;

-- ── accounting_settings: default returns account ──────────────
ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_returns_account_id TEXT REFERENCES gl_accounts(id);
