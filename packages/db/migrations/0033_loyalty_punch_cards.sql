-- Migration: 0033_loyalty_punch_cards
-- Loyalty domain: ledger entries, order details, configurations, award details
-- Punch cards domain: types, cards, rates, rate usage strategies, type rates, type rate usage strategies, usages

-- ══════════════════════════════════════════════════════════════════
-- LOYALTY DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── loyalty_ledger_entries ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_ledger_entries (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  customer_id   TEXT NOT NULL,
  ledger_type   TEXT NOT NULL,
  points        BIGINT NOT NULL DEFAULT 0,
  balance       BIGINT NOT NULL DEFAULT 0,
  entity_id     TEXT,
  entity_type   TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_entries_tenant_customer_created ON loyalty_ledger_entries (tenant_id, customer_id, created_at);

ALTER TABLE loyalty_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_ledger_entries_select ON loyalty_ledger_entries FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_ledger_entries_insert ON loyalty_ledger_entries FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_ledger_entries_update ON loyalty_ledger_entries FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_ledger_entries_delete ON loyalty_ledger_entries FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── loyalty_order_details ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_order_details (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  order_line_id   TEXT NOT NULL,
  points          BIGINT NOT NULL DEFAULT 0,
  quantity        INTEGER NOT NULL DEFAULT 1,
  total_points    BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_order_details_tenant_order_line ON loyalty_order_details (tenant_id, order_line_id);

ALTER TABLE loyalty_order_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_order_details_select ON loyalty_order_details FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_order_details_insert ON loyalty_order_details FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_order_details_update ON loyalty_order_details FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_order_details_delete ON loyalty_order_details FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── loyalty_configurations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_configurations (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  order_id                  TEXT,
  conversion_amount_cents   INTEGER NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_configurations_tenant ON loyalty_configurations (tenant_id);

ALTER TABLE loyalty_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_configurations_select ON loyalty_configurations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_configurations_insert ON loyalty_configurations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_configurations_update ON loyalty_configurations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_configurations_delete ON loyalty_configurations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── loyalty_award_details ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_award_details (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  order_line_id         TEXT NOT NULL,
  cashback_cents        INTEGER NOT NULL DEFAULT 0,
  quantity              INTEGER NOT NULL DEFAULT 1,
  total_cashback_cents  INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_award_details_tenant_order_line ON loyalty_award_details (tenant_id, order_line_id);

ALTER TABLE loyalty_award_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_award_details_select ON loyalty_award_details FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_award_details_insert ON loyalty_award_details FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_award_details_update ON loyalty_award_details FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY loyalty_award_details_delete ON loyalty_award_details FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- PUNCH CARDS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── punch_card_types ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punch_card_types (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  title               TEXT NOT NULL,
  description         TEXT,
  total_amount_cents  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_punch_card_types_tenant ON punch_card_types (tenant_id);

ALTER TABLE punch_card_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_card_types_select ON punch_card_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_types_insert ON punch_card_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_types_update ON punch_card_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_types_delete ON punch_card_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── punch_cards ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punch_cards (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  punch_card_type_id  TEXT NOT NULL REFERENCES punch_card_types(id),
  customer_id         TEXT NOT NULL,
  title               TEXT,
  description         TEXT,
  order_id            TEXT,
  amount_cents        INTEGER NOT NULL DEFAULT 0,
  total_cents         INTEGER NOT NULL DEFAULT 0,
  card_number         TEXT,
  card_number_type    TEXT,
  expiration_date     DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_punch_cards_tenant_customer ON punch_cards (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_punch_cards_tenant_card_number ON punch_cards (tenant_id, card_number) WHERE card_number IS NOT NULL;

ALTER TABLE punch_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_cards_select ON punch_cards FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_cards_insert ON punch_cards FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_cards_update ON punch_cards FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_cards_delete ON punch_cards FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── punch_card_rates ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punch_card_rates (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  course_id           TEXT NOT NULL,
  punch_card_id       TEXT NOT NULL REFERENCES punch_cards(id) ON DELETE CASCADE,
  customer_id         TEXT NOT NULL,
  rack_rate_id        TEXT,
  class_rule_id       TEXT,
  quantity            INTEGER NOT NULL DEFAULT 0,
  rate_cents          INTEGER NOT NULL DEFAULT 0,
  usage_strategy_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_punch_card_rates_tenant_card ON punch_card_rates (tenant_id, punch_card_id);

ALTER TABLE punch_card_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_card_rates_select ON punch_card_rates FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_rates_insert ON punch_card_rates FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_rates_update ON punch_card_rates FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_rates_delete ON punch_card_rates FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── punch_card_rate_usage_strategies ─────────────────────────────
CREATE TABLE IF NOT EXISTS punch_card_rate_usage_strategies (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT NOT NULL,
  punch_card_id   TEXT NOT NULL REFERENCES punch_cards(id) ON DELETE CASCADE,
  customer_id     TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 0,
  rate_cents      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_punch_card_rate_usage_strategies_tenant_card ON punch_card_rate_usage_strategies (tenant_id, punch_card_id);

ALTER TABLE punch_card_rate_usage_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_card_rate_usage_strategies_select ON punch_card_rate_usage_strategies FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_rate_usage_strategies_insert ON punch_card_rate_usage_strategies FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_rate_usage_strategies_update ON punch_card_rate_usage_strategies FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_rate_usage_strategies_delete ON punch_card_rate_usage_strategies FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── punch_card_type_rates ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punch_card_type_rates (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  course_id             TEXT NOT NULL,
  punch_card_type_id    TEXT NOT NULL REFERENCES punch_card_types(id) ON DELETE CASCADE,
  rack_rate_id          TEXT,
  class_rule_id         TEXT,
  quantity              INTEGER NOT NULL DEFAULT 0,
  rate_cents            INTEGER NOT NULL DEFAULT 0,
  usage_strategy_id     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_punch_card_type_rates_tenant_type ON punch_card_type_rates (tenant_id, punch_card_type_id);

ALTER TABLE punch_card_type_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_card_type_rates_select ON punch_card_type_rates FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_type_rates_insert ON punch_card_type_rates FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_type_rates_update ON punch_card_type_rates FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_type_rates_delete ON punch_card_type_rates FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── punch_card_type_rate_usage_strategies ────────────────────────
CREATE TABLE IF NOT EXISTS punch_card_type_rate_usage_strategies (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  course_id             TEXT NOT NULL,
  punch_card_type_id    TEXT NOT NULL REFERENCES punch_card_types(id) ON DELETE CASCADE,
  quantity              INTEGER NOT NULL DEFAULT 0,
  rate_cents            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_punch_card_type_rate_usage_strategies_tenant_type ON punch_card_type_rate_usage_strategies (tenant_id, punch_card_type_id);

ALTER TABLE punch_card_type_rate_usage_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_card_type_rate_usage_strategies_select ON punch_card_type_rate_usage_strategies FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_type_rate_usage_strategies_insert ON punch_card_type_rate_usage_strategies FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_type_rate_usage_strategies_update ON punch_card_type_rate_usage_strategies FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_type_rate_usage_strategies_delete ON punch_card_type_rate_usage_strategies FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── punch_card_usages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punch_card_usages (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  punch_card_id               TEXT NOT NULL REFERENCES punch_cards(id),
  punch_card_rate_id          TEXT,
  order_id                    TEXT,
  tee_booking_order_line_id   TEXT,
  rounds_used                 INTEGER NOT NULL DEFAULT 0,
  description                 TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_punch_card_usages_tenant_card ON punch_card_usages (tenant_id, punch_card_id);

ALTER TABLE punch_card_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_card_usages_select ON punch_card_usages FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_usages_insert ON punch_card_usages FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_usages_update ON punch_card_usages FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY punch_card_usages_delete ON punch_card_usages FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
