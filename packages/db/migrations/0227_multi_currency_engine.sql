-- Migration 0227: Multi-Currency Exchange Rate Engine
-- Adds currency_exchange_rates table for storing FX rates per tenant.
-- baseCurrency, supportedCurrencies, transactionCurrency, exchangeRate
-- already exist from migration 0121.

-- ── currency_exchange_rates ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS currency_exchange_rates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(12,6) NOT NULL,
  effective_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- Unique index: one rate per currency pair per date per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_currency_exchange_rates_pair_date
  ON currency_exchange_rates (tenant_id, from_currency, to_currency, effective_date);

-- Lookup index: find effective rate for a pair (latest <= date)
CREATE INDEX IF NOT EXISTS idx_currency_exchange_rates_lookup
  ON currency_exchange_rates (tenant_id, from_currency, to_currency, effective_date DESC);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_exchange_rates FORCE ROW LEVEL SECURITY;

-- SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'currency_exchange_rates_select' AND tablename = 'currency_exchange_rates') THEN
    CREATE POLICY currency_exchange_rates_select ON currency_exchange_rates
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- INSERT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'currency_exchange_rates_insert' AND tablename = 'currency_exchange_rates') THEN
    CREATE POLICY currency_exchange_rates_insert ON currency_exchange_rates
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- UPDATE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'currency_exchange_rates_update' AND tablename = 'currency_exchange_rates') THEN
    CREATE POLICY currency_exchange_rates_update ON currency_exchange_rates
      FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- DELETE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'currency_exchange_rates_delete' AND tablename = 'currency_exchange_rates') THEN
    CREATE POLICY currency_exchange_rates_delete ON currency_exchange_rates
      FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
