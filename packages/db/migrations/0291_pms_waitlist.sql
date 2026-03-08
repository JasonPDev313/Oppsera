-- ══════════════════════════════════════════════════════════════════
-- PMS Waitlist — Room availability waitlist with smart matching
-- ══════════════════════════════════════════════════════════════════

-- ── Waitlist entries ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_waitlist (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  property_id           TEXT NOT NULL,
  guest_id              TEXT,
  -- Guest info for public (non-authenticated) entries
  guest_name            TEXT,
  guest_email           TEXT,
  guest_phone           TEXT,
  -- Room preferences
  room_type_id          TEXT,
  adults                INTEGER NOT NULL DEFAULT 1,
  children              INTEGER NOT NULL DEFAULT 0,
  -- Date preferences
  check_in_date         DATE,
  check_out_date        DATE,
  -- Flexibility
  flexibility           TEXT NOT NULL DEFAULT 'flexible_3_days',
  -- Status lifecycle: waiting → offered → booked | expired | canceled
  status                TEXT NOT NULL DEFAULT 'waiting',
  -- Offer tracking
  offered_reservation_id TEXT,
  offered_rate_cents    INTEGER,
  offer_expires_at      TIMESTAMPTZ,
  -- Priority & scoring
  priority              INTEGER NOT NULL DEFAULT 0,
  loyalty_tier          TEXT,
  has_deposit           BOOLEAN NOT NULL DEFAULT FALSE,
  -- Rate lock: snapshot the rate when they joined
  rate_lock_cents       INTEGER,
  rate_plan_id          TEXT,
  -- Notes & metadata
  notes                 TEXT,
  source                TEXT NOT NULL DEFAULT 'direct',
  -- Guest token for public status tracking
  guest_token           TEXT,
  -- Lifecycle
  notified_at           TIMESTAMPTZ,
  booked_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT
);

CREATE INDEX IF NOT EXISTS idx_pms_waitlist_tenant ON pms_waitlist(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pms_waitlist_property ON pms_waitlist(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_pms_waitlist_status ON pms_waitlist(tenant_id, property_id, status);
CREATE INDEX IF NOT EXISTS idx_pms_waitlist_guest ON pms_waitlist(tenant_id, guest_id);
CREATE INDEX IF NOT EXISTS idx_pms_waitlist_room_type ON pms_waitlist(tenant_id, property_id, room_type_id, status);
CREATE INDEX IF NOT EXISTS idx_pms_waitlist_dates ON pms_waitlist(tenant_id, property_id, check_in_date, check_out_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_waitlist_token ON pms_waitlist(guest_token) WHERE guest_token IS NOT NULL;

-- RLS
ALTER TABLE pms_waitlist ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_waitlist' AND policyname = 'pms_waitlist_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY pms_waitlist_tenant_isolation ON pms_waitlist USING (tenant_id = current_setting(''app.current_tenant_id'', true))';
  END IF;
END $$;

-- ── Waitlist configuration (per property) ───────────────────────
CREATE TABLE IF NOT EXISTS pms_waitlist_config (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  property_id           TEXT NOT NULL,
  -- Feature toggle
  is_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  -- Offer settings
  offer_expiry_hours    INTEGER NOT NULL DEFAULT 24,
  max_offers_per_slot   INTEGER NOT NULL DEFAULT 3,
  auto_offer_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Guest-facing webapp branding
  welcome_headline      TEXT NOT NULL DEFAULT 'Room Waitlist',
  welcome_subtitle      TEXT NOT NULL DEFAULT 'Get notified when your preferred room becomes available.',
  logo_url              TEXT,
  primary_color         TEXT NOT NULL DEFAULT '#6366f1',
  secondary_color       TEXT NOT NULL DEFAULT '#3b82f6',
  accent_color          TEXT NOT NULL DEFAULT '#10b981',
  font_family           TEXT NOT NULL DEFAULT 'system-ui, sans-serif',
  footer_text           TEXT,
  -- Form configuration
  require_email         BOOLEAN NOT NULL DEFAULT TRUE,
  require_phone         BOOLEAN NOT NULL DEFAULT FALSE,
  show_rates            BOOLEAN NOT NULL DEFAULT TRUE,
  max_advance_days      INTEGER NOT NULL DEFAULT 365,
  terms_text            TEXT,
  -- Notification templates
  offer_sms_template    TEXT,
  offer_email_subject   TEXT DEFAULT 'Great news — your room is available!',
  offer_email_template  TEXT,
  confirmation_template TEXT,
  -- Lifecycle
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, property_id)
);

ALTER TABLE pms_waitlist_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pms_waitlist_config' AND policyname = 'pms_waitlist_config_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY pms_waitlist_config_tenant_isolation ON pms_waitlist_config USING (tenant_id = current_setting(''app.current_tenant_id'', true))';
  END IF;
END $$;
