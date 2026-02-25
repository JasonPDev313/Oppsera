-- Migration 0193: Tenant Business Info + Content Blocks
-- Stores core identity, operations profile, online presence, and marketing content per tenant.

-- ── Tenant Business Info ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_business_info (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Section 1: Business Information
  organization_name   TEXT,
  timezone            TEXT,
  address_line1       TEXT,
  address_line2       TEXT,
  city                TEXT,
  state               TEXT,
  postal_code         TEXT,
  country             TEXT NOT NULL DEFAULT 'US',
  primary_phone       TEXT,
  primary_email       TEXT,
  logo_url            TEXT,

  -- Section 2: Operations
  access_type             TEXT,            -- public, private, members_only, appointment_only, hybrid
  services_offered        JSONB NOT NULL DEFAULT '[]',  -- string[]
  products_offered        JSONB NOT NULL DEFAULT '[]',  -- string[]
  rentals_available       TEXT,            -- none, equipment, space, vehicles, multiple
  food_and_beverage       TEXT,            -- none, vending_only, limited_menu, full_service, catering
  promotions_description  TEXT,
  customer_access_policy  TEXT,

  -- Section 3: Online Presence — Core Links
  website_url         TEXT,
  booking_url         TEXT,
  portal_url          TEXT,

  -- Section 3: Online Presence — Social & Listings (JSONB for flexibility)
  social_links        JSONB NOT NULL DEFAULT '{}',
  -- Expected shape: { facebook?: string, instagram?: string, x?: string, linkedin?: string,
  --   youtube?: string, tiktok?: string, threads?: string, pinterest?: string,
  --   snapchat?: string, google_business?: string, whatsapp?: string, yelp?: string, tripadvisor?: string }

  -- Section 5: Advanced — Contact Extensions
  secondary_phone     TEXT,
  support_email       TEXT,
  fax_number          TEXT,

  -- Section 5: Advanced — Business Metadata
  industry_type       TEXT,
  business_hours      JSONB NOT NULL DEFAULT '{}',
  -- Expected shape: { mon: { closed: boolean, periods: [{ open: "09:00", close: "17:00" }] }, tue: ... }
  year_established    INTEGER,
  tax_id_encrypted    TEXT,              -- AES-256-GCM encrypted

  -- Section 5: Advanced — Media
  photo_gallery       JSONB NOT NULL DEFAULT '[]',  -- { url: string, caption?: string, sortOrder: number }[]
  promo_video_url     TEXT,

  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- One row per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_business_info_tenant
  ON tenant_business_info (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_business_info_tenant
  ON tenant_business_info (tenant_id);

-- ── Tenant Content Blocks ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_content_blocks (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  block_key     TEXT NOT NULL,            -- 'about', 'services_events', 'promotions', 'team'
  content       TEXT NOT NULL DEFAULT '', -- HTML or markdown
  updated_by    TEXT,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_content_blocks_key
  ON tenant_content_blocks (tenant_id, block_key);

CREATE INDEX IF NOT EXISTS idx_tenant_content_blocks_tenant
  ON tenant_content_blocks (tenant_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE tenant_business_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_business_info FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_content_blocks FORCE ROW LEVEL SECURITY;

-- Business Info RLS
DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_business_info_select ON tenant_business_info;
  CREATE POLICY tenant_business_info_select ON tenant_business_info
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS tenant_business_info_insert ON tenant_business_info;
  CREATE POLICY tenant_business_info_insert ON tenant_business_info
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS tenant_business_info_update ON tenant_business_info;
  CREATE POLICY tenant_business_info_update ON tenant_business_info
    FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)))
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS tenant_business_info_delete ON tenant_business_info;
  CREATE POLICY tenant_business_info_delete ON tenant_business_info
    FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END $$;

-- Content Blocks RLS
DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_content_blocks_select ON tenant_content_blocks;
  CREATE POLICY tenant_content_blocks_select ON tenant_content_blocks
    FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS tenant_content_blocks_insert ON tenant_content_blocks;
  CREATE POLICY tenant_content_blocks_insert ON tenant_content_blocks
    FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS tenant_content_blocks_update ON tenant_content_blocks;
  CREATE POLICY tenant_content_blocks_update ON tenant_content_blocks
    FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)))
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  DROP POLICY IF EXISTS tenant_content_blocks_delete ON tenant_content_blocks;
  CREATE POLICY tenant_content_blocks_delete ON tenant_content_blocks
    FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END $$;
