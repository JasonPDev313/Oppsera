-- Payment Gateway Foundation: providers, merchant accounts (MIDs), terminal assignments, intents, transactions, webhooks
-- Supports terminal-level MID assignment: terminal 1 can use a different MID than terminal 2

-- ── Payment Providers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_providers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'gateway',
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_providers_tenant ON payment_providers(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_providers_tenant_code ON payment_providers(tenant_id, code);

-- ── Payment Provider Credentials (encrypted API keys) ────────────
CREATE TABLE IF NOT EXISTS payment_provider_credentials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_id TEXT NOT NULL REFERENCES payment_providers(id),
  location_id TEXT REFERENCES locations(id),
  credentials_encrypted TEXT NOT NULL,
  is_sandbox BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_creds_tenant ON payment_provider_credentials(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_creds_tenant_provider_location
  ON payment_provider_credentials(tenant_id, provider_id, COALESCE(location_id, '__null__'));

-- ── Payment Merchant Accounts (MIDs) ─────────────────────────────
-- A location/course can have multiple MIDs. Terminals are assigned to specific MIDs.
CREATE TABLE IF NOT EXISTS payment_merchant_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_id TEXT NOT NULL REFERENCES payment_providers(id),
  location_id TEXT REFERENCES locations(id),
  merchant_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_merchant_accts_tenant ON payment_merchant_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_merchant_accts_tenant_location ON payment_merchant_accounts(tenant_id, location_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_merchant_accts_tenant_provider_mid
  ON payment_merchant_accounts(tenant_id, provider_id, merchant_id);

-- ── Terminal Merchant Assignments (terminal → MID) ───────────────
CREATE TABLE IF NOT EXISTS terminal_merchant_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  terminal_id TEXT NOT NULL REFERENCES terminals(id),
  merchant_account_id TEXT NOT NULL REFERENCES payment_merchant_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_merchant_tenant ON terminal_merchant_assignments(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_merchant_tenant_terminal ON terminal_merchant_assignments(tenant_id, terminal_id);

-- ── Payment Intents (authorization lifecycle) ────────────────────
CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  provider_id TEXT NOT NULL REFERENCES payment_providers(id),
  merchant_account_id TEXT NOT NULL REFERENCES payment_merchant_accounts(id),
  status TEXT NOT NULL DEFAULT 'created',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  authorized_amount_cents INTEGER,
  captured_amount_cents INTEGER,
  refunded_amount_cents INTEGER,
  customer_id TEXT,
  order_id TEXT,
  provider_order_id TEXT,
  payment_method_type TEXT NOT NULL,
  token TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  tender_id TEXT,
  metadata JSONB,
  idempotency_key TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_status ON payment_intents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_order ON payment_intents(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_provider_order ON payment_intents(tenant_id, provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_customer ON payment_intents(tenant_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_tenant_idempotency ON payment_intents(tenant_id, idempotency_key);

-- ── Payment Transactions (individual provider API calls) ─────────
CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  transaction_type TEXT NOT NULL,
  provider_ref TEXT,
  auth_code TEXT,
  amount_cents INTEGER NOT NULL,
  response_status TEXT NOT NULL,
  response_code TEXT,
  response_text TEXT,
  avs_response TEXT,
  cvv_response TEXT,
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_txn_tenant_ref ON payment_transactions(tenant_id, provider_ref);
CREATE INDEX IF NOT EXISTS idx_payment_txn_intent ON payment_transactions(payment_intent_id);

-- ── Payment Webhook Events (deduplication) ───────────────────────
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_tenant ON payment_webhook_events(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_webhooks_tenant_provider_event
  ON payment_webhook_events(tenant_id, provider_code, event_id);

-- ── Add payment_intent_id column to tenders for linkage ──────────
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS payment_intent_id TEXT REFERENCES payment_intents(id);
CREATE INDEX IF NOT EXISTS idx_tenders_payment_intent ON tenders(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

-- ── RLS Policies ─────────────────────────────────────────────────
ALTER TABLE payment_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_providers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_providers_tenant_isolation ON payment_providers;
CREATE POLICY payment_providers_tenant_isolation ON payment_providers
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_providers_tenant_insert ON payment_providers;
CREATE POLICY payment_providers_tenant_insert ON payment_providers
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_providers_tenant_update ON payment_providers;
CREATE POLICY payment_providers_tenant_update ON payment_providers
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_providers_tenant_delete ON payment_providers;
CREATE POLICY payment_providers_tenant_delete ON payment_providers
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- payment_provider_credentials
ALTER TABLE payment_provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_provider_credentials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_creds_tenant_isolation ON payment_provider_credentials;
CREATE POLICY payment_creds_tenant_isolation ON payment_provider_credentials
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_creds_tenant_insert ON payment_provider_credentials;
CREATE POLICY payment_creds_tenant_insert ON payment_provider_credentials
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_creds_tenant_update ON payment_provider_credentials;
CREATE POLICY payment_creds_tenant_update ON payment_provider_credentials
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_creds_tenant_delete ON payment_provider_credentials;
CREATE POLICY payment_creds_tenant_delete ON payment_provider_credentials
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- payment_merchant_accounts
ALTER TABLE payment_merchant_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_merchant_accounts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_merch_accts_tenant_isolation ON payment_merchant_accounts;
CREATE POLICY payment_merch_accts_tenant_isolation ON payment_merchant_accounts
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_merch_accts_tenant_insert ON payment_merchant_accounts;
CREATE POLICY payment_merch_accts_tenant_insert ON payment_merchant_accounts
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_merch_accts_tenant_update ON payment_merchant_accounts;
CREATE POLICY payment_merch_accts_tenant_update ON payment_merchant_accounts
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_merch_accts_tenant_delete ON payment_merchant_accounts;
CREATE POLICY payment_merch_accts_tenant_delete ON payment_merchant_accounts
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- terminal_merchant_assignments
ALTER TABLE terminal_merchant_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_merchant_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terminal_merch_tenant_isolation ON terminal_merchant_assignments;
CREATE POLICY terminal_merch_tenant_isolation ON terminal_merchant_assignments
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS terminal_merch_tenant_insert ON terminal_merchant_assignments;
CREATE POLICY terminal_merch_tenant_insert ON terminal_merchant_assignments
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS terminal_merch_tenant_update ON terminal_merchant_assignments;
CREATE POLICY terminal_merch_tenant_update ON terminal_merchant_assignments
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS terminal_merch_tenant_delete ON terminal_merchant_assignments;
CREATE POLICY terminal_merch_tenant_delete ON terminal_merchant_assignments
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- payment_intents
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_intents_tenant_isolation ON payment_intents;
CREATE POLICY payment_intents_tenant_isolation ON payment_intents
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_intents_tenant_insert ON payment_intents;
CREATE POLICY payment_intents_tenant_insert ON payment_intents
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_intents_tenant_update ON payment_intents;
CREATE POLICY payment_intents_tenant_update ON payment_intents
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_intents_tenant_delete ON payment_intents;
CREATE POLICY payment_intents_tenant_delete ON payment_intents
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- payment_transactions
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_txn_tenant_isolation ON payment_transactions;
CREATE POLICY payment_txn_tenant_isolation ON payment_transactions
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_txn_tenant_insert ON payment_transactions;
CREATE POLICY payment_txn_tenant_insert ON payment_transactions
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- payment_webhook_events
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_webhooks_tenant_isolation ON payment_webhook_events;
CREATE POLICY payment_webhooks_tenant_isolation ON payment_webhook_events
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_webhooks_tenant_insert ON payment_webhook_events;
CREATE POLICY payment_webhooks_tenant_insert ON payment_webhook_events
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS payment_webhooks_tenant_update ON payment_webhook_events;
CREATE POLICY payment_webhooks_tenant_update ON payment_webhook_events
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
