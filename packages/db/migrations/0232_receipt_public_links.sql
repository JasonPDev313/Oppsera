-- Receipt Public Links — Token-based digital receipt access
-- Supports QR code → digital receipt microsite with loyalty signup

-- ── receipt_public_links ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_public_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  order_id TEXT NOT NULL,
  token TEXT NOT NULL,
  lookup_code CHAR(6) NOT NULL,
  receipt_document_snapshot JSONB NOT NULL,
  variant TEXT NOT NULL DEFAULT 'standard',
  view_count INTEGER NOT NULL DEFAULT 0,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_public_links_token
  ON receipt_public_links(token);

CREATE INDEX IF NOT EXISTS idx_receipt_public_links_tenant_order
  ON receipt_public_links(tenant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_receipt_public_links_expires
  ON receipt_public_links(expires_at)
  WHERE is_active = true;

-- Partial unique on lookup_code per tenant (only active links)
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_public_links_tenant_lookup
  ON receipt_public_links(tenant_id, lookup_code)
  WHERE is_active = true;

-- RLS
ALTER TABLE receipt_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_public_links FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'receipt_public_links_select' AND tablename = 'receipt_public_links') THEN
    CREATE POLICY receipt_public_links_select ON receipt_public_links
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'receipt_public_links_insert' AND tablename = 'receipt_public_links') THEN
    CREATE POLICY receipt_public_links_insert ON receipt_public_links
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'receipt_public_links_update' AND tablename = 'receipt_public_links') THEN
    CREATE POLICY receipt_public_links_update ON receipt_public_links
      FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── receipt_emails ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_emails (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  receipt_link_id TEXT NOT NULL REFERENCES receipt_public_links(id),
  email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent'
);

CREATE INDEX IF NOT EXISTS idx_receipt_emails_tenant_link
  ON receipt_emails(tenant_id, receipt_link_id);

ALTER TABLE receipt_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_emails FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'receipt_emails_select' AND tablename = 'receipt_emails') THEN
    CREATE POLICY receipt_emails_select ON receipt_emails
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'receipt_emails_insert' AND tablename = 'receipt_emails') THEN
    CREATE POLICY receipt_emails_insert ON receipt_emails
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── receipt_loyalty_signups ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_loyalty_signups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  receipt_link_id TEXT NOT NULL REFERENCES receipt_public_links(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  opted_in_marketing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_loyalty_signups_tenant_link
  ON receipt_loyalty_signups(tenant_id, receipt_link_id);

ALTER TABLE receipt_loyalty_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_loyalty_signups FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'receipt_loyalty_signups_select' AND tablename = 'receipt_loyalty_signups') THEN
    CREATE POLICY receipt_loyalty_signups_select ON receipt_loyalty_signups
      FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'receipt_loyalty_signups_insert' AND tablename = 'receipt_loyalty_signups') THEN
    CREATE POLICY receipt_loyalty_signups_insert ON receipt_loyalty_signups
      FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
