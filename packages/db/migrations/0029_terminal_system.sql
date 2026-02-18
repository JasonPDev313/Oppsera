-- Migration: 0029_terminal_system
-- Terminal domain: terminal locations, terminals, card readers, card reader settings,
-- day-end closings, closing payment types, closing cash counts, tip suggestions,
-- location floor plans, drawer events, register notes, printers, print jobs

-- ══════════════════════════════════════════════════════════════════
-- TERMINAL DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── terminal_locations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terminal_locations (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  title                           TEXT NOT NULL,
  default_merchant_receipt_print   TEXT DEFAULT 'auto',
  default_customer_receipt_print   TEXT DEFAULT 'auto',
  default_merchant_receipt_type    TEXT DEFAULT 'full',
  default_customer_receipt_type    TEXT DEFAULT 'full',
  tips_applicable                 BOOLEAN NOT NULL DEFAULT true,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_locations_tenant ON terminal_locations (tenant_id);

ALTER TABLE terminal_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_locations_select ON terminal_locations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_locations_insert ON terminal_locations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_locations_update ON terminal_locations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_locations_delete ON terminal_locations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── terminals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terminals (
  id                                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                             TEXT NOT NULL REFERENCES tenants(id),
  terminal_location_id                  TEXT NOT NULL REFERENCES terminal_locations(id),
  title                                 TEXT NOT NULL,
  shows_desktop_notification            BOOLEAN NOT NULL DEFAULT false,
  requires_pin_on_quick_tab             BOOLEAN NOT NULL DEFAULT false,
  lock_screen                           BOOLEAN NOT NULL DEFAULT false,
  auto_pin_lock_idle_seconds            INTEGER,
  auto_logout_idle_seconds              INTEGER,
  auto_pin_lock_register_idle_seconds   INTEGER,
  auto_save_register_tabs               BOOLEAN NOT NULL DEFAULT false,
  enable_signature_tip_after_payment    BOOLEAN NOT NULL DEFAULT false,
  reopen_tabs_behaviour                 TEXT DEFAULT 'ask',
  requires_customer_for_table           BOOLEAN NOT NULL DEFAULT false,
  require_seat_count_for_table          BOOLEAN NOT NULL DEFAULT false,
  receipt_printer_id                    TEXT,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminals_tenant_location ON terminals (tenant_id, terminal_location_id);

ALTER TABLE terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminals_select ON terminals FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminals_insert ON terminals FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminals_update ON terminals FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminals_delete ON terminals FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── terminal_card_readers ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terminal_card_readers (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  card_terminal_type    TEXT NOT NULL,
  description           TEXT,
  model                 TEXT,
  has_signature_capture BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_card_readers_tenant_active ON terminal_card_readers (tenant_id, is_active);

ALTER TABLE terminal_card_readers ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_card_readers_select ON terminal_card_readers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_card_readers_insert ON terminal_card_readers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_card_readers_update ON terminal_card_readers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_card_readers_delete ON terminal_card_readers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── terminal_card_reader_settings ─────────────────────────────────
CREATE TABLE IF NOT EXISTS terminal_card_reader_settings (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  terminal_id     TEXT NOT NULL REFERENCES terminals(id),
  card_reader_id  TEXT NOT NULL REFERENCES terminal_card_readers(id),
  course_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_card_reader_settings_tenant_terminal_reader
  ON terminal_card_reader_settings (tenant_id, terminal_id, card_reader_id);

ALTER TABLE terminal_card_reader_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_card_reader_settings_select ON terminal_card_reader_settings FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_card_reader_settings_insert ON terminal_card_reader_settings FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_card_reader_settings_update ON terminal_card_reader_settings FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_card_reader_settings_delete ON terminal_card_reader_settings FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── day_end_closings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS day_end_closings (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  terminal_id         TEXT NOT NULL REFERENCES terminals(id),
  closing_date        DATE NOT NULL,
  employee_id         TEXT,
  float_amount_cents  INTEGER NOT NULL DEFAULT 0,
  note                TEXT,
  amount_data         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_day_end_closings_tenant_terminal_date
  ON day_end_closings (tenant_id, terminal_id, closing_date);

ALTER TABLE day_end_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY day_end_closings_select ON day_end_closings FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closings_insert ON day_end_closings FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closings_update ON day_end_closings FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closings_delete ON day_end_closings FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── day_end_closing_payment_types ─────────────────────────────────
CREATE TABLE IF NOT EXISTS day_end_closing_payment_types (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  day_end_closing_id  TEXT NOT NULL REFERENCES day_end_closings(id) ON DELETE CASCADE,
  payment_type        TEXT NOT NULL,
  amount_cents        INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_day_end_closing_payment_types_tenant_closing
  ON day_end_closing_payment_types (tenant_id, day_end_closing_id);

ALTER TABLE day_end_closing_payment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY day_end_closing_payment_types_select ON day_end_closing_payment_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closing_payment_types_insert ON day_end_closing_payment_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closing_payment_types_update ON day_end_closing_payment_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closing_payment_types_delete ON day_end_closing_payment_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── day_end_closing_cash_counts ───────────────────────────────────
CREATE TABLE IF NOT EXISTS day_end_closing_cash_counts (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  closing_payment_type_id TEXT NOT NULL REFERENCES day_end_closing_payment_types(id) ON DELETE CASCADE,
  one_cent                INTEGER NOT NULL DEFAULT 0,
  five_cent               INTEGER NOT NULL DEFAULT 0,
  ten_cent                INTEGER NOT NULL DEFAULT 0,
  twenty_five_cent        INTEGER NOT NULL DEFAULT 0,
  one_dollar              INTEGER NOT NULL DEFAULT 0,
  five_dollar             INTEGER NOT NULL DEFAULT 0,
  ten_dollar              INTEGER NOT NULL DEFAULT 0,
  twenty_dollar           INTEGER NOT NULL DEFAULT 0,
  fifty_dollar            INTEGER NOT NULL DEFAULT 0,
  hundred_dollar          INTEGER NOT NULL DEFAULT 0,
  total_amount_cents      INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_day_end_closing_cash_counts_tenant_payment_type
  ON day_end_closing_cash_counts (tenant_id, closing_payment_type_id);

ALTER TABLE day_end_closing_cash_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY day_end_closing_cash_counts_select ON day_end_closing_cash_counts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closing_cash_counts_insert ON day_end_closing_cash_counts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closing_cash_counts_update ON day_end_closing_cash_counts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY day_end_closing_cash_counts_delete ON day_end_closing_cash_counts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── terminal_location_tip_suggestions ─────────────────────────────
CREATE TABLE IF NOT EXISTS terminal_location_tip_suggestions (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  terminal_location_id    TEXT NOT NULL REFERENCES terminal_locations(id),
  tip_type                TEXT NOT NULL DEFAULT 'percentage',
  tip_percentage          NUMERIC(5,2),
  tip_amount_cents        INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_location_tip_suggestions_tenant_location
  ON terminal_location_tip_suggestions (tenant_id, terminal_location_id);

ALTER TABLE terminal_location_tip_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_location_tip_suggestions_select ON terminal_location_tip_suggestions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_location_tip_suggestions_insert ON terminal_location_tip_suggestions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_location_tip_suggestions_update ON terminal_location_tip_suggestions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_location_tip_suggestions_delete ON terminal_location_tip_suggestions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── terminal_location_floor_plans ─────────────────────────────────
CREATE TABLE IF NOT EXISTS terminal_location_floor_plans (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  terminal_location_id            TEXT NOT NULL REFERENCES terminal_locations(id),
  additional_terminal_location_id TEXT NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_location_floor_plans_tenant_location
  ON terminal_location_floor_plans (tenant_id, terminal_location_id);

ALTER TABLE terminal_location_floor_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_location_floor_plans_select ON terminal_location_floor_plans FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_location_floor_plans_insert ON terminal_location_floor_plans FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_location_floor_plans_update ON terminal_location_floor_plans FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY terminal_location_floor_plans_delete ON terminal_location_floor_plans FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── drawer_events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drawer_events (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  terminal_id     TEXT NOT NULL REFERENCES terminals(id),
  employee_id     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drawer_events_tenant_terminal_created
  ON drawer_events (tenant_id, terminal_id, created_at);

ALTER TABLE drawer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY drawer_events_select ON drawer_events FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY drawer_events_insert ON drawer_events FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY drawer_events_update ON drawer_events FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY drawer_events_delete ON drawer_events FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── register_notes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS register_notes (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  course_id       TEXT,
  note            TEXT NOT NULL,
  note_start_date DATE,
  note_end_date   DATE,
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

CREATE INDEX IF NOT EXISTS idx_register_notes_tenant ON register_notes (tenant_id);

ALTER TABLE register_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY register_notes_select ON register_notes FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY register_notes_insert ON register_notes FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY register_notes_update ON register_notes FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY register_notes_delete ON register_notes FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── printers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS printers (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  title           TEXT NOT NULL,
  tag             TEXT,
  mac_address     TEXT,
  serial_number   TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_printers_tenant ON printers (tenant_id);

ALTER TABLE printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY printers_select ON printers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY printers_insert ON printers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY printers_update ON printers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY printers_delete ON printers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── print_jobs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS print_jobs (
  id                              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id),
  printer_id                      TEXT REFERENCES printers(id),
  order_id                        TEXT,
  order_detail_preparation_id     TEXT,
  print_job_type                  TEXT NOT NULL,
  is_printed                      BOOLEAN NOT NULL DEFAULT false,
  printed_at                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_printer_printed
  ON print_jobs (tenant_id, printer_id, is_printed);
CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_order
  ON print_jobs (tenant_id, order_id) WHERE order_id IS NOT NULL;

ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY print_jobs_select ON print_jobs FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY print_jobs_insert ON print_jobs FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY print_jobs_update ON print_jobs FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY print_jobs_delete ON print_jobs FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
