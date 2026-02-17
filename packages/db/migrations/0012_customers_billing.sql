-- Migration: 0012_customers_billing
-- Creates customers, customer_relationships, customer_identifiers, customer_activity_log,
-- membership_plans, late_fee_policies, billing_accounts, billing_account_members,
-- memberships, membership_billing_events, ar_transactions, ar_allocations,
-- statements, customer_privileges, pricing_tiers

-- ── customers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL DEFAULT 'person',
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  organization_name TEXT,
  display_name TEXT NOT NULL,
  notes TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  tax_exempt BOOLEAN NOT NULL DEFAULT false,
  tax_exempt_certificate_number TEXT,
  total_visits INTEGER NOT NULL DEFAULT 0,
  total_spend BIGINT NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE UNIQUE INDEX uq_customers_tenant_email ON customers(tenant_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX uq_customers_tenant_phone ON customers(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_tenant_display ON customers(tenant_id, display_name);
CREATE INDEX idx_customers_tenant_last_visit ON customers(tenant_id, last_visit_at DESC);
CREATE INDEX idx_customers_tenant_tags ON customers USING GIN (tags);

-- ── customer_relationships ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_relationships (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  parent_customer_id TEXT NOT NULL REFERENCES customers(id),
  child_customer_id TEXT NOT NULL REFERENCES customers(id),
  relationship_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crel_tenant_parent ON customer_relationships(tenant_id, parent_customer_id);
CREATE INDEX idx_crel_tenant_child ON customer_relationships(tenant_id, child_customer_id);
CREATE UNIQUE INDEX uq_crel_unique ON customer_relationships(tenant_id, parent_customer_id, child_customer_id, relationship_type);

-- ── customer_identifiers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_identifiers (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cident_tenant_customer ON customer_identifiers(tenant_id, customer_id);
CREATE UNIQUE INDEX uq_cident_tenant_type_value ON customer_identifiers(tenant_id, type, value);

-- ── customer_activity_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_activity_log (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX idx_cactivity_tenant_customer_created ON customer_activity_log(tenant_id, customer_id, created_at DESC);

-- ── membership_plans ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_plans (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  price_cents INTEGER NOT NULL,
  billing_enabled BOOLEAN NOT NULL DEFAULT true,
  privileges JSONB NOT NULL DEFAULT '[]',
  rules JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mplans_tenant_active ON membership_plans(tenant_id, is_active);

-- ── late_fee_policies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS late_fee_policies (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value NUMERIC(12,4) NOT NULL,
  grace_days INTEGER NOT NULL DEFAULT 0,
  max_fee_cents BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lfp_tenant ON late_fee_policies(tenant_id);

-- ── billing_accounts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  primary_customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'active',
  collection_status TEXT NOT NULL DEFAULT 'normal',
  credit_limit_cents BIGINT,
  current_balance_cents BIGINT NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  statement_day_of_month INTEGER,
  due_days INTEGER NOT NULL DEFAULT 30,
  late_fee_policy_id TEXT REFERENCES late_fee_policies(id),
  auto_pay_enabled BOOLEAN NOT NULL DEFAULT false,
  tax_exempt BOOLEAN NOT NULL DEFAULT false,
  tax_exempt_certificate_number TEXT,
  authorization_rules JSONB,
  billing_email TEXT,
  billing_contact_name TEXT,
  billing_address TEXT,
  gl_ar_account_code TEXT NOT NULL DEFAULT '1200',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ba_tenant_primary ON billing_accounts(tenant_id, primary_customer_id);
CREATE INDEX idx_ba_tenant_status ON billing_accounts(tenant_id, status);
CREATE INDEX idx_ba_tenant_collection ON billing_accounts(tenant_id, collection_status);

-- ── billing_account_members ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_account_members (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  billing_account_id TEXT NOT NULL REFERENCES billing_accounts(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  role TEXT NOT NULL,
  charge_allowed BOOLEAN NOT NULL DEFAULT true,
  spending_limit_cents BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bam_tenant_account ON billing_account_members(tenant_id, billing_account_id);
CREATE INDEX idx_bam_tenant_customer ON billing_account_members(tenant_id, customer_id);
CREATE UNIQUE INDEX uq_bam_tenant_account_customer ON billing_account_members(tenant_id, billing_account_id, customer_id);

-- ── memberships ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  plan_id TEXT NOT NULL REFERENCES membership_plans(id),
  billing_account_id TEXT NOT NULL REFERENCES billing_accounts(id),
  status TEXT NOT NULL DEFAULT 'pending',
  start_date DATE NOT NULL,
  end_date DATE,
  renewal_date DATE,
  cancel_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memberships_tenant_customer ON memberships(tenant_id, customer_id);
CREATE INDEX idx_memberships_tenant_billing ON memberships(tenant_id, billing_account_id);
CREATE INDEX idx_memberships_tenant_status ON memberships(tenant_id, status);
CREATE INDEX idx_memberships_tenant_renewal ON memberships(tenant_id, renewal_date);

-- ── membership_billing_events ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_billing_events (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  event_type TEXT NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  amount_cents INTEGER NOT NULL,
  ar_transaction_id TEXT,
  failure_reason TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mbe_tenant_membership_period ON membership_billing_events(tenant_id, membership_id, billing_period_start);
CREATE INDEX idx_mbe_tenant_type ON membership_billing_events(tenant_id, event_type);

-- ── ar_transactions (append-only) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ar_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  billing_account_id TEXT NOT NULL REFERENCES billing_accounts(id),
  type TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  due_date DATE,
  reference_type TEXT,
  reference_id TEXT,
  customer_id TEXT,
  gl_journal_entry_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_art_tenant_account_created ON ar_transactions(tenant_id, billing_account_id, created_at DESC);
CREATE INDEX idx_art_tenant_account_due ON ar_transactions(tenant_id, billing_account_id, due_date);
CREATE INDEX idx_art_tenant_type ON ar_transactions(tenant_id, type);
CREATE INDEX idx_art_ref ON ar_transactions(reference_type, reference_id);

-- ── ar_allocations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ar_allocations (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  payment_transaction_id TEXT NOT NULL REFERENCES ar_transactions(id),
  charge_transaction_id TEXT NOT NULL REFERENCES ar_transactions(id),
  amount_cents BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_aralloc_tenant_payment ON ar_allocations(tenant_id, payment_transaction_id);
CREATE INDEX idx_aralloc_tenant_charge ON ar_allocations(tenant_id, charge_transaction_id);
CREATE UNIQUE INDEX uq_aralloc_tenant_payment_charge ON ar_allocations(tenant_id, payment_transaction_id, charge_transaction_id);

-- ── statements ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statements (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  billing_account_id TEXT NOT NULL REFERENCES billing_accounts(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  opening_balance_cents BIGINT NOT NULL,
  charges_cents BIGINT NOT NULL,
  payments_cents BIGINT NOT NULL,
  late_fees_cents BIGINT NOT NULL DEFAULT 0,
  closing_balance_cents BIGINT NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stmts_tenant_account_period ON statements(tenant_id, billing_account_id, period_end DESC);
CREATE INDEX idx_stmts_tenant_status ON statements(tenant_id, status);
CREATE UNIQUE INDEX uq_stmts_tenant_account_period ON statements(tenant_id, billing_account_id, period_start, period_end);

-- ── customer_privileges ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_privileges (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  privilege_type TEXT NOT NULL,
  value JSONB NOT NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_cpriv_tenant_customer ON customer_privileges(tenant_id, customer_id);
CREATE INDEX idx_cpriv_tenant_customer_type ON customer_privileges(tenant_id, customer_id, privilege_type);

-- ── pricing_tiers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ptiers_tenant_name ON pricing_tiers(tenant_id, name);
CREATE INDEX idx_ptiers_tenant_default ON pricing_tiers(tenant_id, is_default);

-- ── RLS Policies ──────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_fee_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_privileges ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;

-- customers
CREATE POLICY customers_select ON customers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customers_insert ON customers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customers_update ON customers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customers_delete ON customers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_relationships
CREATE POLICY customer_relationships_select ON customer_relationships FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_relationships_insert ON customer_relationships FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_relationships_update ON customer_relationships FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_relationships_delete ON customer_relationships FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_identifiers
CREATE POLICY customer_identifiers_select ON customer_identifiers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_identifiers_insert ON customer_identifiers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_identifiers_update ON customer_identifiers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_identifiers_delete ON customer_identifiers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_activity_log
CREATE POLICY customer_activity_log_select ON customer_activity_log FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_activity_log_insert ON customer_activity_log FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_activity_log_update ON customer_activity_log FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_activity_log_delete ON customer_activity_log FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- membership_plans
CREATE POLICY membership_plans_select ON membership_plans FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plans_insert ON membership_plans FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plans_update ON membership_plans FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plans_delete ON membership_plans FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- late_fee_policies
CREATE POLICY late_fee_policies_select ON late_fee_policies FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY late_fee_policies_insert ON late_fee_policies FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY late_fee_policies_update ON late_fee_policies FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY late_fee_policies_delete ON late_fee_policies FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- billing_accounts
CREATE POLICY billing_accounts_select ON billing_accounts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY billing_accounts_insert ON billing_accounts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY billing_accounts_update ON billing_accounts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY billing_accounts_delete ON billing_accounts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- billing_account_members
CREATE POLICY billing_account_members_select ON billing_account_members FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY billing_account_members_insert ON billing_account_members FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY billing_account_members_update ON billing_account_members FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY billing_account_members_delete ON billing_account_members FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- memberships
CREATE POLICY memberships_select ON memberships FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY memberships_insert ON memberships FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY memberships_update ON memberships FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY memberships_delete ON memberships FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- membership_billing_events
CREATE POLICY membership_billing_events_select ON membership_billing_events FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_billing_events_insert ON membership_billing_events FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_billing_events_update ON membership_billing_events FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_billing_events_delete ON membership_billing_events FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ar_transactions
CREATE POLICY ar_transactions_select ON ar_transactions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_transactions_insert ON ar_transactions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_transactions_update ON ar_transactions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_transactions_delete ON ar_transactions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ar_allocations
CREATE POLICY ar_allocations_select ON ar_allocations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_allocations_insert ON ar_allocations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_allocations_update ON ar_allocations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ar_allocations_delete ON ar_allocations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- statements
CREATE POLICY statements_select ON statements FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY statements_insert ON statements FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY statements_update ON statements FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY statements_delete ON statements FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_privileges
CREATE POLICY customer_privileges_select ON customer_privileges FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_privileges_insert ON customer_privileges FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_privileges_update ON customer_privileges FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_privileges_delete ON customer_privileges FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- pricing_tiers
CREATE POLICY pricing_tiers_select ON pricing_tiers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pricing_tiers_insert ON pricing_tiers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pricing_tiers_update ON pricing_tiers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pricing_tiers_delete ON pricing_tiers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
