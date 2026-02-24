-- Migration: 0181_surcharge_settings
-- Description: Surcharge settings table for credit card surcharging with compliance rules

-- ── Surcharge Settings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surcharge_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_id TEXT NOT NULL REFERENCES payment_providers(id),
  location_id TEXT REFERENCES locations(id),      -- NULL = tenant-wide default
  terminal_id TEXT REFERENCES terminals(id),      -- NULL = location/tenant scope
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  surcharge_rate NUMERIC(5,4) NOT NULL DEFAULT 0, -- e.g. 0.0350 = 3.50%
  max_surcharge_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0400, -- 4% cap
  apply_to_credit_only BOOLEAN NOT NULL DEFAULT true,
  exempt_debit BOOLEAN NOT NULL DEFAULT true,
  exempt_prepaid BOOLEAN NOT NULL DEFAULT true,
  customer_disclosure_text TEXT DEFAULT 'A surcharge of {rate}% will be applied to credit card transactions.',
  receipt_disclosure_text TEXT DEFAULT 'Credit Card Surcharge: ${amount}',
  prohibited_states TEXT[] DEFAULT ARRAY['CT','ME','MA','OK','PR'],
  gl_account_id TEXT,  -- surcharge revenue account (FK enforced at app level to avoid circular schema)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique indexes to handle NULLs properly:
-- Tenant-wide default (no location, no terminal)
CREATE UNIQUE INDEX IF NOT EXISTS uq_surcharge_tenant_provider_default
  ON surcharge_settings (tenant_id, provider_id)
  WHERE location_id IS NULL AND terminal_id IS NULL;

-- Location-specific (no terminal)
CREATE UNIQUE INDEX IF NOT EXISTS uq_surcharge_tenant_provider_location
  ON surcharge_settings (tenant_id, provider_id, location_id)
  WHERE location_id IS NOT NULL AND terminal_id IS NULL;

-- Terminal-specific
CREATE UNIQUE INDEX IF NOT EXISTS uq_surcharge_tenant_provider_terminal
  ON surcharge_settings (tenant_id, provider_id, terminal_id)
  WHERE terminal_id IS NOT NULL;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_surcharge_settings_tenant
  ON surcharge_settings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_surcharge_settings_tenant_provider
  ON surcharge_settings (tenant_id, provider_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE surcharge_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE surcharge_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS surcharge_settings_select ON surcharge_settings;
CREATE POLICY surcharge_settings_select ON surcharge_settings
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS surcharge_settings_insert ON surcharge_settings;
CREATE POLICY surcharge_settings_insert ON surcharge_settings
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS surcharge_settings_update ON surcharge_settings;
CREATE POLICY surcharge_settings_update ON surcharge_settings
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS surcharge_settings_delete ON surcharge_settings;
CREATE POLICY surcharge_settings_delete ON surcharge_settings
  FOR DELETE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );
