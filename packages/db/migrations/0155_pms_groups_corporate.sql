-- Migration: 0155_pms_groups_corporate
-- Description: PMS Group Bookings + Corporate Accounts (Features #5 and #14)

-- ── PMS Corporate Accounts ──────────────────────────────────────────
-- Created first because pms_groups references corporate_account_id

CREATE TABLE IF NOT EXISTS pms_corporate_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT,
  company_name TEXT NOT NULL,
  tax_id TEXT,
  billing_address_json JSONB,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  default_rate_plan_id TEXT REFERENCES pms_rate_plans(id),
  negotiated_discount_pct INTEGER DEFAULT 0,
  billing_type TEXT NOT NULL DEFAULT 'credit_card',
  payment_terms_days INTEGER DEFAULT 30,
  credit_limit_cents INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_pms_corporate_accounts_tenant_property
  ON pms_corporate_accounts (tenant_id, property_id);

CREATE INDEX IF NOT EXISTS idx_pms_corporate_accounts_tenant_company
  ON pms_corporate_accounts (tenant_id, company_name);

-- RLS for pms_corporate_accounts
ALTER TABLE pms_corporate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_corporate_accounts FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_corporate_accounts' AND policyname = 'pms_corporate_accounts_select') THEN
    CREATE POLICY pms_corporate_accounts_select ON pms_corporate_accounts
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_corporate_accounts' AND policyname = 'pms_corporate_accounts_insert') THEN
    CREATE POLICY pms_corporate_accounts_insert ON pms_corporate_accounts
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_corporate_accounts' AND policyname = 'pms_corporate_accounts_update') THEN
    CREATE POLICY pms_corporate_accounts_update ON pms_corporate_accounts
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_corporate_accounts' AND policyname = 'pms_corporate_accounts_delete') THEN
    CREATE POLICY pms_corporate_accounts_delete ON pms_corporate_accounts
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;


-- ── PMS Groups ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  name TEXT NOT NULL,
  group_type TEXT NOT NULL DEFAULT 'other',
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  corporate_account_id TEXT REFERENCES pms_corporate_accounts(id),
  rate_plan_id TEXT REFERENCES pms_rate_plans(id),
  negotiated_rate_cents INTEGER,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cutoff_date DATE,
  status TEXT NOT NULL DEFAULT 'tentative',
  total_rooms_blocked INTEGER NOT NULL DEFAULT 0,
  rooms_picked_up INTEGER NOT NULL DEFAULT 0,
  billing_type TEXT NOT NULL DEFAULT 'individual',
  master_folio_id TEXT REFERENCES pms_folios(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT,
  CONSTRAINT chk_pms_groups_dates CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_pms_groups_tenant_property
  ON pms_groups (tenant_id, property_id);

CREATE INDEX IF NOT EXISTS idx_pms_groups_tenant_property_status
  ON pms_groups (tenant_id, property_id, status);

-- RLS for pms_groups
ALTER TABLE pms_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_groups FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_groups' AND policyname = 'pms_groups_select') THEN
    CREATE POLICY pms_groups_select ON pms_groups
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_groups' AND policyname = 'pms_groups_insert') THEN
    CREATE POLICY pms_groups_insert ON pms_groups
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_groups' AND policyname = 'pms_groups_update') THEN
    CREATE POLICY pms_groups_update ON pms_groups
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_groups' AND policyname = 'pms_groups_delete') THEN
    CREATE POLICY pms_groups_delete ON pms_groups
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;


-- ── PMS Group Room Blocks ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_group_room_blocks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  group_id TEXT NOT NULL REFERENCES pms_groups(id),
  room_type_id TEXT NOT NULL REFERENCES pms_room_types(id),
  block_date DATE NOT NULL,
  rooms_blocked INTEGER NOT NULL DEFAULT 0,
  rooms_picked_up INTEGER NOT NULL DEFAULT 0,
  released BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_group_room_blocks
  ON pms_group_room_blocks (tenant_id, group_id, room_type_id, block_date);

CREATE INDEX IF NOT EXISTS idx_pms_group_room_blocks_tenant_group
  ON pms_group_room_blocks (tenant_id, group_id);

-- RLS for pms_group_room_blocks
ALTER TABLE pms_group_room_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_group_room_blocks FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_group_room_blocks' AND policyname = 'pms_group_room_blocks_select') THEN
    CREATE POLICY pms_group_room_blocks_select ON pms_group_room_blocks
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_group_room_blocks' AND policyname = 'pms_group_room_blocks_insert') THEN
    CREATE POLICY pms_group_room_blocks_insert ON pms_group_room_blocks
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_group_room_blocks' AND policyname = 'pms_group_room_blocks_update') THEN
    CREATE POLICY pms_group_room_blocks_update ON pms_group_room_blocks
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_group_room_blocks' AND policyname = 'pms_group_room_blocks_delete') THEN
    CREATE POLICY pms_group_room_blocks_delete ON pms_group_room_blocks
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;


-- ── PMS Corporate Rate Overrides ────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_corporate_rate_overrides (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  corporate_account_id TEXT NOT NULL REFERENCES pms_corporate_accounts(id),
  room_type_id TEXT NOT NULL REFERENCES pms_room_types(id),
  negotiated_rate_cents INTEGER NOT NULL,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_corporate_rate_overrides_tenant_account
  ON pms_corporate_rate_overrides (tenant_id, corporate_account_id);

-- RLS for pms_corporate_rate_overrides
ALTER TABLE pms_corporate_rate_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_corporate_rate_overrides FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_corporate_rate_overrides' AND policyname = 'pms_corporate_rate_overrides_select') THEN
    CREATE POLICY pms_corporate_rate_overrides_select ON pms_corporate_rate_overrides
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_corporate_rate_overrides' AND policyname = 'pms_corporate_rate_overrides_insert') THEN
    CREATE POLICY pms_corporate_rate_overrides_insert ON pms_corporate_rate_overrides
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_corporate_rate_overrides' AND policyname = 'pms_corporate_rate_overrides_update') THEN
    CREATE POLICY pms_corporate_rate_overrides_update ON pms_corporate_rate_overrides
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_corporate_rate_overrides' AND policyname = 'pms_corporate_rate_overrides_delete') THEN
    CREATE POLICY pms_corporate_rate_overrides_delete ON pms_corporate_rate_overrides
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;


-- ── ALTER pms_reservations: add group_id and corporate_account_id ───

ALTER TABLE pms_reservations
  ADD COLUMN IF NOT EXISTS group_id TEXT;

ALTER TABLE pms_reservations
  ADD COLUMN IF NOT EXISTS corporate_account_id TEXT;
