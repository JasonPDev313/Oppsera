-- Migration 0313: Add AR - House Accounts and AR - Corporate Accounts to all COA templates
-- Industry standards: USALI (hotels), NRA/USAR (restaurants), NRF (retail), CMAA/NCA (golf)
-- All use 1110 for house/member charge receivables, 1115 for corporate/group AR
-- ════════════════════════════════════════════════════════════════

-- ── 1. Add GL account templates for all 5 business types ──────

INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, control_account_type, sort_order)
VALUES
  -- AR - House Accounts (1110) — POS charge-to-account receivables
  (gen_random_uuid()::text, 'golf_default',       '1110', 'AR - House Accounts',    'asset', 'debit', 'Receivables', false, NULL, 55),
  (gen_random_uuid()::text, 'retail_default',     '1110', 'AR - House Accounts',    'asset', 'debit', 'Receivables', false, NULL, 42),
  (gen_random_uuid()::text, 'restaurant_default', '1110', 'AR - House Accounts',    'asset', 'debit', 'Receivables', false, NULL, 42),
  (gen_random_uuid()::text, 'hybrid_default',     '1110', 'AR - House Accounts',    'asset', 'debit', 'Receivables', false, NULL, 55),
  (gen_random_uuid()::text, 'pms_default',        '1110', 'AR - House Accounts',    'asset', 'debit', 'Receivables', false, NULL, 42),
  -- AR - Corporate Accounts (1115) — corporate billing / group invoices
  (gen_random_uuid()::text, 'golf_default',       '1115', 'AR - Corporate Accounts', 'asset', 'debit', 'Receivables', false, NULL, 57),
  (gen_random_uuid()::text, 'retail_default',     '1115', 'AR - Corporate Accounts', 'asset', 'debit', 'Receivables', false, NULL, 43),
  (gen_random_uuid()::text, 'restaurant_default', '1115', 'AR - Corporate Accounts', 'asset', 'debit', 'Receivables', false, NULL, 43),
  (gen_random_uuid()::text, 'hybrid_default',     '1115', 'AR - Corporate Accounts', 'asset', 'debit', 'Receivables', false, NULL, 57),
  (gen_random_uuid()::text, 'pms_default',        '1115', 'AR - Corporate Accounts', 'asset', 'debit', 'Receivables', false, NULL, 43)
ON CONFLICT DO NOTHING;


-- ── 2. Backfill existing tenants — add accounts if missing ────

-- Insert 1110 (AR - House Accounts) for every tenant that has 1100 (AR control) but not 1110
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, classification_id, is_active, is_control_account, control_account_type, allow_manual_posting, parent_account_id, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  ar.tenant_id,
  '1110',
  'AR - House Accounts',
  'asset',
  'debit',
  ar.classification_id,
  true,
  false,
  NULL,
  true,
  ar.id,  -- parent = 1100 AR control
  NOW(),
  NOW()
FROM gl_accounts ar
WHERE ar.account_number = '1100'
  AND ar.control_account_type = 'ar'
  AND NOT EXISTS (
    SELECT 1 FROM gl_accounts g2
    WHERE g2.tenant_id = ar.tenant_id AND g2.account_number = '1110'
  );

-- Insert 1115 (AR - Corporate Accounts) for every tenant that has 1100 but not 1115
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, classification_id, is_active, is_control_account, control_account_type, allow_manual_posting, parent_account_id, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  ar.tenant_id,
  '1115',
  'AR - Corporate Accounts',
  'asset',
  'debit',
  ar.classification_id,
  true,
  false,
  NULL,
  true,
  ar.id,  -- parent = 1100 AR control
  NOW(),
  NOW()
FROM gl_accounts ar
WHERE ar.account_number = '1100'
  AND ar.control_account_type = 'ar'
  AND NOT EXISTS (
    SELECT 1 FROM gl_accounts g2
    WHERE g2.tenant_id = ar.tenant_id AND g2.account_number = '1115'
  );


-- ── 3. Add accounting_settings column for house account receivable ──

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_house_account_receivable_account_id TEXT;

COMMENT ON COLUMN accounting_settings.default_house_account_receivable_account_id
  IS 'Default GL account for house account (POS charge-to-account) receivables — typically 1110';


-- ── 4. Auto-wire the new setting for existing tenants ─────────

UPDATE accounting_settings AS s
SET default_house_account_receivable_account_id = g.id
FROM gl_accounts g
WHERE g.tenant_id = s.tenant_id
  AND g.account_number = '1110'
  AND s.default_house_account_receivable_account_id IS NULL;


-- ── 5. Update payment_type_gl_defaults to point house_account at 1110 ──
-- Fix any house_account mapping that is NOT already pointing at 1110.
-- Covers: generic AR control (1100), Undeposited Funds, suspense, or any
-- other non-receivable account that was auto-wired before 1110 existed.
-- Guard: only updates if the tenant actually HAS a 1110 account.
-- Preserves: rows already pointing at 1110 (no-op via WHERE clause).

UPDATE payment_type_gl_defaults AS ptgd
SET cash_account_id = ha.id,
    updated_at = NOW()
FROM gl_accounts ha
WHERE ptgd.payment_type_id = 'house_account'
  AND ha.tenant_id = ptgd.tenant_id
  AND ha.account_number = '1110'
  AND ptgd.cash_account_id IS DISTINCT FROM ha.id;


-- ── 6. Nullify clearing_account_id on house_account rows ──────
-- House accounts are direct receivables — they must NEVER route through
-- a clearing account. If someone set one (direct DB edit, future UI bug),
-- null it out so the adapter always debits the receivable directly.

UPDATE payment_type_gl_defaults
SET clearing_account_id = NULL,
    updated_at = NOW()
WHERE payment_type_id = 'house_account'
  AND clearing_account_id IS NOT NULL;
