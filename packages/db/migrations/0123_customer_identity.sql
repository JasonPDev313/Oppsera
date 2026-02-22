-- Migration 0123: Customer Identity & Multi-Contact Support
-- Customer 360 Session 1: Structured contact tables for club/hospitality management

-- ── Extend customers table ─────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS member_number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referred_by_customer_id TEXT REFERENCES customers(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes_summary TEXT;

-- Partial unique index: member_number unique per tenant (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_member_number
  ON customers(tenant_id, member_number)
  WHERE member_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_member_number
  ON customers(tenant_id, member_number)
  WHERE member_number IS NOT NULL;

-- ── customer_emails ────────────────────────────────────────────────
CREATE TABLE customer_emails (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal',  -- personal | billing | spouse | corporate | other
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  can_receive_statements BOOLEAN NOT NULL DEFAULT true,
  can_receive_marketing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_emails_tenant_customer ON customer_emails(tenant_id, customer_id);
CREATE INDEX idx_customer_emails_normalized ON customer_emails(tenant_id, email_normalized);
CREATE UNIQUE INDEX uq_customer_emails_tenant_normalized ON customer_emails(tenant_id, email_normalized);

-- ── customer_phones ────────────────────────────────────────────────
CREATE TABLE customer_phones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  phone_e164 TEXT NOT NULL,
  phone_display TEXT,
  type TEXT NOT NULL DEFAULT 'mobile',  -- mobile | home | work | sms | other
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  can_receive_sms BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_phones_tenant_customer ON customer_phones(tenant_id, customer_id);
CREATE INDEX idx_customer_phones_e164 ON customer_phones(tenant_id, phone_e164);

-- ── customer_addresses ─────────────────────────────────────────────
-- Replace the legacy customer_addresses table with an enhanced version
DROP TABLE IF EXISTS customer_addresses CASCADE;
CREATE TABLE customer_addresses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL DEFAULT 'mailing',  -- mailing | billing | home | work | seasonal | other
  label TEXT,
  line1 TEXT NOT NULL,
  line2 TEXT,
  line3 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT,
  county TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  seasonal_start_month INTEGER,  -- 1-12 for seasonal addresses
  seasonal_end_month INTEGER,    -- 1-12 for seasonal addresses
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_addresses_tenant_customer ON customer_addresses(tenant_id, customer_id);
CREATE INDEX idx_customer_addresses_postal ON customer_addresses(tenant_id, postal_code)
  WHERE postal_code IS NOT NULL;

-- ── customer_emergency_contacts_v2 ─────────────────────────────────
-- Replaces the single emergency_contact_name/phone columns on customers
CREATE TABLE customer_emergency_contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  name TEXT NOT NULL,
  relationship TEXT,
  phone_e164 TEXT NOT NULL,
  phone_display TEXT,
  email TEXT,
  notes TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_emergency_contacts_tenant_customer
  ON customer_emergency_contacts(tenant_id, customer_id);

-- ── RLS: customer_emails ───────────────────────────────────────────
ALTER TABLE customer_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_emails FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_emails_select ON customer_emails
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_emails_insert ON customer_emails
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_emails_update ON customer_emails
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_emails_delete ON customer_emails
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── RLS: customer_phones ───────────────────────────────────────────
ALTER TABLE customer_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_phones FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_phones_select ON customer_phones
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_phones_insert ON customer_phones
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_phones_update ON customer_phones
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_phones_delete ON customer_phones
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── RLS: customer_addresses ────────────────────────────────────────
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_addresses_select ON customer_addresses
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_addresses_insert ON customer_addresses
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_addresses_update ON customer_addresses
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_addresses_delete ON customer_addresses
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));

-- ── RLS: customer_emergency_contacts ───────────────────────────────
ALTER TABLE customer_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_emergency_contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_emergency_contacts_select ON customer_emergency_contacts
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_emergency_contacts_insert ON customer_emergency_contacts
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_emergency_contacts_update ON customer_emergency_contacts
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_emergency_contacts_delete ON customer_emergency_contacts
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
