-- Migration 0127: Membership Core Module
-- Creates 6 new tables for the membership management module
-- Extends membership_plans with Session 5 fields

-- ── membership_accounts ─────────────────────────────────────────
CREATE TABLE membership_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  account_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL,
  end_date DATE,
  primary_member_id TEXT NOT NULL,
  billing_email TEXT,
  billing_address_json JSONB,
  statement_day_of_month INTEGER DEFAULT 1,
  payment_terms_days INTEGER DEFAULT 30,
  autopay_enabled BOOLEAN NOT NULL DEFAULT false,
  credit_limit_cents BIGINT NOT NULL DEFAULT 0,
  hold_charging BOOLEAN NOT NULL DEFAULT false,
  billing_account_id TEXT,
  customer_id TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_membership_accounts_tenant_number ON membership_accounts(tenant_id, account_number);
CREATE INDEX idx_membership_accounts_tenant_status ON membership_accounts(tenant_id, status);
CREATE INDEX idx_membership_accounts_tenant_primary ON membership_accounts(tenant_id, primary_member_id);
CREATE INDEX idx_membership_accounts_tenant_customer ON membership_accounts(tenant_id, customer_id);

ALTER TABLE membership_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_accounts_select ON membership_accounts
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_accounts_insert ON membership_accounts
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_accounts_update ON membership_accounts
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_accounts_delete ON membership_accounts
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── membership_members ──────────────────────────────────────────
CREATE TABLE membership_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL REFERENCES membership_accounts(id),
  customer_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary',
  charge_privileges JSONB,
  member_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_members_tenant_account ON membership_members(tenant_id, membership_account_id);
CREATE INDEX idx_membership_members_tenant_customer ON membership_members(tenant_id, customer_id);
CREATE UNIQUE INDEX uq_membership_members_tenant_number ON membership_members(tenant_id, member_number) WHERE member_number IS NOT NULL;

ALTER TABLE membership_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_members FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_members_select ON membership_members
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_members_insert ON membership_members
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_members_update ON membership_members
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_members_delete ON membership_members
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── membership_classes ──────────────────────────────────────────
CREATE TABLE membership_classes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL REFERENCES membership_accounts(id),
  class_name TEXT NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  billed_through_date DATE,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_classes_tenant_account ON membership_classes(tenant_id, membership_account_id);

ALTER TABLE membership_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_classes FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_classes_select ON membership_classes
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_classes_insert ON membership_classes
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_classes_update ON membership_classes
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_classes_delete ON membership_classes
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── membership_billing_items ────────────────────────────────────
CREATE TABLE membership_billing_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL REFERENCES membership_accounts(id),
  class_id TEXT REFERENCES membership_classes(id),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  tax_rate_id TEXT,
  gl_revenue_account_id TEXT,
  gl_deferred_revenue_account_id TEXT,
  proration_enabled BOOLEAN NOT NULL DEFAULT false,
  seasonal_json JSONB,
  is_sub_member_item BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_billing_items_tenant_account ON membership_billing_items(tenant_id, membership_account_id);

ALTER TABLE membership_billing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_billing_items FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_billing_items_select ON membership_billing_items
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_billing_items_insert ON membership_billing_items
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_billing_items_update ON membership_billing_items
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_billing_items_delete ON membership_billing_items
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── membership_authorized_users ─────────────────────────────────
CREATE TABLE membership_authorized_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  membership_account_id TEXT NOT NULL REFERENCES membership_accounts(id),
  name TEXT NOT NULL,
  relationship TEXT,
  privileges_json JSONB,
  effective_date DATE,
  expiration_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_auth_users_tenant_account ON membership_authorized_users(tenant_id, membership_account_id);

ALTER TABLE membership_authorized_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_authorized_users FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_authorized_users_select ON membership_authorized_users
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_authorized_users_insert ON membership_authorized_users
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_authorized_users_update ON membership_authorized_users
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_authorized_users_delete ON membership_authorized_users
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── membership_accounting_settings ──────────────────────────────
CREATE TABLE membership_accounting_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  club_model TEXT NOT NULL DEFAULT 'for_profit',
  recognition_policy JSONB,
  default_dues_revenue_account_id TEXT,
  default_deferred_revenue_account_id TEXT,
  default_initiation_revenue_account_id TEXT,
  default_notes_receivable_account_id TEXT,
  default_interest_income_account_id TEXT,
  default_capital_contribution_account_id TEXT,
  default_bad_debt_account_id TEXT,
  default_late_fee_account_id TEXT,
  default_minimum_revenue_account_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_membership_accounting_settings_tenant ON membership_accounting_settings(tenant_id);

ALTER TABLE membership_accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_accounting_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_accounting_settings_select ON membership_accounting_settings
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_accounting_settings_insert ON membership_accounting_settings
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_accounting_settings_update ON membership_accounting_settings
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY membership_accounting_settings_delete ON membership_accounting_settings
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── Extend membership_plans with Session 5 fields ───────────────
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS dues_amount_cents INTEGER;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS billing_frequency TEXT DEFAULT 'monthly';
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS proration_policy TEXT DEFAULT 'daily';
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS min_months_commitment INTEGER;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS gl_dues_revenue_account_id TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS taxable BOOLEAN DEFAULT true;
