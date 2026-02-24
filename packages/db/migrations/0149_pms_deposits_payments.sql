-- Phase A2: PMS Deposits & Payment Gateway
-- 4 new tables + columns on pms_reservations and pms_folios

-- -- Payment Methods (card on file) ------------------------------
CREATE TABLE IF NOT EXISTS pms_payment_methods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  guest_id TEXT NOT NULL REFERENCES pms_guests(id),
  gateway TEXT NOT NULL DEFAULT 'stripe',
  gateway_customer_id TEXT,
  gateway_payment_method_id TEXT,
  card_last_four TEXT,
  card_brand TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pms_payment_methods_guest
  ON pms_payment_methods (tenant_id, guest_id);
--> statement-breakpoint

-- -- Payment Transactions ----------------------------------------
CREATE TABLE IF NOT EXISTS pms_payment_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  folio_id TEXT REFERENCES pms_folios(id),
  reservation_id TEXT REFERENCES pms_reservations(id),
  payment_method_id TEXT REFERENCES pms_payment_methods(id),
  gateway TEXT NOT NULL DEFAULT 'stripe',
  gateway_charge_id TEXT,
  gateway_refund_id TEXT,
  transaction_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  idempotency_key TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pms_payment_transactions_folio
  ON pms_payment_transactions (tenant_id, folio_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pms_payment_transactions_reservation
  ON pms_payment_transactions (tenant_id, reservation_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pms_payment_transactions_idempotency
  ON pms_payment_transactions (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint

-- -- Deposit Policies --------------------------------------------
CREATE TABLE IF NOT EXISTS pms_deposit_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  name TEXT NOT NULL,
  deposit_type TEXT NOT NULL DEFAULT 'first_night',
  percentage_pct NUMERIC(5,2),
  fixed_amount_cents INTEGER,
  charge_timing TEXT NOT NULL DEFAULT 'at_booking',
  days_before INTEGER,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pms_deposit_policies_property
  ON pms_deposit_policies (tenant_id, property_id);
--> statement-breakpoint

-- -- Cancellation Policies ---------------------------------------
CREATE TABLE IF NOT EXISTS pms_cancellation_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  name TEXT NOT NULL,
  penalty_type TEXT NOT NULL DEFAULT 'none',
  percentage_pct NUMERIC(5,2),
  fixed_amount_cents INTEGER,
  deadline_hours INTEGER NOT NULL DEFAULT 24,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pms_cancellation_policies_property
  ON pms_cancellation_policies (tenant_id, property_id);
--> statement-breakpoint

-- -- Add columns to pms_reservations -----------------------------
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS deposit_policy_id TEXT REFERENCES pms_deposit_policies(id);
--> statement-breakpoint
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS cancellation_policy_id TEXT REFERENCES pms_cancellation_policies(id);
--> statement-breakpoint
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS deposit_amount_cents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS deposit_paid_cents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS payment_method_id TEXT REFERENCES pms_payment_methods(id);
--> statement-breakpoint

-- -- Add column to pms_folios ------------------------------------
ALTER TABLE pms_folios ADD COLUMN IF NOT EXISTS deposit_held_cents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint

-- -- RLS for pms_payment_methods ---------------------------------
ALTER TABLE pms_payment_methods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pms_payment_methods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS pms_payment_methods_select ON pms_payment_methods;
--> statement-breakpoint
CREATE POLICY pms_payment_methods_select ON pms_payment_methods
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_payment_methods_insert ON pms_payment_methods;
--> statement-breakpoint
CREATE POLICY pms_payment_methods_insert ON pms_payment_methods
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_payment_methods_update ON pms_payment_methods;
--> statement-breakpoint
CREATE POLICY pms_payment_methods_update ON pms_payment_methods
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_payment_methods_delete ON pms_payment_methods;
--> statement-breakpoint
CREATE POLICY pms_payment_methods_delete ON pms_payment_methods
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- RLS for pms_payment_transactions ----------------------------
ALTER TABLE pms_payment_transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pms_payment_transactions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS pms_payment_transactions_select ON pms_payment_transactions;
--> statement-breakpoint
CREATE POLICY pms_payment_transactions_select ON pms_payment_transactions
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_payment_transactions_insert ON pms_payment_transactions;
--> statement-breakpoint
CREATE POLICY pms_payment_transactions_insert ON pms_payment_transactions
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_payment_transactions_update ON pms_payment_transactions;
--> statement-breakpoint
CREATE POLICY pms_payment_transactions_update ON pms_payment_transactions
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_payment_transactions_delete ON pms_payment_transactions;
--> statement-breakpoint
CREATE POLICY pms_payment_transactions_delete ON pms_payment_transactions
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- RLS for pms_deposit_policies --------------------------------
ALTER TABLE pms_deposit_policies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pms_deposit_policies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS pms_deposit_policies_select ON pms_deposit_policies;
--> statement-breakpoint
CREATE POLICY pms_deposit_policies_select ON pms_deposit_policies
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_deposit_policies_insert ON pms_deposit_policies;
--> statement-breakpoint
CREATE POLICY pms_deposit_policies_insert ON pms_deposit_policies
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_deposit_policies_update ON pms_deposit_policies;
--> statement-breakpoint
CREATE POLICY pms_deposit_policies_update ON pms_deposit_policies
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_deposit_policies_delete ON pms_deposit_policies;
--> statement-breakpoint
CREATE POLICY pms_deposit_policies_delete ON pms_deposit_policies
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- RLS for pms_cancellation_policies ---------------------------
ALTER TABLE pms_cancellation_policies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pms_cancellation_policies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS pms_cancellation_policies_select ON pms_cancellation_policies;
--> statement-breakpoint
CREATE POLICY pms_cancellation_policies_select ON pms_cancellation_policies
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_cancellation_policies_insert ON pms_cancellation_policies;
--> statement-breakpoint
CREATE POLICY pms_cancellation_policies_insert ON pms_cancellation_policies
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_cancellation_policies_update ON pms_cancellation_policies;
--> statement-breakpoint
CREATE POLICY pms_cancellation_policies_update ON pms_cancellation_policies
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

DROP POLICY IF EXISTS pms_cancellation_policies_delete ON pms_cancellation_policies;
--> statement-breakpoint
CREATE POLICY pms_cancellation_policies_delete ON pms_cancellation_policies
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
