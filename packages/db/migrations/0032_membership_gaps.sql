-- Migration: 0032_membership_gaps
-- Membership gaps domain: membership_groups, membership_group_sitters,
-- membership_plan_billing_schedules, membership_plan_sale_strategies,
-- membership_plan_discount_rules, membership_plan_courses, membership_rules,
-- membership_rule_plan_types, membership_rule_schedules, membership_plan_tee_pricing,
-- membership_recurring_billing_items, membership_recurring_billing_order_lines
-- Also adds columns to existing membership_plans table

-- ══════════════════════════════════════════════════════════════════
-- Part 1: ALTER membership_plans table — add gap columns
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS tax_group_id TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS process_fee_rate NUMERIC;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS process_fee_amount_cents INTEGER;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS enable_online_sale BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS tee_sheet_color TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS prorate_on_sale BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS max_assignments INTEGER;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS expiration_strategy JSONB;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS eligible_for_loyalty BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS eligible_for_awards BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS awards_percentage NUMERIC;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS display_sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS account_type TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS require_cc_for_tee_reservations TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS require_cc_for_activity_reservations TEXT;

-- ══════════════════════════════════════════════════════════════════
-- Part 2: New tables
-- ══════════════════════════════════════════════════════════════════

-- ── membership_groups ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_groups (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  primary_membership_id   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_groups_tenant_primary
  ON membership_groups (tenant_id, primary_membership_id)
  WHERE primary_membership_id IS NOT NULL;

ALTER TABLE membership_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_groups_select ON membership_groups FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_groups_insert ON membership_groups FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_groups_update ON membership_groups FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_groups_delete ON membership_groups FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_group_sitters ────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_group_sitters (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  membership_group_id     TEXT NOT NULL REFERENCES membership_groups(id) ON DELETE CASCADE,
  first_name              TEXT NOT NULL,
  last_name               TEXT,
  date_of_birth           DATE,
  gender                  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_group_sitters_tenant_group
  ON membership_group_sitters (tenant_id, membership_group_id);

ALTER TABLE membership_group_sitters ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_group_sitters_select ON membership_group_sitters FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_group_sitters_insert ON membership_group_sitters FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_group_sitters_update ON membership_group_sitters FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_group_sitters_delete ON membership_group_sitters FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_plan_billing_schedules ───────────────────────────
CREATE TABLE IF NOT EXISTS membership_plan_billing_schedules (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  membership_plan_id      TEXT NOT NULL,
  jan                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  feb                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  mar                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  apr                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  may                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  jun                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  jul                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  aug                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  sep                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  oct                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  nov                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  dec                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_plan_billing_schedules_tenant_plan
  ON membership_plan_billing_schedules (tenant_id, membership_plan_id);

ALTER TABLE membership_plan_billing_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_plan_billing_schedules_select ON membership_plan_billing_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_billing_schedules_insert ON membership_plan_billing_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_billing_schedules_update ON membership_plan_billing_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_billing_schedules_delete ON membership_plan_billing_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_plan_sale_strategies ─────────────────────────────
CREATE TABLE IF NOT EXISTS membership_plan_sale_strategies (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  membership_plan_id        TEXT NOT NULL,
  title                     TEXT NOT NULL,
  due_amount_cents          INTEGER,
  process_fee_rate          NUMERIC(5,4),
  process_fee_amount_cents  INTEGER,
  sub_member_limit          INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_plan_sale_strategies_tenant_plan
  ON membership_plan_sale_strategies (tenant_id, membership_plan_id);

ALTER TABLE membership_plan_sale_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_plan_sale_strategies_select ON membership_plan_sale_strategies FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_sale_strategies_insert ON membership_plan_sale_strategies FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_sale_strategies_update ON membership_plan_sale_strategies FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_sale_strategies_delete ON membership_plan_sale_strategies FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_plan_discount_rules ──────────────────────────────
CREATE TABLE IF NOT EXISTS membership_plan_discount_rules (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  membership_plan_id      TEXT NOT NULL,
  department_id           TEXT NOT NULL,
  sub_department_id       TEXT,
  discount_percentage     NUMERIC(5,2) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_plan_discount_rules_tenant_plan
  ON membership_plan_discount_rules (tenant_id, membership_plan_id);

ALTER TABLE membership_plan_discount_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_plan_discount_rules_select ON membership_plan_discount_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_discount_rules_insert ON membership_plan_discount_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_discount_rules_update ON membership_plan_discount_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_discount_rules_delete ON membership_plan_discount_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_plan_courses ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_plan_courses (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  membership_plan_id      TEXT NOT NULL,
  course_id               TEXT NOT NULL,
  is_archived             BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_plan_courses_tenant_plan_course
  ON membership_plan_courses (tenant_id, membership_plan_id, course_id);

ALTER TABLE membership_plan_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_plan_courses_select ON membership_plan_courses FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_courses_insert ON membership_plan_courses FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_courses_update ON membership_plan_courses FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_courses_delete ON membership_plan_courses FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_rules ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_rules (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  course_id                       TEXT NOT NULL,
  membership_plan_id              TEXT,
  title                           TEXT NOT NULL,
  start_date                      DATE,
  end_date                        DATE,
  start_time                      TIME,
  end_time                        TIME,
  rate_cents                      INTEGER,
  occupancy                       NUMERIC(5,2),
  class_capacity                  INTEGER,
  duration_minutes                INTEGER,
  holes                           INTEGER,
  includes_cart                   BOOLEAN NOT NULL DEFAULT false,
  monday                          BOOLEAN NOT NULL DEFAULT false,
  tuesday                         BOOLEAN NOT NULL DEFAULT false,
  wednesday                       BOOLEAN NOT NULL DEFAULT false,
  thursday                        BOOLEAN NOT NULL DEFAULT false,
  friday                          BOOLEAN NOT NULL DEFAULT false,
  saturday                        BOOLEAN NOT NULL DEFAULT false,
  sunday                          BOOLEAN NOT NULL DEFAULT false,
  is_active                       BOOLEAN NOT NULL DEFAULT true,
  available_online                BOOLEAN NOT NULL DEFAULT false,
  display_sequence                INTEGER NOT NULL DEFAULT 0,
  reservation_resource_type_id    TEXT,
  catalog_item_id                 TEXT,
  booking_window_days             INTEGER,
  online_booking_window_days      INTEGER,
  is_guest_rate                   BOOLEAN NOT NULL DEFAULT false,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_rules_tenant_course_active
  ON membership_rules (tenant_id, course_id, is_active);

ALTER TABLE membership_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_rules_select ON membership_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rules_insert ON membership_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rules_update ON membership_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rules_delete ON membership_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_rule_plan_types ──────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_rule_plan_types (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  membership_rule_id      TEXT NOT NULL REFERENCES membership_rules(id) ON DELETE CASCADE,
  membership_plan_id      TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_rule_plan_types_tenant_rule_plan
  ON membership_rule_plan_types (tenant_id, membership_rule_id, membership_plan_id);

ALTER TABLE membership_rule_plan_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_rule_plan_types_select ON membership_rule_plan_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rule_plan_types_insert ON membership_rule_plan_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rule_plan_types_update ON membership_rule_plan_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rule_plan_types_delete ON membership_rule_plan_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_rule_schedules ───────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_rule_schedules (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  course_id               TEXT NOT NULL,
  membership_rule_id      TEXT NOT NULL REFERENCES membership_rules(id) ON DELETE CASCADE,
  rate_cents              INTEGER,
  monday                  BOOLEAN NOT NULL DEFAULT false,
  tuesday                 BOOLEAN NOT NULL DEFAULT false,
  wednesday               BOOLEAN NOT NULL DEFAULT false,
  thursday                BOOLEAN NOT NULL DEFAULT false,
  friday                  BOOLEAN NOT NULL DEFAULT false,
  saturday                BOOLEAN NOT NULL DEFAULT false,
  sunday                  BOOLEAN NOT NULL DEFAULT false,
  start_date              DATE,
  end_date                DATE,
  start_time              TIME,
  end_time                TIME,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_rule_schedules_tenant_rule
  ON membership_rule_schedules (tenant_id, membership_rule_id);

ALTER TABLE membership_rule_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_rule_schedules_select ON membership_rule_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rule_schedules_insert ON membership_rule_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rule_schedules_update ON membership_rule_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_rule_schedules_delete ON membership_rule_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_plan_tee_pricing ─────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_plan_tee_pricing (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  membership_plan_id      TEXT NOT NULL,
  tee_pricing_plan_id     TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_plan_tee_pricing_tenant_plan_tee
  ON membership_plan_tee_pricing (tenant_id, membership_plan_id, tee_pricing_plan_id);

ALTER TABLE membership_plan_tee_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_plan_tee_pricing_select ON membership_plan_tee_pricing FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_tee_pricing_insert ON membership_plan_tee_pricing FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_tee_pricing_update ON membership_plan_tee_pricing FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_plan_tee_pricing_delete ON membership_plan_tee_pricing FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_recurring_billing_items ──────────────────────────
CREATE TABLE IF NOT EXISTS membership_recurring_billing_items (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  customer_membership_id    TEXT NOT NULL,
  title                     TEXT NOT NULL,
  amount_cents              INTEGER NOT NULL,
  discount_cents            INTEGER NOT NULL DEFAULT 0,
  frequency                 INTEGER NOT NULL DEFAULT 1,
  frequency_type            TEXT NOT NULL DEFAULT 'monthly',
  notes                     TEXT,
  is_valid                  BOOLEAN NOT NULL DEFAULT true,
  tax_group_id              TEXT,
  process_fee_amount_cents  INTEGER NOT NULL DEFAULT 0,
  sub_member_limit          INTEGER,
  sale_strategy_id          TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_recurring_billing_items_tenant_membership
  ON membership_recurring_billing_items (tenant_id, customer_membership_id);

ALTER TABLE membership_recurring_billing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_recurring_billing_items_select ON membership_recurring_billing_items FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_recurring_billing_items_insert ON membership_recurring_billing_items FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_recurring_billing_items_update ON membership_recurring_billing_items FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_recurring_billing_items_delete ON membership_recurring_billing_items FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_recurring_billing_order_lines ────────────────────
CREATE TABLE IF NOT EXISTS membership_recurring_billing_order_lines (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  membership_recurring_billing_id TEXT NOT NULL REFERENCES membership_recurring_billing_items(id),
  customer_membership_id          TEXT NOT NULL,
  order_line_item_id              TEXT,
  order_id                        TEXT,
  title                           TEXT,
  amount_cents                    INTEGER NOT NULL,
  discount_cents                  INTEGER NOT NULL DEFAULT 0,
  tax_amount_cents                INTEGER NOT NULL DEFAULT 0,
  frequency                       INTEGER,
  frequency_type                  TEXT,
  billed_since_date               DATE,
  billed_till_date                DATE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_recurring_billing_order_lines_tenant_billing
  ON membership_recurring_billing_order_lines (tenant_id, membership_recurring_billing_id);

ALTER TABLE membership_recurring_billing_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_recurring_billing_order_lines_select ON membership_recurring_billing_order_lines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_recurring_billing_order_lines_insert ON membership_recurring_billing_order_lines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_recurring_billing_order_lines_update ON membership_recurring_billing_order_lines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_recurring_billing_order_lines_delete ON membership_recurring_billing_order_lines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
