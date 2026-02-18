-- Migration: 0035_vouchers_minimum_spend
-- Vouchers domain: voucher types, vouchers, ledger entries, department restrictions,
-- deposits, expiration income, type department restrictions, type management groups
-- Minimum spend domain: rules, rule departments, charges, ledger

-- ══════════════════════════════════════════════════════════════════
-- VOUCHERS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── voucher_types ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voucher_types (
  id                                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                             TEXT NOT NULL REFERENCES tenants(id),
  name                                  TEXT NOT NULL,
  voucher_type                          TEXT NOT NULL DEFAULT 'gift_card',
  liability_chart_of_account_id         TEXT,
  expiration_income_chart_of_account_id TEXT,
  available_online                      BOOLEAN NOT NULL DEFAULT false,
  available_for_pos_sale                BOOLEAN NOT NULL DEFAULT false,
  available_for_pos_sale_specific_roles BOOLEAN NOT NULL DEFAULT false,
  expiration_strategy                   JSONB,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_types_tenant_name
  ON voucher_types (tenant_id, name);

ALTER TABLE voucher_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY voucher_types_select ON voucher_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_types_insert ON voucher_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_types_update ON voucher_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_types_delete ON voucher_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── vouchers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vouchers (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  voucher_type_id       TEXT REFERENCES voucher_types(id),
  voucher_number        TEXT NOT NULL,
  voucher_number_type   TEXT,
  voucher_amount_cents  INTEGER NOT NULL,
  redeemed_amount_cents INTEGER NOT NULL DEFAULT 0,
  redemption_status     TEXT NOT NULL DEFAULT 'unredeemed',
  validity_start_date   DATE,
  validity_end_date     DATE,
  customer_id           TEXT,
  first_name            TEXT,
  last_name             TEXT,
  notes                 TEXT,
  order_id              TEXT,
  refund_order_id       TEXT,
  tax_cents             INTEGER NOT NULL DEFAULT 0,
  total_cents           INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vouchers_tenant_number
  ON vouchers (tenant_id, voucher_number);

CREATE INDEX IF NOT EXISTS idx_vouchers_tenant_customer
  ON vouchers (tenant_id, customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY vouchers_select ON vouchers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY vouchers_insert ON vouchers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY vouchers_update ON vouchers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY vouchers_delete ON vouchers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── voucher_ledger_entries ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS voucher_ledger_entries (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  voucher_id    TEXT NOT NULL REFERENCES vouchers(id),
  tender_id     TEXT,
  description   TEXT,
  balance_cents INTEGER NOT NULL,
  amount_cents  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voucher_ledger_entries_tenant_voucher
  ON voucher_ledger_entries (tenant_id, voucher_id);

ALTER TABLE voucher_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY voucher_ledger_entries_select ON voucher_ledger_entries FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_ledger_entries_insert ON voucher_ledger_entries FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_ledger_entries_update ON voucher_ledger_entries FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_ledger_entries_delete ON voucher_ledger_entries FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── voucher_department_restrictions ─────────────────────────────
CREATE TABLE IF NOT EXISTS voucher_department_restrictions (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  voucher_id    TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_dept_restrictions_tenant_voucher_dept
  ON voucher_department_restrictions (tenant_id, voucher_id, department_id);

ALTER TABLE voucher_department_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY voucher_department_restrictions_select ON voucher_department_restrictions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_department_restrictions_insert ON voucher_department_restrictions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_department_restrictions_update ON voucher_department_restrictions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_department_restrictions_delete ON voucher_department_restrictions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── voucher_deposits ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voucher_deposits (
  id                   TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  voucher_id           TEXT NOT NULL REFERENCES vouchers(id),
  order_id             TEXT,
  payment_amount_cents INTEGER NOT NULL,
  deposit_amount_cents INTEGER NOT NULL,
  discount_cents       INTEGER NOT NULL DEFAULT 0,
  order_line_id        TEXT,
  tender_id            TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voucher_deposits_tenant_voucher
  ON voucher_deposits (tenant_id, voucher_id);

ALTER TABLE voucher_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY voucher_deposits_select ON voucher_deposits FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_deposits_insert ON voucher_deposits FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_deposits_update ON voucher_deposits FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_deposits_delete ON voucher_deposits FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── voucher_expiration_income ───────────────────────────────────
CREATE TABLE IF NOT EXISTS voucher_expiration_income (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  voucher_id              TEXT NOT NULL REFERENCES vouchers(id),
  voucher_number          TEXT,
  expiration_date         DATE NOT NULL,
  expiration_amount_cents INTEGER NOT NULL,
  order_line_id           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voucher_expiration_income_tenant_voucher
  ON voucher_expiration_income (tenant_id, voucher_id);

ALTER TABLE voucher_expiration_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY voucher_expiration_income_select ON voucher_expiration_income FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_expiration_income_insert ON voucher_expiration_income FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_expiration_income_update ON voucher_expiration_income FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_expiration_income_delete ON voucher_expiration_income FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── voucher_type_department_restrictions ─────────────────────────
CREATE TABLE IF NOT EXISTS voucher_type_department_restrictions (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  voucher_type_id TEXT NOT NULL REFERENCES voucher_types(id) ON DELETE CASCADE,
  department_id   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_type_dept_restrictions_tenant_type_dept
  ON voucher_type_department_restrictions (tenant_id, voucher_type_id, department_id);

ALTER TABLE voucher_type_department_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY voucher_type_department_restrictions_select ON voucher_type_department_restrictions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_type_department_restrictions_insert ON voucher_type_department_restrictions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_type_department_restrictions_update ON voucher_type_department_restrictions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_type_department_restrictions_delete ON voucher_type_department_restrictions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── voucher_type_management_groups ──────────────────────────────
CREATE TABLE IF NOT EXISTS voucher_type_management_groups (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  voucher_type_id       TEXT NOT NULL REFERENCES voucher_types(id) ON DELETE CASCADE,
  management_company_id TEXT,
  sub_group_id          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voucher_type_mgmt_groups_tenant_type
  ON voucher_type_management_groups (tenant_id, voucher_type_id);

ALTER TABLE voucher_type_management_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY voucher_type_management_groups_select ON voucher_type_management_groups FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_type_management_groups_insert ON voucher_type_management_groups FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_type_management_groups_update ON voucher_type_management_groups FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY voucher_type_management_groups_delete ON voucher_type_management_groups FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- MINIMUM SPEND DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── minimum_spend_rules ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS minimum_spend_rules (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  title               TEXT NOT NULL,
  membership_plan_id  TEXT,
  amount_cents        INTEGER NOT NULL,
  frequency_id        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minimum_spend_rules_tenant
  ON minimum_spend_rules (tenant_id);

ALTER TABLE minimum_spend_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY minimum_spend_rules_select ON minimum_spend_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_rules_insert ON minimum_spend_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_rules_update ON minimum_spend_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_rules_delete ON minimum_spend_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── minimum_spend_rule_departments ──────────────────────────────
CREATE TABLE IF NOT EXISTS minimum_spend_rule_departments (
  id                     TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  minimum_spend_rule_id  TEXT NOT NULL REFERENCES minimum_spend_rules(id) ON DELETE CASCADE,
  department_id          TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_min_spend_rule_depts_tenant_rule_dept
  ON minimum_spend_rule_departments (tenant_id, minimum_spend_rule_id, department_id);

ALTER TABLE minimum_spend_rule_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY minimum_spend_rule_departments_select ON minimum_spend_rule_departments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_rule_departments_insert ON minimum_spend_rule_departments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_rule_departments_update ON minimum_spend_rule_departments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_rule_departments_delete ON minimum_spend_rule_departments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── minimum_spend_charges ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS minimum_spend_charges (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  customer_id                     TEXT NOT NULL,
  order_line_id                   TEXT,
  customer_minimum_spend_rule_id  TEXT,
  rule_amount_cents               INTEGER NOT NULL,
  spent_amount_cents              INTEGER NOT NULL DEFAULT 0,
  charge_amount_cents             INTEGER NOT NULL,
  from_date                       DATE,
  to_date                         DATE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minimum_spend_charges_tenant_customer
  ON minimum_spend_charges (tenant_id, customer_id);

ALTER TABLE minimum_spend_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY minimum_spend_charges_select ON minimum_spend_charges FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_charges_insert ON minimum_spend_charges FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_charges_update ON minimum_spend_charges FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_charges_delete ON minimum_spend_charges FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── minimum_spend_ledger ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS minimum_spend_ledger (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  customer_minimum_spend_rule_id  TEXT NOT NULL,
  order_id                        TEXT,
  department_id                   TEXT,
  description                     TEXT,
  balance_cents                   INTEGER NOT NULL,
  amount_cents                    INTEGER NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minimum_spend_ledger_tenant_rule
  ON minimum_spend_ledger (tenant_id, customer_minimum_spend_rule_id);

ALTER TABLE minimum_spend_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY minimum_spend_ledger_select ON minimum_spend_ledger FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_ledger_insert ON minimum_spend_ledger FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_ledger_update ON minimum_spend_ledger FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY minimum_spend_ledger_delete ON minimum_spend_ledger FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
