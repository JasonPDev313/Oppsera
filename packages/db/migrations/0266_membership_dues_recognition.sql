-- Migration 0266: Membership Dues Revenue Recognition
-- Adds tracking tables for ASC 606 straight-line recognition of membership dues.

-- ── Schedule table (one row per billing charge) ──────────────────
CREATE TABLE IF NOT EXISTS membership_dues_recognition_schedule (
  id                             text PRIMARY KEY,
  tenant_id                      text NOT NULL REFERENCES tenants(id),
  subscription_id                text NOT NULL REFERENCES membership_subscriptions(id),
  billing_source_ref             text NOT NULL,
  revenue_gl_account_id          text NOT NULL,
  deferred_revenue_gl_account_id text NOT NULL,
  customer_id                    text,
  location_id                    text,
  billing_period_start           date NOT NULL,
  billing_period_end             date NOT NULL,
  total_amount_cents             integer NOT NULL,
  recognized_amount_cents        integer NOT NULL DEFAULT 0,
  status                         text NOT NULL DEFAULT 'active',
  last_recognized_date           date,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mdrs_status CHECK (status IN ('active', 'fully_recognized')),
  CONSTRAINT chk_mdrs_total_cents CHECK (total_amount_cents >= 0),
  CONSTRAINT chk_mdrs_recognized_cents CHECK (recognized_amount_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mdrs_tenant_billing_ref
  ON membership_dues_recognition_schedule(tenant_id, billing_source_ref);

CREATE INDEX IF NOT EXISTS idx_mdrs_tenant_status
  ON membership_dues_recognition_schedule(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_mdrs_tenant_period
  ON membership_dues_recognition_schedule(tenant_id, billing_period_end);

CREATE INDEX IF NOT EXISTS idx_mdrs_tenant_subscription
  ON membership_dues_recognition_schedule(tenant_id, subscription_id);

-- ── Entries table (one row per recognition event, append-only) ───
CREATE TABLE IF NOT EXISTS membership_dues_recognition_entries (
  id                             text PRIMARY KEY,
  tenant_id                      text NOT NULL REFERENCES tenants(id),
  schedule_id                    text NOT NULL REFERENCES membership_dues_recognition_schedule(id),
  recognition_date               date NOT NULL,
  recognized_cents               integer NOT NULL,
  cumulative_recognized_cents    integer NOT NULL,
  gl_journal_entry_id            text,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mdre_recognized_cents CHECK (recognized_cents > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mdre_schedule_date
  ON membership_dues_recognition_entries(tenant_id, schedule_id, recognition_date);

CREATE INDEX IF NOT EXISTS idx_mdre_tenant_schedule
  ON membership_dues_recognition_entries(tenant_id, schedule_id);

CREATE INDEX IF NOT EXISTS idx_mdre_tenant_date
  ON membership_dues_recognition_entries(tenant_id, recognition_date);
