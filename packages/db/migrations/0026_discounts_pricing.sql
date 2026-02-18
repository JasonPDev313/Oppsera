-- Migration: 0026_discounts_pricing
-- Discounts & pricing domain: discounts, department rules, discount schedules,
-- promo codes, rack rates, rack rate schedules, catalog pricing schedules

-- ══════════════════════════════════════════════════════════════════
-- DISCOUNTS & PRICING DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── discounts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discounts (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  title                 TEXT NOT NULL,
  value_type            TEXT NOT NULL,
  value_percentage      NUMERIC(5,2),
  value_amount_cents    INTEGER,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discounts_tenant_active ON discounts (tenant_id, is_active);

ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY discounts_select ON discounts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discounts_insert ON discounts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discounts_update ON discounts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discounts_delete ON discounts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── discount_department_rules ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS discount_department_rules (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  discount_id           TEXT NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  department_id         TEXT NOT NULL,
  sub_department_id     TEXT,
  value_type            TEXT NOT NULL,
  value_percentage      NUMERIC(5,2),
  value_amount_cents    INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_dept_rules_tenant_discount ON discount_department_rules (tenant_id, discount_id);

ALTER TABLE discount_department_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY discount_department_rules_select ON discount_department_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discount_department_rules_insert ON discount_department_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discount_department_rules_update ON discount_department_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discount_department_rules_delete ON discount_department_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── discount_schedules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discount_schedules (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  discount_id     TEXT NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  start_date      DATE,
  end_date        DATE,
  start_time      TIME,
  end_time        TIME,
  monday          BOOLEAN NOT NULL DEFAULT false,
  tuesday         BOOLEAN NOT NULL DEFAULT false,
  wednesday       BOOLEAN NOT NULL DEFAULT false,
  thursday        BOOLEAN NOT NULL DEFAULT false,
  friday          BOOLEAN NOT NULL DEFAULT false,
  saturday        BOOLEAN NOT NULL DEFAULT false,
  sunday          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_schedules_tenant_discount ON discount_schedules (tenant_id, discount_id);

ALTER TABLE discount_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY discount_schedules_select ON discount_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discount_schedules_insert ON discount_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discount_schedules_update ON discount_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY discount_schedules_delete ON discount_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── promo_codes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  code              TEXT NOT NULL,
  title             TEXT,
  description       TEXT,
  discount_type     TEXT NOT NULL,
  discount_value    NUMERIC(10,2) NOT NULL,
  discount_id       TEXT REFERENCES discounts(id),
  category_id       TEXT,
  is_one_time_use   BOOLEAN NOT NULL DEFAULT false,
  is_used           BOOLEAN NOT NULL DEFAULT false,
  max_uses          INTEGER,
  current_uses      INTEGER NOT NULL DEFAULT 0,
  expires_at        DATE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_codes_tenant_code ON promo_codes (tenant_id, code);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_codes_select ON promo_codes FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY promo_codes_insert ON promo_codes FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY promo_codes_update ON promo_codes FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY promo_codes_delete ON promo_codes FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rack_rates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rack_rates (
  id                            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                     TEXT NOT NULL REFERENCES tenants(id),
  course_id                     TEXT NOT NULL,
  name                          TEXT NOT NULL,
  rate_cents                    INTEGER NOT NULL,
  holes                         INTEGER NOT NULL DEFAULT 18,
  includes_cart                 BOOLEAN NOT NULL DEFAULT false,
  monday                        BOOLEAN NOT NULL DEFAULT false,
  tuesday                       BOOLEAN NOT NULL DEFAULT false,
  wednesday                     BOOLEAN NOT NULL DEFAULT false,
  thursday                      BOOLEAN NOT NULL DEFAULT false,
  friday                        BOOLEAN NOT NULL DEFAULT false,
  saturday                      BOOLEAN NOT NULL DEFAULT false,
  sunday                        BOOLEAN NOT NULL DEFAULT false,
  start_month                   INTEGER,
  start_day                     INTEGER,
  end_month                     INTEGER,
  end_day                       INTEGER,
  start_time                    TIME,
  end_time                      TIME,
  is_active                     BOOLEAN NOT NULL DEFAULT true,
  available_online              BOOLEAN NOT NULL DEFAULT false,
  display_sequence              INTEGER NOT NULL DEFAULT 0,
  reservation_resource_type_id  TEXT,
  catalog_item_id               TEXT,
  duration_minutes              INTEGER,
  booking_window_days           INTEGER,
  online_booking_window_days    INTEGER,
  override_all_rack_rates       BOOLEAN NOT NULL DEFAULT false,
  override_all_class_rates      BOOLEAN NOT NULL DEFAULT false,
  description                   TEXT,
  show_in_dist_engine           BOOLEAN NOT NULL DEFAULT false,
  dist_engine_sequence          INTEGER,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rack_rates_tenant_course_active ON rack_rates (tenant_id, course_id, is_active);

ALTER TABLE rack_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY rack_rates_select ON rack_rates FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rack_rates_insert ON rack_rates FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rack_rates_update ON rack_rates FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rack_rates_delete ON rack_rates FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── rack_rate_schedules ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rack_rate_schedules (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL,
  rack_rate_id    TEXT NOT NULL REFERENCES rack_rates(id) ON DELETE CASCADE,
  rate_cents      INTEGER NOT NULL,
  monday          BOOLEAN NOT NULL DEFAULT false,
  tuesday         BOOLEAN NOT NULL DEFAULT false,
  wednesday       BOOLEAN NOT NULL DEFAULT false,
  thursday        BOOLEAN NOT NULL DEFAULT false,
  friday          BOOLEAN NOT NULL DEFAULT false,
  saturday        BOOLEAN NOT NULL DEFAULT false,
  sunday          BOOLEAN NOT NULL DEFAULT false,
  start_month     INTEGER,
  start_day       INTEGER,
  end_month       INTEGER,
  end_day         INTEGER,
  start_time      TIME,
  end_time        TIME,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rack_rate_schedules_tenant_rate ON rack_rate_schedules (tenant_id, rack_rate_id);

ALTER TABLE rack_rate_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY rack_rate_schedules_select ON rack_rate_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rack_rate_schedules_insert ON rack_rate_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rack_rate_schedules_update ON rack_rate_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rack_rate_schedules_delete ON rack_rate_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── catalog_pricing_schedules ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_pricing_schedules (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  catalog_item_id   TEXT NOT NULL,
  start_date        DATE,
  end_date          DATE,
  start_time        TIME,
  end_time          TIME,
  sale_price_cents  INTEGER NOT NULL,
  monday            BOOLEAN NOT NULL DEFAULT false,
  tuesday           BOOLEAN NOT NULL DEFAULT false,
  wednesday         BOOLEAN NOT NULL DEFAULT false,
  thursday          BOOLEAN NOT NULL DEFAULT false,
  friday            BOOLEAN NOT NULL DEFAULT false,
  saturday          BOOLEAN NOT NULL DEFAULT false,
  sunday            BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_pricing_schedules_tenant_item ON catalog_pricing_schedules (tenant_id, catalog_item_id);

ALTER TABLE catalog_pricing_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_pricing_schedules_select ON catalog_pricing_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_pricing_schedules_insert ON catalog_pricing_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_pricing_schedules_update ON catalog_pricing_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY catalog_pricing_schedules_delete ON catalog_pricing_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
