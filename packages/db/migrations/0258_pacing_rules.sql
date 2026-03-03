-- Pacing engine: time-window-based cover limits
CREATE TABLE IF NOT EXISTS fnb_pacing_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  meal_period TEXT,
  day_of_week INTEGER,
  interval_start_time TEXT,
  interval_end_time TEXT,
  max_covers INTEGER NOT NULL,
  max_reservations INTEGER,
  min_party_size INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_fnb_pacing_rules_tenant_location
  ON fnb_pacing_rules (tenant_id, location_id);

-- RLS
ALTER TABLE fnb_pacing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY fnb_pacing_rules_tenant_isolation ON fnb_pacing_rules
  USING (tenant_id = current_setting('app.current_tenant_id', true));
