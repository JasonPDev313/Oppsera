-- GL Transaction Type Mappings: clean Credit/Debit model for all 45 transaction types.
-- This table provides an accountant-facing view. For tender types, a write-through
-- backfill to payment_type_gl_defaults keeps the POS adapter working unchanged.

CREATE TABLE IF NOT EXISTS gl_transaction_type_mappings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  transaction_type_code TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  credit_account_id TEXT REFERENCES gl_accounts(id),
  debit_account_id TEXT REFERENCES gl_accounts(id),
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one mapping per tenant per code per location (NULL = tenant-wide)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_tt_mappings_tenant_code_loc
  ON gl_transaction_type_mappings (tenant_id, transaction_type_code)
  WHERE location_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_tt_mappings_tenant_code_loc_specific
  ON gl_transaction_type_mappings (tenant_id, transaction_type_code, location_id)
  WHERE location_id IS NOT NULL;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_gl_tt_mappings_tenant
  ON gl_transaction_type_mappings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_gl_tt_mappings_code
  ON gl_transaction_type_mappings (tenant_id, transaction_type_code);

-- ── RLS ─────────────────────────────────────────────────────────
ALTER TABLE gl_transaction_type_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_transaction_type_mappings FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gl_transaction_type_mappings' AND policyname = 'gl_tt_mappings_select') THEN
    CREATE POLICY gl_tt_mappings_select ON gl_transaction_type_mappings
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gl_transaction_type_mappings' AND policyname = 'gl_tt_mappings_insert') THEN
    CREATE POLICY gl_tt_mappings_insert ON gl_transaction_type_mappings
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gl_transaction_type_mappings' AND policyname = 'gl_tt_mappings_update') THEN
    CREATE POLICY gl_tt_mappings_update ON gl_transaction_type_mappings
      FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gl_transaction_type_mappings' AND policyname = 'gl_tt_mappings_delete') THEN
    CREATE POLICY gl_tt_mappings_delete ON gl_transaction_type_mappings
      FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── Backfill from payment_type_gl_defaults for tender types ─────
-- cash/check types: cash_account_id → debit_account_id
-- card/ach/ecom types: clearing_account_id → debit_account_id
-- Deterministic: uses the registry's defaultDebitKind classification

INSERT INTO gl_transaction_type_mappings (id, tenant_id, transaction_type_code, debit_account_id, source, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  ptgd.tenant_id,
  ptgd.payment_type_id,
  CASE
    -- cash_bank types: backfill from cash_account_id
    WHEN ptgd.payment_type_id IN ('cash', 'check') THEN ptgd.cash_account_id
    -- clearing types: backfill from clearing_account_id
    WHEN ptgd.payment_type_id IN ('card', 'ecom', 'ach') THEN COALESCE(ptgd.clearing_account_id, ptgd.cash_account_id)
    ELSE NULL
  END AS debit_account_id,
  'backfilled',
  NOW(),
  NOW()
FROM payment_type_gl_defaults ptgd
WHERE ptgd.payment_type_id IN ('cash', 'check', 'card', 'ecom', 'ach')
  AND (ptgd.cash_account_id IS NOT NULL OR ptgd.clearing_account_id IS NOT NULL)
ON CONFLICT DO NOTHING;
