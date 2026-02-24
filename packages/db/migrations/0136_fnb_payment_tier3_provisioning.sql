-- ═══════════════════════════════════════════════════════════════════
-- Migration 0136: F&B Payment Tier 3 Feature Provisioning
-- Adds schema-only tables for future competitive differentiators:
--   9A: QR Code Pay-at-Table
--   9B: Guest-Facing Tip Screen
--   9C: Loyalty Point Redemption
--   9D: NFC Tap-to-Pay on Server Device
--   9E: Automatic Round-Up Donation
--   9G: Fractional Item Split
-- ═══════════════════════════════════════════════════════════════════

-- ── 9A: QR Code Pay-at-Table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS fnb_qr_payment_requests (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  tab_id        TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  qr_token      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  amount_cents  INTEGER NOT NULL,
  tip_cents     INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_qr_token
  ON fnb_qr_payment_requests (qr_token);
CREATE INDEX IF NOT EXISTS idx_fnb_qr_payment_tab
  ON fnb_qr_payment_requests (tenant_id, tab_id);

ALTER TABLE fnb_qr_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_qr_payment_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_qr_payment_requests_select ON fnb_qr_payment_requests
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_qr_payment_requests_insert ON fnb_qr_payment_requests
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_qr_payment_requests_update ON fnb_qr_payment_requests
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_qr_payment_requests_delete ON fnb_qr_payment_requests
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── 9B: Guest-Facing Tip Screen ──────────────────────────────────

CREATE TABLE IF NOT EXISTS fnb_guest_tip_sessions (
  id                       TEXT PRIMARY KEY,
  tenant_id                TEXT NOT NULL REFERENCES tenants(id),
  tab_id                   TEXT NOT NULL,
  session_id               TEXT NOT NULL,
  device_token             TEXT NOT NULL,
  selected_tip_cents       INTEGER,
  selected_tip_percentage  NUMERIC(5,2),
  status                   TEXT NOT NULL DEFAULT 'waiting',
  expires_at               TIMESTAMPTZ NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_guest_tip_tab
  ON fnb_guest_tip_sessions (tenant_id, tab_id);

ALTER TABLE fnb_guest_tip_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_guest_tip_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_guest_tip_sessions_select ON fnb_guest_tip_sessions
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_guest_tip_sessions_insert ON fnb_guest_tip_sessions
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_guest_tip_sessions_update ON fnb_guest_tip_sessions
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_guest_tip_sessions_delete ON fnb_guest_tip_sessions
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── 9C: Loyalty Point Redemption ─────────────────────────────────

CREATE TABLE IF NOT EXISTS fnb_loyalty_redemptions (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  tab_id            TEXT NOT NULL,
  tender_id         TEXT NOT NULL,
  customer_id       TEXT NOT NULL,
  points_redeemed   INTEGER NOT NULL,
  dollar_value_cents INTEGER NOT NULL,
  balance_before    INTEGER NOT NULL,
  balance_after     INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_loyalty_tab
  ON fnb_loyalty_redemptions (tenant_id, tab_id);
CREATE INDEX IF NOT EXISTS idx_fnb_loyalty_customer
  ON fnb_loyalty_redemptions (tenant_id, customer_id);

ALTER TABLE fnb_loyalty_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_loyalty_redemptions FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_loyalty_redemptions_select ON fnb_loyalty_redemptions
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_loyalty_redemptions_insert ON fnb_loyalty_redemptions
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_loyalty_redemptions_update ON fnb_loyalty_redemptions
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_loyalty_redemptions_delete ON fnb_loyalty_redemptions
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── 9D: NFC Tap-to-Pay on Server Device ──────────────────────────

CREATE TABLE IF NOT EXISTS fnb_nfc_payment_intents (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  tab_id              TEXT NOT NULL,
  session_id          TEXT NOT NULL,
  terminal_id         TEXT NOT NULL,
  amount_cents        INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'initiated',
  nfc_transaction_id  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_nfc_tab
  ON fnb_nfc_payment_intents (tenant_id, tab_id);

ALTER TABLE fnb_nfc_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_nfc_payment_intents FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_nfc_payment_intents_select ON fnb_nfc_payment_intents
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_nfc_payment_intents_insert ON fnb_nfc_payment_intents
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_nfc_payment_intents_update ON fnb_nfc_payment_intents
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_nfc_payment_intents_delete ON fnb_nfc_payment_intents
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── 9E: Automatic Round-Up Donation ──────────────────────────────

CREATE TABLE IF NOT EXISTS fnb_donation_config (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  location_id       TEXT NOT NULL REFERENCES locations(id),
  charity_name      TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  round_up_enabled  BOOLEAN NOT NULL DEFAULT true,
  fixed_amount_cents INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_donation_config_loc
  ON fnb_donation_config (tenant_id, location_id);

ALTER TABLE fnb_donation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_donation_config FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_donation_config_select ON fnb_donation_config
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_donation_config_insert ON fnb_donation_config
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_donation_config_update ON fnb_donation_config
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_donation_config_delete ON fnb_donation_config
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


CREATE TABLE IF NOT EXISTS fnb_donation_entries (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  tab_id          TEXT NOT NULL,
  tender_id       TEXT NOT NULL,
  donation_cents  INTEGER NOT NULL,
  charity_name    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_donation_tab
  ON fnb_donation_entries (tenant_id, tab_id);

ALTER TABLE fnb_donation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_donation_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_donation_entries_select ON fnb_donation_entries
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_donation_entries_insert ON fnb_donation_entries
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_donation_entries_update ON fnb_donation_entries
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_donation_entries_delete ON fnb_donation_entries
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── 9G: Fractional Item Split ────────────────────────────────────

CREATE TABLE IF NOT EXISTS fnb_split_item_fractions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  split_check_id  TEXT NOT NULL,
  order_line_id   TEXT NOT NULL,
  fraction        NUMERIC(5,4) NOT NULL,
  amount_cents    INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_split_fractions_check
  ON fnb_split_item_fractions (tenant_id, split_check_id);

ALTER TABLE fnb_split_item_fractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_split_item_fractions FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_split_item_fractions_select ON fnb_split_item_fractions
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_split_item_fractions_insert ON fnb_split_item_fractions
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_split_item_fractions_update ON fnb_split_item_fractions
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
CREATE POLICY fnb_split_item_fractions_delete ON fnb_split_item_fractions
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
