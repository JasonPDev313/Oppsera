CREATE TABLE IF NOT EXISTS fnb_turn_time_aggregates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  table_type TEXT,
  meal_period TEXT,
  day_of_week INTEGER,
  party_size_bucket TEXT,
  avg_minutes INTEGER NOT NULL,
  p50_minutes INTEGER NOT NULL,
  p75_minutes INTEGER NOT NULL,
  p90_minutes INTEGER NOT NULL,
  sample_count INTEGER NOT NULL,
  server_avg_minutes INTEGER,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_fnb_turn_agg_natural_key
    UNIQUE (tenant_id, location_id, table_type, meal_period, day_of_week, party_size_bucket)
);

CREATE INDEX IF NOT EXISTS idx_fnb_turn_agg_lookup
  ON fnb_turn_time_aggregates (tenant_id, location_id, table_type, meal_period, day_of_week, party_size_bucket);

ALTER TABLE fnb_turn_time_aggregates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fnb_turn_time_aggregates_tenant_isolation' AND tablename = 'fnb_turn_time_aggregates') THEN
    CREATE POLICY fnb_turn_time_aggregates_tenant_isolation ON fnb_turn_time_aggregates
      USING (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
