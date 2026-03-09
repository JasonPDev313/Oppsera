-- KDS location-level settings: stale ticket mode (persist vs auto_clear)
CREATE TABLE IF NOT EXISTS fnb_kds_location_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  stale_ticket_mode TEXT NOT NULL DEFAULT 'persist',
  auto_clear_time TEXT DEFAULT '04:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_kds_location_settings_tenant_location
  ON fnb_kds_location_settings(tenant_id, location_id);
