-- Migration 0164: PMS Channel Manager + Booking Engine
-- Tables: pms_channels, pms_channel_sync_log, pms_booking_engine_config
-- Also adds slug column to pms_properties

-- ── Table 1: pms_channels ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_channels (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  channel_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  api_credentials_json JSONB NOT NULL DEFAULT '{}',
  mapping_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_channels_tenant_property ON pms_channels(tenant_id, property_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_channels_property_code ON pms_channels(tenant_id, property_id, channel_code);

-- ── Table 2: pms_channel_sync_log ──────────────────────────────
CREATE TABLE IF NOT EXISTS pms_channel_sync_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  channel_id TEXT NOT NULL REFERENCES pms_channels(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('availability', 'rate', 'reservation', 'restriction')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error')),
  records_synced INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pms_channel_sync_log_channel ON pms_channel_sync_log(tenant_id, channel_id);

-- ── Table 3: pms_booking_engine_config ─────────────────────────
CREATE TABLE IF NOT EXISTS pms_booking_engine_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  is_active BOOLEAN NOT NULL DEFAULT false,
  widget_theme_json JSONB NOT NULL DEFAULT '{}',
  allowed_rate_plan_ids TEXT[] NOT NULL DEFAULT '{}',
  min_lead_time_hours INTEGER NOT NULL DEFAULT 0,
  max_advance_days INTEGER NOT NULL DEFAULT 365,
  terms_url TEXT,
  privacy_url TEXT,
  confirmation_template_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_booking_engine_config ON pms_booking_engine_config(tenant_id, property_id);

-- ── Add slug to pms_properties ─────────────────────────────────
ALTER TABLE pms_properties ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_properties_slug ON pms_properties(slug) WHERE slug IS NOT NULL;

-- ── RLS: pms_channels (full CRUD) ──────────────────────────────
ALTER TABLE pms_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_channels FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_channels_select' AND tablename = 'pms_channels') THEN
  CREATE POLICY pms_channels_select ON pms_channels FOR SELECT
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_channels_insert' AND tablename = 'pms_channels') THEN
  CREATE POLICY pms_channels_insert ON pms_channels FOR INSERT
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_channels_update' AND tablename = 'pms_channels') THEN
  CREATE POLICY pms_channels_update ON pms_channels FOR UPDATE
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)))
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_channels_delete' AND tablename = 'pms_channels') THEN
  CREATE POLICY pms_channels_delete ON pms_channels FOR DELETE
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

-- ── RLS: pms_channel_sync_log (append-only: SELECT + INSERT) ───
ALTER TABLE pms_channel_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_channel_sync_log FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_channel_sync_log_select' AND tablename = 'pms_channel_sync_log') THEN
  CREATE POLICY pms_channel_sync_log_select ON pms_channel_sync_log FOR SELECT
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_channel_sync_log_insert' AND tablename = 'pms_channel_sync_log') THEN
  CREATE POLICY pms_channel_sync_log_insert ON pms_channel_sync_log FOR INSERT
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

-- ── RLS: pms_booking_engine_config (full CRUD) ─────────────────
ALTER TABLE pms_booking_engine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_booking_engine_config FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_booking_engine_config_select' AND tablename = 'pms_booking_engine_config') THEN
  CREATE POLICY pms_booking_engine_config_select ON pms_booking_engine_config FOR SELECT
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_booking_engine_config_insert' AND tablename = 'pms_booking_engine_config') THEN
  CREATE POLICY pms_booking_engine_config_insert ON pms_booking_engine_config FOR INSERT
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_booking_engine_config_update' AND tablename = 'pms_booking_engine_config') THEN
  CREATE POLICY pms_booking_engine_config_update ON pms_booking_engine_config FOR UPDATE
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)))
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_booking_engine_config_delete' AND tablename = 'pms_booking_engine_config') THEN
  CREATE POLICY pms_booking_engine_config_delete ON pms_booking_engine_config FOR DELETE
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
END IF;
END $$;
