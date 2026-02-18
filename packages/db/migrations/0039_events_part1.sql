-- Migration: 0039_events_part1
-- Events core domain (part 1): events, activities, banquet profiles, customer groups,
-- registrations, deposit payments, floor plans, fee types, notes, timelines,
-- online registration settings, products, ledger entries, ledger adjustments

-- ══════════════════════════════════════════════════════════════════
-- EVENTS CORE DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  title                       TEXT NOT NULL,
  description                 TEXT,
  event_type                  TEXT NOT NULL DEFAULT 'general',
  status                      TEXT NOT NULL DEFAULT 'draft',
  venue                       TEXT,
  start_date                  DATE NOT NULL,
  end_date                    DATE NOT NULL,
  start_time                  TIME,
  end_time                    TIME,
  signup_fee_cents            INTEGER NOT NULL DEFAULT 0,
  banner_image_url            TEXT,
  registration_start_date     DATE,
  registration_end_date       DATE,
  gratuity_percentage         NUMERIC(5,2),
  confirmation_status         TEXT,
  is_tax_exempt               BOOLEAN NOT NULL DEFAULT false,
  tax_exempt_reason           TEXT,
  max_registrants             INTEGER,
  registrants_per_customer    INTEGER,
  service_fee_tax_group_id    TEXT,
  is_closed                   BOOLEAN NOT NULL DEFAULT false,
  closed_date                 DATE,
  revenue_posted              BOOLEAN NOT NULL DEFAULT false,
  beo                         TEXT,
  use_item_level_service_fee  BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_tenant_status
  ON events (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_events_tenant_start_date
  ON events (tenant_id, start_date);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_select ON events FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY events_insert ON events FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY events_update ON events FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY events_delete ON events FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_activities ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_activities (
  id           TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  location     TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_activities_tenant_event
  ON event_activities (tenant_id, event_id);

ALTER TABLE event_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_activities_select ON event_activities FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_activities_insert ON event_activities FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_activities_update ON event_activities FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_activities_delete ON event_activities FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_banquet_profiles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_banquet_profiles (
  id                     TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  event_id               TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  preliminary_guest_count INTEGER,
  final_guest_count      INTEGER,
  guest_count_verified   BOOLEAN NOT NULL DEFAULT false,
  total_amount_cents     INTEGER NOT NULL DEFAULT 0,
  deposited_amount_cents INTEGER NOT NULL DEFAULT 0,
  balance_amount_cents   INTEGER NOT NULL DEFAULT 0,
  account_manager        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_banquet_profiles_tenant_event
  ON event_banquet_profiles (tenant_id, event_id);

ALTER TABLE event_banquet_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_banquet_profiles_select ON event_banquet_profiles FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_banquet_profiles_insert ON event_banquet_profiles FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_banquet_profiles_update ON event_banquet_profiles FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_banquet_profiles_delete ON event_banquet_profiles FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_customer_groups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_customer_groups (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_group_id TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_customer_groups_tenant_event_group
  ON event_customer_groups (tenant_id, event_id, customer_group_id);

ALTER TABLE event_customer_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_customer_groups_select ON event_customer_groups FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_customer_groups_insert ON event_customer_groups FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_customer_groups_update ON event_customer_groups FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_customer_groups_delete ON event_customer_groups FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_registrations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_registrations (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  event_id              TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_id           TEXT,
  organizer_customer_id TEXT,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  amount_cents          INTEGER NOT NULL DEFAULT 0,
  quantity              INTEGER NOT NULL DEFAULT 1,
  order_id              TEXT,
  order_line_id         TEXT,
  sequence              INTEGER,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_tenant_event
  ON event_registrations (tenant_id, event_id);

CREATE INDEX IF NOT EXISTS idx_event_registrations_tenant_customer
  ON event_registrations (tenant_id, customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_registrations_select ON event_registrations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_registrations_insert ON event_registrations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_registrations_update ON event_registrations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_registrations_delete ON event_registrations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_deposit_payments ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_deposit_payments (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  payment_method_id TEXT NOT NULL,
  event_golfer_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_deposit_payments_tenant_event
  ON event_deposit_payments (tenant_id, event_id);

ALTER TABLE event_deposit_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_deposit_payments_select ON event_deposit_payments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_deposit_payments_insert ON event_deposit_payments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_deposit_payments_update ON event_deposit_payments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_deposit_payments_delete ON event_deposit_payments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_floor_plans ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_floor_plans (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  floor_plan_type TEXT NOT NULL,
  floor_plan_data JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_floor_plans_tenant_event
  ON event_floor_plans (tenant_id, event_id);

ALTER TABLE event_floor_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_floor_plans_select ON event_floor_plans FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_floor_plans_insert ON event_floor_plans FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_floor_plans_update ON event_floor_plans FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_floor_plans_delete ON event_floor_plans FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_fee_types ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_fee_types (
  id           TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_fee_types_tenant_event
  ON event_fee_types (tenant_id, event_id);

ALTER TABLE event_fee_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_fee_types_select ON event_fee_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_fee_types_insert ON event_fee_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_fee_types_update ON event_fee_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_fee_types_delete ON event_fee_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_notes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_notes (
  id                 TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  event_id           TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  note_type          TEXT NOT NULL DEFAULT 'note',
  content            TEXT NOT NULL,
  department         TEXT,
  event_timeline_id  TEXT,
  author_id          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_notes_tenant_event_type
  ON event_notes (tenant_id, event_id, note_type);

ALTER TABLE event_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_notes_select ON event_notes FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_notes_insert ON event_notes FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_notes_update ON event_notes FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_notes_delete ON event_notes FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_timelines ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_timelines (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  start_date  DATE,
  start_time  TIME,
  end_date    DATE,
  end_time    TIME,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_timelines_tenant_event
  ON event_timelines (tenant_id, event_id);

ALTER TABLE event_timelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_timelines_select ON event_timelines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_timelines_insert ON event_timelines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_timelines_update ON event_timelines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_timelines_delete ON event_timelines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_online_registration_settings ────────────────────────────
CREATE TABLE IF NOT EXISTS event_online_registration_settings (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  event_id                    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  available_online            BOOLEAN NOT NULL DEFAULT false,
  max_registrants_per_player  INTEGER,
  requires_first_name         BOOLEAN NOT NULL DEFAULT true,
  requires_last_name          BOOLEAN NOT NULL DEFAULT true,
  requires_email              BOOLEAN NOT NULL DEFAULT true,
  requires_phone              BOOLEAN NOT NULL DEFAULT false,
  online_signup_link          BOOLEAN NOT NULL DEFAULT false,
  link                        TEXT,
  registration_strategy       TEXT,
  event_image_url             TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_online_reg_settings_tenant_event
  ON event_online_registration_settings (tenant_id, event_id);

ALTER TABLE event_online_registration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_online_registration_settings_select ON event_online_registration_settings FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_online_registration_settings_insert ON event_online_registration_settings FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_online_registration_settings_update ON event_online_registration_settings FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_online_registration_settings_delete ON event_online_registration_settings FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_products ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_products (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  event_id                  TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  catalog_item_id           TEXT,
  cost_price_cents          INTEGER,
  unit_list_price_cents     INTEGER,
  unit_price_cents          INTEGER NOT NULL,
  quantity                  INTEGER NOT NULL DEFAULT 1,
  discount_amount_cents     INTEGER NOT NULL DEFAULT 0,
  tax_amount_cents          INTEGER NOT NULL DEFAULT 0,
  total_cents               INTEGER NOT NULL DEFAULT 0,
  preparation_instructions  TEXT,
  meal_type                 TEXT,
  product_type              TEXT,
  gratuity_applicable       BOOLEAN NOT NULL DEFAULT false,
  event_timeline_id         TEXT,
  display_sequence          INTEGER NOT NULL DEFAULT 0,
  tax_exempt                BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_products_tenant_event
  ON event_products (tenant_id, event_id);

ALTER TABLE event_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_products_select ON event_products FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_products_insert ON event_products FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_products_update ON event_products FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_products_delete ON event_products FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_ledger_entries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_ledger_entries (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  payment_method_id TEXT,
  description       TEXT,
  balance_cents     INTEGER NOT NULL,
  amount_cents      INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_ledger_entries_tenant_event
  ON event_ledger_entries (tenant_id, event_id);

ALTER TABLE event_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_ledger_entries_select ON event_ledger_entries FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_ledger_entries_insert ON event_ledger_entries FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_ledger_entries_update ON event_ledger_entries FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_ledger_entries_delete ON event_ledger_entries FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_ledger_adjustments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_ledger_adjustments (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  event_id                    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_ledger_id             TEXT REFERENCES event_ledger_entries(id),
  amount_cents                INTEGER NOT NULL,
  description                 TEXT,
  credit_chart_of_account_id  TEXT,
  vendor_id                   TEXT,
  order_line_id               TEXT,
  created_by                  TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_ledger_adjustments_tenant_event
  ON event_ledger_adjustments (tenant_id, event_id);

ALTER TABLE event_ledger_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_ledger_adjustments_select ON event_ledger_adjustments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_ledger_adjustments_insert ON event_ledger_adjustments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_ledger_adjustments_update ON event_ledger_adjustments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_ledger_adjustments_delete ON event_ledger_adjustments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
