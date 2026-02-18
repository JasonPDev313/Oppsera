-- Migration: 0021_management_co_departments
-- Management Company and Departments domain tables

-- ══════════════════════════════════════════════════════════════════
-- MANAGEMENT COMPANY DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── management_companies ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS management_companies (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  name                  TEXT NOT NULL,
  has_common_gift_cards BOOLEAN DEFAULT false,
  has_common_customer   BOOLEAN DEFAULT false,
  hq_location_id        TEXT REFERENCES locations(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_management_companies_tenant ON management_companies (tenant_id);

ALTER TABLE management_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY management_companies_select ON management_companies FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_companies_insert ON management_companies FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_companies_update ON management_companies FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_companies_delete ON management_companies FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── management_company_locations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS management_company_locations (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  management_company_id TEXT NOT NULL REFERENCES management_companies(id),
  location_id           TEXT NOT NULL REFERENCES locations(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mgmt_co_locations_tenant_company_location
  ON management_company_locations (tenant_id, management_company_id, location_id);

ALTER TABLE management_company_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY management_company_locations_select ON management_company_locations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_locations_insert ON management_company_locations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_locations_update ON management_company_locations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_locations_delete ON management_company_locations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── management_company_sub_groups ─────────────────────────────────
CREATE TABLE IF NOT EXISTS management_company_sub_groups (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  management_company_id TEXT NOT NULL REFERENCES management_companies(id),
  name                  TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mgmt_co_sub_groups_tenant_company
  ON management_company_sub_groups (tenant_id, management_company_id);

ALTER TABLE management_company_sub_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY management_company_sub_groups_select ON management_company_sub_groups FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_sub_groups_insert ON management_company_sub_groups FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_sub_groups_update ON management_company_sub_groups FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_sub_groups_delete ON management_company_sub_groups FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── management_company_sub_group_locations ────────────────────────
CREATE TABLE IF NOT EXISTS management_company_sub_group_locations (
  id             TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  sub_group_id   TEXT NOT NULL REFERENCES management_company_sub_groups(id),
  location_id    TEXT NOT NULL REFERENCES locations(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mgmt_co_sub_group_locations_tenant_group_location
  ON management_company_sub_group_locations (tenant_id, sub_group_id, location_id);

ALTER TABLE management_company_sub_group_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY management_company_sub_group_locations_select ON management_company_sub_group_locations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_sub_group_locations_insert ON management_company_sub_group_locations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_sub_group_locations_update ON management_company_sub_group_locations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY management_company_sub_group_locations_delete ON management_company_sub_group_locations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- DEPARTMENTS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── departments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_tenant_name ON departments (tenant_id, name);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_select ON departments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY departments_insert ON departments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY departments_update ON departments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY departments_delete ON departments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── department_settings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS department_settings (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  department_id   TEXT NOT NULL REFERENCES departments(id),
  setting_key     TEXT NOT NULL,
  setting_value   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_department_settings_tenant_dept_key
  ON department_settings (tenant_id, department_id, setting_key);

ALTER TABLE department_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_settings_select ON department_settings FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY department_settings_insert ON department_settings FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY department_settings_update ON department_settings FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY department_settings_delete ON department_settings FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── accounting_sources ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_sources (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_sources_tenant_name ON accounting_sources (tenant_id, name);

ALTER TABLE accounting_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_sources_select ON accounting_sources FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY accounting_sources_insert ON accounting_sources FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY accounting_sources_update ON accounting_sources FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY accounting_sources_delete ON accounting_sources FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── chart_of_account_classifications ──────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_account_classifications (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coa_classifications_tenant_code
  ON chart_of_account_classifications (tenant_id, code);

ALTER TABLE chart_of_account_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY chart_of_account_classifications_select ON chart_of_account_classifications FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY chart_of_account_classifications_insert ON chart_of_account_classifications FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY chart_of_account_classifications_update ON chart_of_account_classifications FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY chart_of_account_classifications_delete ON chart_of_account_classifications FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── chart_of_account_associations ─────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_account_associations (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  entity_id           TEXT NOT NULL,
  entity_type         TEXT NOT NULL,
  entity_title        TEXT,
  chart_of_account_id TEXT NOT NULL,
  classification_id   TEXT REFERENCES chart_of_account_classifications(id),
  is_quickbook_sync   BOOLEAN NOT NULL DEFAULT false,
  account_type        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coa_associations_tenant_entity
  ON chart_of_account_associations (tenant_id, entity_type, entity_id);

ALTER TABLE chart_of_account_associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY chart_of_account_associations_select ON chart_of_account_associations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY chart_of_account_associations_insert ON chart_of_account_associations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY chart_of_account_associations_update ON chart_of_account_associations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY chart_of_account_associations_delete ON chart_of_account_associations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── journal_entry_configurations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_configurations (
  id                         TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                  TEXT NOT NULL REFERENCES tenants(id),
  entity_id                  TEXT NOT NULL,
  entity_type                TEXT NOT NULL,
  debit_chart_of_account_id  TEXT,
  credit_chart_of_account_id TEXT,
  classification_id          TEXT REFERENCES chart_of_account_classifications(id),
  vendor_id                  TEXT,
  memo                       TEXT,
  use_item_cost              BOOLEAN NOT NULL DEFAULT false,
  terminal_location_id       TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_configs_tenant_entity
  ON journal_entry_configurations (tenant_id, entity_type, entity_id);

ALTER TABLE journal_entry_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entry_configurations_select ON journal_entry_configurations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY journal_entry_configurations_insert ON journal_entry_configurations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY journal_entry_configurations_update ON journal_entry_configurations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY journal_entry_configurations_delete ON journal_entry_configurations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
