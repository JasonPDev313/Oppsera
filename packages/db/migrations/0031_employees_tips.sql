-- Migration: 0031_employees_tips
-- Employees domain: time entries, payroll configurations, tip ledger, tip sharing rules, food commissions
-- Also adds employee-specific columns to users table

-- ══════════════════════════════════════════════════════════════════
-- EMPLOYEES DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── employee_time_entries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_time_entries (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  employee_id       TEXT NOT NULL,
  role_id           TEXT,
  clock_in_time     TIMESTAMPTZ NOT NULL,
  clock_out_time    TIMESTAMPTZ,
  clock_in_source   TEXT NOT NULL DEFAULT 'manual',
  clock_out_source  TEXT,
  approval_status   TEXT NOT NULL DEFAULT 'pending',
  admin_comment     TEXT,
  comment           TEXT,
  cash_tip_cents    INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_time_entries_tenant_employee_clockin
  ON employee_time_entries (tenant_id, employee_id, clock_in_time);

ALTER TABLE employee_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_time_entries_select ON employee_time_entries FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY employee_time_entries_insert ON employee_time_entries FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY employee_time_entries_update ON employee_time_entries FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY employee_time_entries_delete ON employee_time_entries FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── payroll_configurations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_configurations (
  id                                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                         TEXT NOT NULL REFERENCES tenants(id),
  payroll_period                    TEXT NOT NULL DEFAULT 'biweekly',
  week_start_day                    INTEGER NOT NULL DEFAULT 1,
  next_payroll_start_date           DATE,
  first_day_of_1st_pay_period       INTEGER,
  first_day_of_2nd_pay_period       INTEGER,
  overtime_enabled                  BOOLEAN NOT NULL DEFAULT false,
  daily_overtime_enabled            BOOLEAN NOT NULL DEFAULT false,
  daily_double_overtime_enabled     BOOLEAN NOT NULL DEFAULT false,
  weekly_overtime_after_hours       NUMERIC(5,2),
  daily_overtime_after_hours        NUMERIC(5,2),
  daily_double_overtime_after_hours NUMERIC(5,2),
  payroll_day_end_closing_time      TIME,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_configurations_tenant
  ON payroll_configurations (tenant_id);

ALTER TABLE payroll_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_configurations_select ON payroll_configurations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY payroll_configurations_insert ON payroll_configurations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY payroll_configurations_update ON payroll_configurations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY payroll_configurations_delete ON payroll_configurations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tip_ledger_entries ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tip_ledger_entries (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  employee_id     TEXT NOT NULL,
  description     TEXT,
  entity_id       TEXT,
  entity_type     TEXT,
  amount_cents    INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tip_ledger_entries_tenant_employee_created
  ON tip_ledger_entries (tenant_id, employee_id, created_at);

ALTER TABLE tip_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tip_ledger_entries_select ON tip_ledger_entries FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tip_ledger_entries_insert ON tip_ledger_entries FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tip_ledger_entries_update ON tip_ledger_entries FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tip_ledger_entries_delete ON tip_ledger_entries FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tip_sharing_rules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tip_sharing_rules (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  from_employee_id  TEXT NOT NULL,
  to_employee_id    TEXT NOT NULL,
  percentage        NUMERIC(5,2),
  amount_cents      INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tip_sharing_rules_tenant_from_employee
  ON tip_sharing_rules (tenant_id, from_employee_id);

ALTER TABLE tip_sharing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tip_sharing_rules_select ON tip_sharing_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tip_sharing_rules_insert ON tip_sharing_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tip_sharing_rules_update ON tip_sharing_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tip_sharing_rules_delete ON tip_sharing_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── food_commissions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS food_commissions (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  course_id               TEXT NOT NULL,
  category_id             TEXT NOT NULL,
  commission_percentage   NUMERIC(5,2) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_food_commissions_tenant_course_category
  ON food_commissions (tenant_id, course_id, category_id);

ALTER TABLE food_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY food_commissions_select ON food_commissions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY food_commissions_insert ON food_commissions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY food_commissions_update ON food_commissions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY food_commissions_delete ON food_commissions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- ALTER TABLE — Add employee columns to users
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pos_pin TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS override_pin TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_color TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_payroll_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
