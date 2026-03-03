CREATE TABLE IF NOT EXISTS fnb_server_load_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  server_user_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  open_tab_count INTEGER NOT NULL DEFAULT 0,
  active_seated_count INTEGER NOT NULL DEFAULT 0,
  total_cover_count INTEGER NOT NULL DEFAULT 0,
  avg_ticket_cents INTEGER NOT NULL DEFAULT 0,
  section_id TEXT,
  section_capacity INTEGER,
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_server_load_tenant_location_date
  ON fnb_server_load_snapshots (tenant_id, location_id, business_date);

ALTER TABLE fnb_server_load_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY fnb_server_load_snapshots_tenant_isolation ON fnb_server_load_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id', true));
