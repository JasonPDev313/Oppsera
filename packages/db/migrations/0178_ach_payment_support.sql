-- ACH Payment Support
-- Adds ACH-specific columns to existing tables and creates new ACH tables.

-- ── ACH columns on payment_intents ──────────────────────────────
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ach_account_type TEXT;
  -- 'ECHK' (checking) | 'ESAV' (savings)
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ach_sec_code TEXT;
  -- 'CCD' | 'PPD' | 'TEL' | 'WEB'
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ach_settlement_status TEXT;
  -- 'pending' | 'originated' | 'settled' | 'returned'
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ach_settled_at TIMESTAMPTZ;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ach_return_code TEXT;
  -- R01, R02, etc.
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ach_return_reason TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS bank_last4 TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_intents_ach_settlement
  ON payment_intents(tenant_id, ach_settlement_status)
  WHERE ach_settlement_status IS NOT NULL;

-- ── ACH columns on customer_payment_methods ─────────────────────
ALTER TABLE customer_payment_methods ADD COLUMN IF NOT EXISTS bank_routing_last4 TEXT;
ALTER TABLE customer_payment_methods ADD COLUMN IF NOT EXISTS bank_account_type TEXT;
  -- 'checking' | 'savings'
ALTER TABLE customer_payment_methods ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE customer_payment_methods ADD COLUMN IF NOT EXISTS verification_status TEXT
  NOT NULL DEFAULT 'not_applicable';
  -- 'not_applicable' | 'unverified' | 'pending_micro' | 'verified' | 'failed'
ALTER TABLE customer_payment_methods ADD COLUMN IF NOT EXISTS verification_attempts INTEGER
  NOT NULL DEFAULT 0;

-- ── ACH columns on payment_merchant_accounts ────────────────────
ALTER TABLE payment_merchant_accounts ADD COLUMN IF NOT EXISTS ach_enabled BOOLEAN
  NOT NULL DEFAULT false;
ALTER TABLE payment_merchant_accounts ADD COLUMN IF NOT EXISTS ach_default_sec_code TEXT
  DEFAULT 'WEB';
ALTER TABLE payment_merchant_accounts ADD COLUMN IF NOT EXISTS ach_company_name TEXT;
ALTER TABLE payment_merchant_accounts ADD COLUMN IF NOT EXISTS ach_company_id TEXT;
ALTER TABLE payment_merchant_accounts ADD COLUMN IF NOT EXISTS ach_verification_mode TEXT
  NOT NULL DEFAULT 'account_validation';
  -- 'none' | 'account_validation' | 'micro_deposit'

-- ── ACH Receivable GL account on accounting_settings ────────────
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS default_ach_receivable_account_id TEXT;

-- ── ACH Returns table (append-only) ────────────────────────────
CREATE TABLE IF NOT EXISTS ach_returns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  return_code TEXT NOT NULL,
  return_reason TEXT NOT NULL,
  return_date TEXT NOT NULL,
  original_amount_cents INTEGER NOT NULL,
  provider_ref TEXT,
  funding_batch_id TEXT,
  is_administrative BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ach_returns_tenant
  ON ach_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ach_returns_tenant_intent
  ON ach_returns(tenant_id, payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_ach_returns_tenant_date
  ON ach_returns(tenant_id, return_date);
CREATE INDEX IF NOT EXISTS idx_ach_returns_tenant_code
  ON ach_returns(tenant_id, return_code);

-- ── ACH Micro-Deposit Verification table ────────────────────────
CREATE TABLE IF NOT EXISTS ach_micro_deposits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  payment_method_id TEXT NOT NULL REFERENCES customer_payment_methods(id),
  amount1_cents INTEGER NOT NULL,
  amount2_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'deposited' | 'verified' | 'failed' | 'expired'
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  deposit_intent_id1 TEXT,
  deposit_intent_id2 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ach_micro_deposits_tenant
  ON ach_micro_deposits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ach_micro_deposits_method
  ON ach_micro_deposits(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_ach_micro_deposits_status
  ON ach_micro_deposits(tenant_id, status)
  WHERE status IN ('pending', 'deposited');

-- ── RLS Policies ────────────────────────────────────────────────

ALTER TABLE ach_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ach_returns FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ach_returns_tenant_isolation_select ON ach_returns
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ach_returns_tenant_isolation_insert ON ach_returns
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ach_micro_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ach_micro_deposits FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ach_micro_deposits_tenant_isolation_select ON ach_micro_deposits
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ach_micro_deposits_tenant_isolation_insert ON ach_micro_deposits
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ach_micro_deposits_tenant_isolation_update ON ach_micro_deposits
    FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── GL Account Template: ACH Receivable (1150) ─────────────────
-- Fixed: original used wrong column names (classification_type, business_type, created_at).
-- Correct insert is in migration 0185.
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, sort_order)
SELECT gen_random_uuid()::text, tk, '1150', 'ACH Receivable', 'asset', 'debit', 'Current Assets', false, 1150
FROM unnest(ARRAY['retail', 'restaurant', 'golf', 'hybrid']) AS tk
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_templates WHERE account_number = '1150' AND template_key = tk
);
