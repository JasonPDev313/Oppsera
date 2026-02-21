-- Migration: 0072_accounting_mappings
-- GL mapping defaults for sub-departments, payment types, tax groups + bank accounts.

-- ── Sub-Department GL Defaults ────────────────────────────────────

CREATE TABLE IF NOT EXISTS sub_department_gl_defaults (
  tenant_id                TEXT NOT NULL,
  sub_department_id        TEXT NOT NULL,
  revenue_account_id       TEXT REFERENCES gl_accounts(id),
  cogs_account_id          TEXT REFERENCES gl_accounts(id),
  inventory_asset_account_id TEXT REFERENCES gl_accounts(id),
  discount_account_id      TEXT REFERENCES gl_accounts(id),
  returns_account_id       TEXT REFERENCES gl_accounts(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, sub_department_id)
);

ALTER TABLE sub_department_gl_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_department_gl_defaults FORCE ROW LEVEL SECURITY;

CREATE POLICY sub_department_gl_defaults_select ON sub_department_gl_defaults FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY sub_department_gl_defaults_insert ON sub_department_gl_defaults FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY sub_department_gl_defaults_update ON sub_department_gl_defaults FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Payment Type GL Defaults ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_type_gl_defaults (
  tenant_id                TEXT NOT NULL,
  payment_type_id          TEXT NOT NULL,
  cash_account_id          TEXT REFERENCES gl_accounts(id),
  clearing_account_id      TEXT REFERENCES gl_accounts(id),
  fee_expense_account_id   TEXT REFERENCES gl_accounts(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, payment_type_id)
);

ALTER TABLE payment_type_gl_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_type_gl_defaults FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_type_gl_defaults_select ON payment_type_gl_defaults FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY payment_type_gl_defaults_insert ON payment_type_gl_defaults FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY payment_type_gl_defaults_update ON payment_type_gl_defaults FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Tax Group GL Defaults ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_group_gl_defaults (
  tenant_id                TEXT NOT NULL,
  tax_group_id             TEXT NOT NULL,
  tax_payable_account_id   TEXT REFERENCES gl_accounts(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, tax_group_id)
);

ALTER TABLE tax_group_gl_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_group_gl_defaults FORCE ROW LEVEL SECURITY;

CREATE POLICY tax_group_gl_defaults_select ON tax_group_gl_defaults FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tax_group_gl_defaults_insert ON tax_group_gl_defaults FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tax_group_gl_defaults_update ON tax_group_gl_defaults FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Bank Accounts ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_accounts (
  id                       TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                TEXT NOT NULL REFERENCES tenants(id),
  name                     TEXT NOT NULL,
  gl_account_id            TEXT NOT NULL REFERENCES gl_accounts(id),
  account_number_last4     TEXT,
  bank_name                TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  is_default               BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_accounts_tenant_gl_account
  ON bank_accounts (tenant_id, gl_account_id);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant_active
  ON bank_accounts (tenant_id, is_active);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY bank_accounts_select ON bank_accounts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY bank_accounts_insert ON bank_accounts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY bank_accounts_update ON bank_accounts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY bank_accounts_delete ON bank_accounts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
