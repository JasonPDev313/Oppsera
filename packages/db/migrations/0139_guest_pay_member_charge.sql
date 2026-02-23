-- Migration: Guest Pay Member House Account Charging
-- Adds member linkage to sessions + attempts, creates email 2FA verifications table.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Add member columns to guest_pay_sessions
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE guest_pay_sessions
  ADD COLUMN IF NOT EXISTS member_id TEXT,
  ADD COLUMN IF NOT EXISTS member_display_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_account_id TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Add member columns to guest_pay_payment_attempts
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE guest_pay_payment_attempts
  ADD COLUMN IF NOT EXISTS member_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_account_id TEXT,
  ADD COLUMN IF NOT EXISTS member_display_name TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Create guest_pay_member_verifications table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS guest_pay_member_verifications (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  session_id      TEXT NOT NULL REFERENCES guest_pay_sessions(id),
  customer_id     TEXT NOT NULL,
  billing_account_id TEXT NOT NULL,
  member_display_name TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  email_sent_to   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts_remaining INTEGER NOT NULL DEFAULT 3,
  expires_at      TIMESTAMPTZ NOT NULL,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guest_pay_verifications_tenant_session_status
  ON guest_pay_member_verifications (tenant_id, session_id, status);

-- ═══════════════════════════════════════════════════════════════════
-- 4. RLS for guest_pay_member_verifications
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE guest_pay_member_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_pay_member_verifications FORCE ROW LEVEL SECURITY;

CREATE POLICY guest_pay_member_verifications_select ON guest_pay_member_verifications
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY guest_pay_member_verifications_insert ON guest_pay_member_verifications
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY guest_pay_member_verifications_update ON guest_pay_member_verifications
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY guest_pay_member_verifications_delete ON guest_pay_member_verifications
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
