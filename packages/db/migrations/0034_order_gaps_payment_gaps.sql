-- Migration: 0034_order_gaps_payment_gaps
-- ORDER_GAPS domain: order_seats, order_tips, order_status_history,
--   order_line_preparations, order_preparation_dockets, meal_courses, quick_menus
-- PAYMENT_GAPS domain: custom_payment_types, location_payment_types,
--   inter_club_payment_methods, inter_club_reconciliations,
--   inter_club_reconciliation_batches, tender_signatures, cash_payouts,
--   cash_tips, credit_card_convenience_fees, event_gratuities
-- Also: ALTER TABLE orders + order_lines for gap columns

-- ══════════════════════════════════════════════════════════════════
-- ORDER_GAPS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── order_seats ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_seats (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  order_id        TEXT NOT NULL,
  seat_number     INTEGER NOT NULL,
  customer_id     TEXT,
  customer_name   TEXT,
  tab_name        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_seats_tenant_order
  ON order_seats (tenant_id, order_id);

ALTER TABLE order_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_seats_select ON order_seats FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_seats_insert ON order_seats FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_seats_update ON order_seats FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_seats_delete ON order_seats FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── order_tips ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_tips (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  order_id                    TEXT NOT NULL,
  amount_cents                INTEGER NOT NULL,
  employee_id                 TEXT,
  terminal_id                 TEXT,
  payment_method_id           TEXT,
  applied_to_payment_method_id TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_tips_tenant_order
  ON order_tips (tenant_id, order_id);

ALTER TABLE order_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_tips_select ON order_tips FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_tips_insert ON order_tips FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_tips_update ON order_tips FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_tips_delete ON order_tips FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── order_status_history ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  order_id        TEXT NOT NULL,
  reference_id    TEXT,
  reference_type  TEXT,
  status          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_tenant_order_created
  ON order_status_history (tenant_id, order_id, created_at);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_status_history_select ON order_status_history FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_status_history_insert ON order_status_history FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_status_history_update ON order_status_history FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_status_history_delete ON order_status_history FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── order_line_preparations ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_line_preparations (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  order_line_id             TEXT NOT NULL,
  quantity                  INTEGER NOT NULL DEFAULT 1,
  status                    TEXT NOT NULL DEFAULT 'pending',
  docket_number             TEXT,
  docket_id                 TEXT,
  push_date_time            TIMESTAMPTZ,
  kds_setting               TEXT,
  preparation_instructions  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_line_preparations_tenant_line
  ON order_line_preparations (tenant_id, order_line_id);

ALTER TABLE order_line_preparations ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_line_preparations_select ON order_line_preparations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_line_preparations_insert ON order_line_preparations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_line_preparations_update ON order_line_preparations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_line_preparations_delete ON order_line_preparations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── order_preparation_dockets ───────────────────────────────────
CREATE TABLE IF NOT EXISTS order_preparation_dockets (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  primary_order_id          TEXT NOT NULL,
  docket_number             TEXT NOT NULL,
  preparation_instructions  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_preparation_dockets_tenant_order
  ON order_preparation_dockets (tenant_id, primary_order_id);

ALTER TABLE order_preparation_dockets ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_preparation_dockets_select ON order_preparation_dockets FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_preparation_dockets_insert ON order_preparation_dockets FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_preparation_dockets_update ON order_preparation_dockets FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY order_preparation_dockets_delete ON order_preparation_dockets FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── meal_courses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_courses (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  title             TEXT NOT NULL,
  display_sequence  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meal_courses_tenant_title
  ON meal_courses (tenant_id, title);

ALTER TABLE meal_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY meal_courses_select ON meal_courses FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY meal_courses_insert ON meal_courses FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY meal_courses_update ON meal_courses FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY meal_courses_delete ON meal_courses FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── quick_menus ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_menus (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  course_id         TEXT NOT NULL,
  catalog_item_id   TEXT NOT NULL,
  employee_id       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quick_menus_tenant_course_item_employee
  ON quick_menus (tenant_id, course_id, catalog_item_id, employee_id);

ALTER TABLE quick_menus ENABLE ROW LEVEL SECURITY;

CREATE POLICY quick_menus_select ON quick_menus FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY quick_menus_insert ON quick_menus FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY quick_menus_update ON quick_menus FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY quick_menus_delete ON quick_menus FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- ALTER TABLE — orders
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE orders ADD COLUMN IF NOT EXISTS hole_number INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tab_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_exempt BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS primary_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS search_tags TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_id TEXT;

-- ══════════════════════════════════════════════════════════════════
-- ALTER TABLE — order_lines
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS cost_price INTEGER;
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS seat_number INTEGER;
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS meal_course_id TEXT;
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS combo_parent_line_id TEXT;

-- ══════════════════════════════════════════════════════════════════
-- PAYMENT_GAPS DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── custom_payment_types ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_payment_types (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  name                        TEXT NOT NULL,
  debit_chart_of_account_id   TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_payment_types_tenant_name
  ON custom_payment_types (tenant_id, name);

ALTER TABLE custom_payment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_payment_types_select ON custom_payment_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY custom_payment_types_insert ON custom_payment_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY custom_payment_types_update ON custom_payment_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY custom_payment_types_delete ON custom_payment_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── location_payment_types ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_payment_types (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  location_id             TEXT,
  terminal_location_id    TEXT,
  terminal_id             TEXT,
  identifier              TEXT NOT NULL,
  title                   TEXT NOT NULL,
  display_order           INTEGER NOT NULL DEFAULT 0,
  custom_payment_type_id  TEXT REFERENCES custom_payment_types(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_payment_types_tenant_location
  ON location_payment_types (tenant_id, location_id);

ALTER TABLE location_payment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_payment_types_select ON location_payment_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY location_payment_types_insert ON location_payment_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY location_payment_types_update ON location_payment_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY location_payment_types_delete ON location_payment_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── inter_club_payment_methods ──────────────────────────────────
CREATE TABLE IF NOT EXISTS inter_club_payment_methods (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  payment_method_id   TEXT NOT NULL,
  reconciliation_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inter_club_payment_methods_tenant_payment
  ON inter_club_payment_methods (tenant_id, payment_method_id);

ALTER TABLE inter_club_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY inter_club_payment_methods_select ON inter_club_payment_methods FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_payment_methods_insert ON inter_club_payment_methods FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_payment_methods_update ON inter_club_payment_methods FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_payment_methods_delete ON inter_club_payment_methods FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── inter_club_reconciliations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS inter_club_reconciliations (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  pay_to_location_id  TEXT NOT NULL,
  order_id            TEXT,
  voucher_id          TEXT,
  paid_at             TIMESTAMPTZ,
  amount_cents        INTEGER NOT NULL,
  batch_id            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inter_club_reconciliations_tenant_location
  ON inter_club_reconciliations (tenant_id, pay_to_location_id);

ALTER TABLE inter_club_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY inter_club_reconciliations_select ON inter_club_reconciliations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_reconciliations_insert ON inter_club_reconciliations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_reconciliations_update ON inter_club_reconciliations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_reconciliations_delete ON inter_club_reconciliations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── inter_club_reconciliation_batches ───────────────────────────
CREATE TABLE IF NOT EXISTS inter_club_reconciliation_batches (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  pay_to_location_id      TEXT NOT NULL,
  from_date               DATE NOT NULL,
  to_date                 DATE NOT NULL,
  settlement_amount_cents INTEGER NOT NULL,
  settlement_status       TEXT NOT NULL DEFAULT 'pending',
  settlement_date         DATE,
  note                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inter_club_reconciliation_batches_tenant_location
  ON inter_club_reconciliation_batches (tenant_id, pay_to_location_id);

ALTER TABLE inter_club_reconciliation_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY inter_club_reconciliation_batches_select ON inter_club_reconciliation_batches FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_reconciliation_batches_insert ON inter_club_reconciliation_batches FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_reconciliation_batches_update ON inter_club_reconciliation_batches FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY inter_club_reconciliation_batches_delete ON inter_club_reconciliation_batches FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tender_signatures ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tender_signatures (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  tender_id       TEXT NOT NULL,
  order_id        TEXT,
  signature_data  TEXT NOT NULL,
  signature_type  TEXT NOT NULL DEFAULT 'digital',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tender_signatures_tenant_tender
  ON tender_signatures (tenant_id, tender_id);

ALTER TABLE tender_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY tender_signatures_select ON tender_signatures FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tender_signatures_insert ON tender_signatures FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tender_signatures_update ON tender_signatures FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tender_signatures_delete ON tender_signatures FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── cash_payouts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_payouts (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  terminal_id           TEXT,
  course_id             TEXT,
  recipient_first_name  TEXT,
  recipient_last_name   TEXT,
  amount_cents          INTEGER NOT NULL,
  notes                 TEXT,
  validity_status       TEXT NOT NULL DEFAULT 'valid',
  payout_type           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_payouts_tenant_terminal
  ON cash_payouts (tenant_id, terminal_id);

ALTER TABLE cash_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_payouts_select ON cash_payouts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY cash_payouts_insert ON cash_payouts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY cash_payouts_update ON cash_payouts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY cash_payouts_delete ON cash_payouts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── cash_tips ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_tips (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  employee_id   TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_tips_tenant_employee
  ON cash_tips (tenant_id, employee_id);

ALTER TABLE cash_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_tips_select ON cash_tips FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY cash_tips_insert ON cash_tips FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY cash_tips_update ON cash_tips FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY cash_tips_delete ON cash_tips FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── credit_card_convenience_fees ────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_card_convenience_fees (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  tender_id             TEXT NOT NULL,
  order_line_id         TEXT,
  amount_charged_on_cents INTEGER NOT NULL,
  percentage            NUMERIC(5,2) NOT NULL,
  fee_amount_cents      INTEGER NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_card_convenience_fees_tenant_tender
  ON credit_card_convenience_fees (tenant_id, tender_id);

ALTER TABLE credit_card_convenience_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_card_convenience_fees_select ON credit_card_convenience_fees FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY credit_card_convenience_fees_insert ON credit_card_convenience_fees FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY credit_card_convenience_fees_update ON credit_card_convenience_fees FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY credit_card_convenience_fees_delete ON credit_card_convenience_fees FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── event_gratuities ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_gratuities (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  event_id        TEXT NOT NULL,
  order_line_id   TEXT,
  subtotal_cents  INTEGER NOT NULL,
  percentage      NUMERIC(5,2) NOT NULL,
  amount_cents    INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_gratuities_tenant_event
  ON event_gratuities (tenant_id, event_id);

ALTER TABLE event_gratuities ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_gratuities_select ON event_gratuities FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_gratuities_insert ON event_gratuities FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_gratuities_update ON event_gratuities FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY event_gratuities_delete ON event_gratuities FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
