-- Migration: 0014_customer_profile_extension
-- Session 16.5: Universal Customer Profile
-- Extends the customers module with new profile columns and 21 new tables:
-- customer_contacts, customer_preferences, customer_documents, customer_communications,
-- customer_service_flags, customer_consents, customer_external_ids, customer_auth_accounts,
-- customer_wallet_accounts, customer_alerts, customer_scores, customer_metrics_daily,
-- customer_metrics_lifetime, customer_merge_history, customer_households,
-- customer_household_members, customer_visits, customer_incidents, customer_segments,
-- customer_segment_memberships, customer_payment_methods

-- ══════════════════════════════════════════════════════════════════
-- Part 1: ALTER customers table — add new profile columns
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS anniversary DATE,
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
  ADD COLUMN IF NOT EXISTS communication_opt_ins JSONB NOT NULL DEFAULT '{"email": false, "sms": false, "push": false}',
  ADD COLUMN IF NOT EXISTS risk_flags JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS compliance_data JSONB,
  ADD COLUMN IF NOT EXISTS ai_fields JSONB,
  ADD COLUMN IF NOT EXISTS behavioral_profile JSONB,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS wallet_balance_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS do_not_contact_reasons JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS preferred_time_of_day TEXT,
  ADD COLUMN IF NOT EXISTS preferred_channel_priority JSONB,
  ADD COLUMN IF NOT EXISTS loyalty_tier TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_points_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_enrollment_date DATE,
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT,
  ADD COLUMN IF NOT EXISTS referral_source TEXT,
  ADD COLUMN IF NOT EXISTS campaign_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_data JSONB,
  ADD COLUMN IF NOT EXISTS last_staff_interaction_id TEXT,
  ADD COLUMN IF NOT EXISTS favorite_staff_id TEXT,
  ADD COLUMN IF NOT EXISTS social_media_handles JSONB,
  ADD COLUMN IF NOT EXISTS handicap_index NUMERIC(4,1);

CREATE INDEX idx_customers_tenant_status ON customers(tenant_id, status);

-- ══════════════════════════════════════════════════════════════════
-- Part 2: ALTER billing_account_members — add permissions column
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE billing_account_members
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{"canCharge": true, "canViewStatements": false, "canManageMembers": false, "canEditProfile": false}';

-- ══════════════════════════════════════════════════════════════════
-- Part 3: New tables
-- ══════════════════════════════════════════════════════════════════

-- ── customer_contacts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_contacts (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  contact_type TEXT NOT NULL,
  label TEXT,
  value TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_contacts_tenant_customer_type ON customer_contacts(tenant_id, customer_id, contact_type);

-- ── customer_preferences ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence NUMERIC(3,2),
  inference_version TEXT,
  last_inferred_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE INDEX idx_customer_preferences_tenant_customer_cat ON customer_preferences(tenant_id, customer_id, category);
CREATE UNIQUE INDEX uq_customer_preferences_tenant_customer_cat_key ON customer_preferences(tenant_id, customer_id, category, key);

-- ── customer_documents ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_documents (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  document_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_customer_documents_tenant_customer_type ON customer_documents(tenant_id, customer_id, document_type);

-- ── customer_communications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_communications (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  subject TEXT,
  body TEXT,
  campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX idx_customer_communications_tenant_customer_created ON customer_communications(tenant_id, customer_id, created_at DESC);
CREATE INDEX idx_customer_communications_tenant_channel_status ON customer_communications(tenant_id, channel, status);

-- ── customer_service_flags ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_service_flags (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_customer_service_flags_tenant_customer ON customer_service_flags(tenant_id, customer_id);
CREATE INDEX idx_customer_service_flags_tenant_type ON customer_service_flags(tenant_id, flag_type);

-- ── customer_consents ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_consents (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  consent_type TEXT NOT NULL,
  status TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  ip_address TEXT,
  document_id TEXT
);

CREATE INDEX idx_customer_consents_tenant_customer_type ON customer_consents(tenant_id, customer_id, consent_type);
CREATE UNIQUE INDEX uq_customer_consents_tenant_customer_type ON customer_consents(tenant_id, customer_id, consent_type);

-- ── customer_external_ids ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_external_ids (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_customer_external_ids_tenant_provider_ext ON customer_external_ids(tenant_id, provider, external_id);
CREATE INDEX idx_customer_external_ids_tenant_customer_provider ON customer_external_ids(tenant_id, customer_id, provider);

-- ── customer_auth_accounts ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_auth_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  provider TEXT NOT NULL,
  auth_provider_user_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_customer_auth_accounts_tenant_customer_provider ON customer_auth_accounts(tenant_id, customer_id, provider);

-- ── customer_wallet_accounts ────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_wallet_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  wallet_type TEXT NOT NULL,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  external_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_wallet_accounts_tenant_customer_type ON customer_wallet_accounts(tenant_id, customer_id, wallet_type);
CREATE INDEX idx_customer_wallet_accounts_tenant_customer_status ON customer_wallet_accounts(tenant_id, customer_id, status);

-- ── customer_alerts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_alerts (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  dismissed_by TEXT
);

CREATE INDEX idx_customer_alerts_tenant_customer_active ON customer_alerts(tenant_id, customer_id, is_active);
CREATE INDEX idx_customer_alerts_tenant_type_active ON customer_alerts(tenant_id, alert_type, is_active);

-- ── customer_scores ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_scores (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  score_type TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_version TEXT,
  metadata JSONB
);

CREATE UNIQUE INDEX uq_customer_scores_tenant_customer_type ON customer_scores(tenant_id, customer_id, score_type);
CREATE INDEX idx_customer_scores_tenant_type_score ON customer_scores(tenant_id, score_type, score DESC);

-- ── customer_metrics_daily ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_metrics_daily (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  date DATE NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  spend_cents INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  category_breakdown JSONB NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX uq_customer_metrics_daily_tenant_customer_date ON customer_metrics_daily(tenant_id, customer_id, date);
CREATE INDEX idx_customer_metrics_daily_tenant_date ON customer_metrics_daily(tenant_id, date);

-- ── customer_metrics_lifetime ───────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_metrics_lifetime (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  total_visits INTEGER NOT NULL DEFAULT 0,
  total_spend_cents INTEGER NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  first_visit_at TIMESTAMPTZ,
  avg_spend_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_value_cents INTEGER NOT NULL DEFAULT 0,
  visit_frequency TEXT,
  avg_visit_duration_minutes INTEGER,
  top_category TEXT,
  category_breakdown JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_customer_metrics_lifetime_tenant_customer ON customer_metrics_lifetime(tenant_id, customer_id);

-- ── customer_merge_history ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_merge_history (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  primary_customer_id TEXT NOT NULL REFERENCES customers(id),
  merged_customer_id TEXT NOT NULL,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  merged_by TEXT NOT NULL,
  snapshot JSONB NOT NULL
);

CREATE INDEX idx_customer_merge_history_tenant_primary ON customer_merge_history(tenant_id, primary_customer_id);
CREATE INDEX idx_customer_merge_history_tenant_merged ON customer_merge_history(tenant_id, merged_customer_id);

-- ── customer_households ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_households (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  household_type TEXT NOT NULL,
  primary_customer_id TEXT NOT NULL REFERENCES customers(id),
  billing_account_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_households_tenant_primary ON customer_households(tenant_id, primary_customer_id);
CREATE INDEX idx_customer_households_tenant_type ON customer_households(tenant_id, household_type);

-- ── customer_household_members ──────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_household_members (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES customer_households(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  role TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_customer_household_members_tenant_household_customer ON customer_household_members(tenant_id, household_id, customer_id);
CREATE INDEX idx_customer_household_members_tenant_customer ON customer_household_members(tenant_id, customer_id);

-- ── customer_visits ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_visits (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  location TEXT,
  check_in_method TEXT NOT NULL DEFAULT 'manual',
  staff_id TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_visits_tenant_customer_checkin ON customer_visits(tenant_id, customer_id, check_in_at DESC);
CREATE INDEX idx_customer_visits_tenant_checkin ON customer_visits(tenant_id, check_in_at DESC);
CREATE INDEX idx_customer_visits_tenant_location_checkin ON customer_visits(tenant_id, location, check_in_at);

-- ── customer_incidents ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_incidents (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  subject TEXT NOT NULL,
  description TEXT,
  resolution TEXT,
  compensation_cents INTEGER,
  compensation_type TEXT,
  staff_involved_ids JSONB NOT NULL DEFAULT '[]',
  related_order_id TEXT,
  related_visit_id TEXT,
  reported_by TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_incidents_tenant_customer_created ON customer_incidents(tenant_id, customer_id, created_at DESC);
CREATE INDEX idx_customer_incidents_tenant_status ON customer_incidents(tenant_id, status);
CREATE INDEX idx_customer_incidents_tenant_type_created ON customer_incidents(tenant_id, incident_type, created_at);
CREATE INDEX idx_customer_incidents_tenant_severity ON customer_incidents(tenant_id, severity);

-- ── customer_segments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_segments (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  segment_type TEXT NOT NULL,
  rules JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE UNIQUE INDEX uq_customer_segments_tenant_name ON customer_segments(tenant_id, name);
CREATE INDEX idx_customer_segments_tenant_type_active ON customer_segments(tenant_id, segment_type, is_active);

-- ── customer_segment_memberships ────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_segment_memberships (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  segment_id TEXT NOT NULL REFERENCES customer_segments(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by TEXT,
  removed_at TIMESTAMPTZ
);

CREATE INDEX idx_customer_segment_memberships_tenant_segment_customer ON customer_segment_memberships(tenant_id, segment_id, customer_id);
CREATE INDEX idx_customer_segment_memberships_tenant_customer ON customer_segment_memberships(tenant_id, customer_id);

-- ── customer_payment_methods ────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_payment_methods (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  payment_type TEXT NOT NULL,
  token TEXT NOT NULL,
  brand TEXT,
  last4 TEXT,
  expiry_month INTEGER,
  expiry_year INTEGER,
  billing_account_id TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_payment_methods_tenant_customer_status ON customer_payment_methods(tenant_id, customer_id, status);
CREATE UNIQUE INDEX uq_customer_payment_methods_tenant_token ON customer_payment_methods(tenant_id, token);

-- ══════════════════════════════════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_service_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_metrics_lifetime ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_merge_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_households ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segment_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_methods ENABLE ROW LEVEL SECURITY;

-- customer_contacts
CREATE POLICY customer_contacts_select ON customer_contacts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_contacts_insert ON customer_contacts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_contacts_update ON customer_contacts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_contacts_delete ON customer_contacts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_preferences
CREATE POLICY customer_preferences_select ON customer_preferences FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_preferences_insert ON customer_preferences FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_preferences_update ON customer_preferences FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_preferences_delete ON customer_preferences FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_documents
CREATE POLICY customer_documents_select ON customer_documents FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_documents_insert ON customer_documents FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_documents_update ON customer_documents FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_documents_delete ON customer_documents FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_communications
CREATE POLICY customer_communications_select ON customer_communications FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_communications_insert ON customer_communications FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_communications_update ON customer_communications FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_communications_delete ON customer_communications FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_service_flags
CREATE POLICY customer_service_flags_select ON customer_service_flags FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_service_flags_insert ON customer_service_flags FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_service_flags_update ON customer_service_flags FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_service_flags_delete ON customer_service_flags FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_consents
CREATE POLICY customer_consents_select ON customer_consents FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_consents_insert ON customer_consents FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_consents_update ON customer_consents FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_consents_delete ON customer_consents FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_external_ids
CREATE POLICY customer_external_ids_select ON customer_external_ids FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_external_ids_insert ON customer_external_ids FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_external_ids_update ON customer_external_ids FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_external_ids_delete ON customer_external_ids FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_auth_accounts
CREATE POLICY customer_auth_accounts_select ON customer_auth_accounts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_auth_accounts_insert ON customer_auth_accounts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_auth_accounts_update ON customer_auth_accounts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_auth_accounts_delete ON customer_auth_accounts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_wallet_accounts
CREATE POLICY customer_wallet_accounts_select ON customer_wallet_accounts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_wallet_accounts_insert ON customer_wallet_accounts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_wallet_accounts_update ON customer_wallet_accounts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_wallet_accounts_delete ON customer_wallet_accounts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_alerts
CREATE POLICY customer_alerts_select ON customer_alerts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_alerts_insert ON customer_alerts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_alerts_update ON customer_alerts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_alerts_delete ON customer_alerts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_scores
CREATE POLICY customer_scores_select ON customer_scores FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_scores_insert ON customer_scores FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_scores_update ON customer_scores FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_scores_delete ON customer_scores FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_metrics_daily
CREATE POLICY customer_metrics_daily_select ON customer_metrics_daily FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_metrics_daily_insert ON customer_metrics_daily FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_metrics_daily_update ON customer_metrics_daily FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_metrics_daily_delete ON customer_metrics_daily FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_metrics_lifetime
CREATE POLICY customer_metrics_lifetime_select ON customer_metrics_lifetime FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_metrics_lifetime_insert ON customer_metrics_lifetime FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_metrics_lifetime_update ON customer_metrics_lifetime FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_metrics_lifetime_delete ON customer_metrics_lifetime FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_merge_history
CREATE POLICY customer_merge_history_select ON customer_merge_history FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_merge_history_insert ON customer_merge_history FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_merge_history_update ON customer_merge_history FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_merge_history_delete ON customer_merge_history FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_households
CREATE POLICY customer_households_select ON customer_households FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_households_insert ON customer_households FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_households_update ON customer_households FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_households_delete ON customer_households FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_household_members
CREATE POLICY customer_household_members_select ON customer_household_members FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_household_members_insert ON customer_household_members FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_household_members_update ON customer_household_members FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_household_members_delete ON customer_household_members FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_visits
CREATE POLICY customer_visits_select ON customer_visits FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_visits_insert ON customer_visits FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_visits_update ON customer_visits FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_visits_delete ON customer_visits FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_incidents
CREATE POLICY customer_incidents_select ON customer_incidents FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_incidents_insert ON customer_incidents FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_incidents_update ON customer_incidents FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_incidents_delete ON customer_incidents FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_segments
CREATE POLICY customer_segments_select ON customer_segments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_segments_insert ON customer_segments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_segments_update ON customer_segments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_segments_delete ON customer_segments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_segment_memberships
CREATE POLICY customer_segment_memberships_select ON customer_segment_memberships FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_segment_memberships_insert ON customer_segment_memberships FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_segment_memberships_update ON customer_segment_memberships FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_segment_memberships_delete ON customer_segment_memberships FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- customer_payment_methods
CREATE POLICY customer_payment_methods_select ON customer_payment_methods FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_payment_methods_insert ON customer_payment_methods FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_payment_methods_update ON customer_payment_methods FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_payment_methods_delete ON customer_payment_methods FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
