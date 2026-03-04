-- Migration 0265: Waitlist V1 — Configuration table for branding, form, queue, notifications
-- Mirrors spa_booking_widget_config pattern: JSONB blobs for flexible operator customization

CREATE TABLE IF NOT EXISTS fnb_waitlist_config (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  location_id       TEXT REFERENCES locations(id),
  enabled           BOOLEAN NOT NULL DEFAULT false,
  slug_override     TEXT,
  form_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  queue_config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  branding          JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
  operating_hours   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One config row per tenant+location combination (null location = tenant-wide default)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_waitlist_config_tenant_location
  ON fnb_waitlist_config (tenant_id, location_id);

-- Fast lookup by tenant
CREATE INDEX IF NOT EXISTS idx_fnb_waitlist_config_tenant
  ON fnb_waitlist_config (tenant_id);

-- Unique vanity slugs for public URLs
CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_waitlist_config_slug
  ON fnb_waitlist_config (slug_override) WHERE slug_override IS NOT NULL;

-- RLS policy
ALTER TABLE fnb_waitlist_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS fnb_waitlist_config_tenant_isolation
  ON fnb_waitlist_config
  USING (tenant_id = current_setting('app.tenant_id', true));
