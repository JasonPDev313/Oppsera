-- Migration 0126: Stored Value Instruments + Discount Rules Engine
-- Customer 360 Session 4: Unified stored value (gift cards, credit books, rainchecks,
-- range cards, rounds cards, prepaid balances, punchcards, awards) and rule-based discount engine.

-- ── stored_value_instruments ─────────────────────────────────────────────
-- Umbrella table for all stored value types: gift cards, credit books, rainchecks,
-- range cards, rounds cards, prepaid balances, punchcards, awards
CREATE TABLE stored_value_instruments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT REFERENCES customers(id),
  instrument_type TEXT NOT NULL, -- 'gift_card', 'credit_book', 'raincheck', 'range_card', 'rounds_card', 'prepaid_balance', 'punchcard', 'award'
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'frozen', 'expired', 'redeemed', 'voided'
  initial_value_cents INTEGER NOT NULL DEFAULT 0,
  current_balance_cents INTEGER NOT NULL DEFAULT 0,
  unit_count INTEGER, -- for rounds/punchcard types
  units_remaining INTEGER, -- for rounds/punchcard types
  liability_gl_account_id TEXT,
  description TEXT,
  expires_at TIMESTAMPTZ,
  issued_by TEXT,
  voucher_id TEXT, -- link to existing vouchers table if migrated
  meta_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_svi_tenant_code ON stored_value_instruments(tenant_id, code);
CREATE INDEX idx_svi_tenant_customer ON stored_value_instruments(tenant_id, customer_id);
CREATE INDEX idx_svi_tenant_type_status ON stored_value_instruments(tenant_id, instrument_type, status);

-- RLS: stored_value_instruments
ALTER TABLE stored_value_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stored_value_instruments FORCE ROW LEVEL SECURITY;

CREATE POLICY stored_value_instruments_select ON stored_value_instruments
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY stored_value_instruments_insert ON stored_value_instruments
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY stored_value_instruments_update ON stored_value_instruments
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY stored_value_instruments_delete ON stored_value_instruments
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ── stored_value_transactions ────────────────────────────────────────────
-- Append-only ledger for all stored value movements
CREATE TABLE stored_value_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  instrument_id TEXT NOT NULL REFERENCES stored_value_instruments(id),
  customer_id TEXT,
  txn_type TEXT NOT NULL, -- 'issue', 'redeem', 'reload', 'transfer_in', 'transfer_out', 'void', 'refund', 'expire', 'adjust'
  amount_cents INTEGER NOT NULL, -- signed: positive for issue/reload/refund/transfer_in, negative for redeem/transfer_out/void/expire
  unit_delta INTEGER, -- for rounds/punchcard
  running_balance_cents INTEGER NOT NULL, -- snapshot of balance after this txn
  source_module TEXT, -- 'pos', 'membership', 'admin', 'system'
  source_id TEXT, -- order ID, etc.
  ledger_entry_id TEXT, -- link to AR ledger
  gl_journal_entry_id TEXT, -- link to GL
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_svt_tenant_instrument ON stored_value_transactions(tenant_id, instrument_id);
CREATE INDEX idx_svt_tenant_customer ON stored_value_transactions(tenant_id, customer_id);
CREATE INDEX idx_svt_tenant_created ON stored_value_transactions(tenant_id, created_at DESC);

-- RLS: stored_value_transactions (append-only — SELECT + INSERT only, no UPDATE or DELETE)
ALTER TABLE stored_value_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stored_value_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY stored_value_transactions_select ON stored_value_transactions
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY stored_value_transactions_insert ON stored_value_transactions
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ── discount_rules ──────────────────────────────────────────────────────
-- Rule-based discount engine with scope, priority, conditions, and usage tracking
CREATE TABLE discount_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  scope_type TEXT NOT NULL DEFAULT 'global', -- 'global', 'membership_class', 'customer', 'segment'
  customer_id TEXT, -- populated when scope_type = 'customer'
  membership_class_id TEXT, -- populated when scope_type = 'membership_class'
  segment_id TEXT, -- populated when scope_type = 'segment'
  priority INTEGER NOT NULL DEFAULT 100, -- lower = higher priority
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_date DATE,
  expiration_date DATE,
  rule_json JSONB NOT NULL, -- { conditions: [...], actions: [...], maxUsesPerPeriod, maxUsesPerCustomer, stackable }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_discount_rules_tenant_active ON discount_rules(tenant_id, is_active);
CREATE INDEX idx_discount_rules_tenant_scope ON discount_rules(tenant_id, scope_type);
CREATE INDEX idx_discount_rules_tenant_customer ON discount_rules(tenant_id, customer_id) WHERE customer_id IS NOT NULL;

-- RLS: discount_rules
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY discount_rules_select ON discount_rules
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY discount_rules_insert ON discount_rules
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY discount_rules_update ON discount_rules
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY discount_rules_delete ON discount_rules
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ── discount_rule_usage ─────────────────────────────────────────────────
-- Track usage per rule per customer per period for max-uses enforcement
CREATE TABLE discount_rule_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  rule_id TEXT NOT NULL REFERENCES discount_rules(id),
  customer_id TEXT NOT NULL,
  period_key TEXT NOT NULL, -- 'YYYY-MM' or 'YYYY-WNN'
  uses_count INTEGER NOT NULL DEFAULT 0,
  amount_discounted_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_discount_rule_usage ON discount_rule_usage(tenant_id, rule_id, customer_id, period_key);

-- RLS: discount_rule_usage
ALTER TABLE discount_rule_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rule_usage FORCE ROW LEVEL SECURITY;

CREATE POLICY discount_rule_usage_select ON discount_rule_usage
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY discount_rule_usage_insert ON discount_rule_usage
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY discount_rule_usage_update ON discount_rule_usage
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY discount_rule_usage_delete ON discount_rule_usage
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ── Extend customer_privileges ──────────────────────────────────────────
ALTER TABLE customer_privileges ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customer_privileges ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE customer_privileges ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE customer_privileges ADD COLUMN IF NOT EXISTS granted_by TEXT;
ALTER TABLE customer_privileges ADD COLUMN IF NOT EXISTS notes TEXT;
