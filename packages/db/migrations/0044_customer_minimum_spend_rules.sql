-- Migration: 0044_customer_minimum_spend_rules
-- Fixes CRITICAL dangling FK: minimum_spend_charges and minimum_spend_ledger
-- both reference customer_minimum_spend_rule_id but the parent table was never created.
-- This is a per-customer assignment linking a customer to a minimum_spend_rule.

-- ══════════════════════════════════════════════════════════════════
-- CUSTOMER_GAPS DOMAIN — MISSING TABLES
-- ══════════════════════════════════════════════════════════════════

-- ── customer_minimum_spend_rules ──────────────────────────────────
-- Per-customer assignment of a minimum spend rule (template is minimum_spend_rules)
CREATE TABLE IF NOT EXISTS customer_minimum_spend_rules (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  customer_id             TEXT NOT NULL,
  minimum_spend_rule_id   TEXT NOT NULL REFERENCES minimum_spend_rules(id),
  start_date              DATE,
  end_date                DATE,
  status                  TEXT NOT NULL DEFAULT 'active',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_min_spend_rules_tenant_customer
  ON customer_minimum_spend_rules (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_min_spend_rules_tenant_rule
  ON customer_minimum_spend_rules (tenant_id, minimum_spend_rule_id);

ALTER TABLE customer_minimum_spend_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_minimum_spend_rules_select ON customer_minimum_spend_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_minimum_spend_rules_insert ON customer_minimum_spend_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_minimum_spend_rules_update ON customer_minimum_spend_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_minimum_spend_rules_delete ON customer_minimum_spend_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));


-- ── customer_minimum_spend_rule_departments ───────────────────────
-- Departments that count toward a customer's minimum spend obligation
CREATE TABLE IF NOT EXISTS customer_minimum_spend_rule_departments (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  customer_minimum_spend_rule_id  TEXT NOT NULL REFERENCES customer_minimum_spend_rules(id) ON DELETE CASCADE,
  department_id                   TEXT NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_min_spend_rule_depts_tenant_rule_dept
  ON customer_minimum_spend_rule_departments (tenant_id, customer_minimum_spend_rule_id, department_id);

ALTER TABLE customer_minimum_spend_rule_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_minimum_spend_rule_departments_select ON customer_minimum_spend_rule_departments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_minimum_spend_rule_departments_insert ON customer_minimum_spend_rule_departments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_minimum_spend_rule_departments_update ON customer_minimum_spend_rule_departments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_minimum_spend_rule_departments_delete ON customer_minimum_spend_rule_departments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
