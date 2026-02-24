-- ═══════════════════════════════════════════════════════════════════
-- Migration 0137: Guest Pay — Pay at the Table via QR Code
-- 4 tables: sessions, payment attempts, tip settings, audit log
-- ═══════════════════════════════════════════════════════════════════

-- ── Guest Pay Sessions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guest_pay_sessions (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  location_id           TEXT NOT NULL REFERENCES locations(id),
  tab_id                TEXT NOT NULL,
  order_id              TEXT,
  server_user_id        TEXT,
  token                 TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active',
  subtotal_cents        INTEGER NOT NULL DEFAULT 0,
  tax_cents             INTEGER NOT NULL DEFAULT 0,
  service_charge_cents  INTEGER NOT NULL DEFAULT 0,
  discount_cents        INTEGER NOT NULL DEFAULT 0,
  total_cents           INTEGER NOT NULL DEFAULT 0,
  tip_cents             INTEGER,
  tip_percentage        NUMERIC(5,2),
  tip_base_cents        INTEGER,
  tip_settings_snapshot JSONB,
  table_number          TEXT,
  party_size            INTEGER,
  restaurant_name       TEXT,
  expires_at            TIMESTAMPTZ NOT NULL,
  paid_at               TIMESTAMPTZ,
  superseded_by_id      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_pay_sessions_token
  ON guest_pay_sessions (token);
CREATE INDEX IF NOT EXISTS idx_guest_pay_sessions_tenant_tab_status
  ON guest_pay_sessions (tenant_id, tab_id, status);
CREATE INDEX IF NOT EXISTS idx_guest_pay_sessions_status_expires
  ON guest_pay_sessions (status, expires_at) WHERE status = 'active';

ALTER TABLE guest_pay_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_pay_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY guest_pay_sessions_select ON guest_pay_sessions
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_sessions_insert ON guest_pay_sessions
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_sessions_update ON guest_pay_sessions
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_sessions_delete ON guest_pay_sessions
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── Guest Pay Payment Attempts ───────────────────────────────────

CREATE TABLE IF NOT EXISTS guest_pay_payment_attempts (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  session_id      TEXT NOT NULL REFERENCES guest_pay_sessions(id),
  amount_cents    INTEGER NOT NULL,
  tip_cents       INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  payment_method  TEXT NOT NULL DEFAULT 'simulated',
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_pay_attempts_tenant_session
  ON guest_pay_payment_attempts (tenant_id, session_id);

ALTER TABLE guest_pay_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_pay_payment_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY guest_pay_payment_attempts_select ON guest_pay_payment_attempts
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_payment_attempts_insert ON guest_pay_payment_attempts
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_payment_attempts_update ON guest_pay_payment_attempts
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_payment_attempts_delete ON guest_pay_payment_attempts
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── Guest Pay Tip Settings ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS guest_pay_tip_settings (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  location_id             TEXT NOT NULL REFERENCES locations(id),
  is_active               BOOLEAN NOT NULL DEFAULT true,
  tip_type                TEXT NOT NULL DEFAULT 'percentage',
  tip_presets             JSONB NOT NULL DEFAULT '[15, 20, 25]'::jsonb,
  allow_custom_tip        BOOLEAN NOT NULL DEFAULT true,
  allow_no_tip            BOOLEAN NOT NULL DEFAULT true,
  default_tip_index       INTEGER,
  tip_calculation_base    TEXT NOT NULL DEFAULT 'subtotal_pre_tax',
  rounding_mode           TEXT NOT NULL DEFAULT 'nearest_cent',
  max_tip_percent         INTEGER NOT NULL DEFAULT 100,
  max_tip_amount_cents    INTEGER NOT NULL DEFAULT 100000,
  session_expiry_minutes  INTEGER NOT NULL DEFAULT 60,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_pay_tip_settings_tenant_location
  ON guest_pay_tip_settings (tenant_id, location_id);

ALTER TABLE guest_pay_tip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_pay_tip_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY guest_pay_tip_settings_select ON guest_pay_tip_settings
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_tip_settings_insert ON guest_pay_tip_settings
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_tip_settings_update ON guest_pay_tip_settings
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_tip_settings_delete ON guest_pay_tip_settings
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── Guest Pay Audit Log (append-only) ────────────────────────────

CREATE TABLE IF NOT EXISTS guest_pay_audit_log (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  session_id  TEXT NOT NULL REFERENCES guest_pay_sessions(id),
  action      TEXT NOT NULL,
  actor_type  TEXT NOT NULL,
  actor_id    TEXT,
  metadata    JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_pay_audit_tenant_session
  ON guest_pay_audit_log (tenant_id, session_id);

ALTER TABLE guest_pay_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_pay_audit_log FORCE ROW LEVEL SECURITY;

-- Append-only: SELECT + INSERT only (no UPDATE or DELETE policies)
CREATE POLICY guest_pay_audit_log_select ON guest_pay_audit_log
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY guest_pay_audit_log_insert ON guest_pay_audit_log
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
