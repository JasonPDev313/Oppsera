-- 0168: PMS Loyalty/Points
-- Phase E3: Loyalty programs, members, transactions

CREATE TABLE IF NOT EXISTS pms_loyalty_programs (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  points_per_dollar INTEGER NOT NULL DEFAULT 10,
  points_per_night INTEGER NOT NULL DEFAULT 0,
  redemption_value_cents INTEGER NOT NULL DEFAULT 1,
  tiers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pms_loyalty_programs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_pms_loyalty_programs_tenant ON pms_loyalty_programs (tenant_id);

CREATE TABLE IF NOT EXISTS pms_loyalty_members (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  guest_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  points_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  current_tier TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pms_loyalty_members_pkey PRIMARY KEY (id),
  CONSTRAINT uq_pms_loyalty_members UNIQUE (tenant_id, guest_id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_pms_loyalty_members_tenant ON pms_loyalty_members (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pms_loyalty_members_guest ON pms_loyalty_members (tenant_id, guest_id);
CREATE INDEX IF NOT EXISTS idx_pms_loyalty_members_program ON pms_loyalty_members (tenant_id, program_id);

CREATE TABLE IF NOT EXISTS pms_loyalty_transactions (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reservation_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  CONSTRAINT pms_loyalty_transactions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_pms_loyalty_transactions_tenant ON pms_loyalty_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pms_loyalty_transactions_member ON pms_loyalty_transactions (tenant_id, member_id);

-- RLS for all 3 tables
ALTER TABLE pms_loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_loyalty_programs FORCE ROW LEVEL SECURITY;
ALTER TABLE pms_loyalty_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_loyalty_members FORCE ROW LEVEL SECURITY;
ALTER TABLE pms_loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_loyalty_transactions FORCE ROW LEVEL SECURITY;

-- Programs RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_loyalty_programs_tenant_isolation' AND tablename = 'pms_loyalty_programs') THEN
    CREATE POLICY pms_loyalty_programs_tenant_isolation ON pms_loyalty_programs
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_loyalty_programs_tenant_insert' AND tablename = 'pms_loyalty_programs') THEN
    CREATE POLICY pms_loyalty_programs_tenant_insert ON pms_loyalty_programs
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_loyalty_programs_tenant_update' AND tablename = 'pms_loyalty_programs') THEN
    CREATE POLICY pms_loyalty_programs_tenant_update ON pms_loyalty_programs
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- Members RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_loyalty_members_tenant_isolation' AND tablename = 'pms_loyalty_members') THEN
    CREATE POLICY pms_loyalty_members_tenant_isolation ON pms_loyalty_members
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_loyalty_members_tenant_insert' AND tablename = 'pms_loyalty_members') THEN
    CREATE POLICY pms_loyalty_members_tenant_insert ON pms_loyalty_members
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_loyalty_members_tenant_update' AND tablename = 'pms_loyalty_members') THEN
    CREATE POLICY pms_loyalty_members_tenant_update ON pms_loyalty_members
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- Transactions RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_loyalty_transactions_tenant_isolation' AND tablename = 'pms_loyalty_transactions') THEN
    CREATE POLICY pms_loyalty_transactions_tenant_isolation ON pms_loyalty_transactions
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_loyalty_transactions_tenant_insert' AND tablename = 'pms_loyalty_transactions') THEN
    CREATE POLICY pms_loyalty_transactions_tenant_insert ON pms_loyalty_transactions
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
