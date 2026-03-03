-- Session 10: Analytics Read Models — pre-aggregated host dashboard metrics
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Hourly host metrics (pre-aggregated for dashboard) ───────────────
CREATE TABLE IF NOT EXISTS rm_fnb_host_hourly (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date DATE NOT NULL,
  hour_slot INTEGER NOT NULL,  -- 0-23
  meal_period TEXT,
  total_covers INTEGER NOT NULL DEFAULT 0,
  total_reservations INTEGER NOT NULL DEFAULT 0,
  total_walk_ins INTEGER NOT NULL DEFAULT 0,
  total_waitlist_adds INTEGER NOT NULL DEFAULT 0,
  avg_wait_minutes NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_turn_minutes NUMERIC(5,1) NOT NULL DEFAULT 0,
  table_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_host_hourly_natural_key
  ON rm_fnb_host_hourly (tenant_id, location_id, business_date, hour_slot);

CREATE INDEX IF NOT EXISTS idx_rm_host_hourly_lookup
  ON rm_fnb_host_hourly (tenant_id, location_id, business_date);

ALTER TABLE rm_fnb_host_hourly ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rm_fnb_host_hourly'
      AND policyname = 'rm_fnb_host_hourly_tenant_isolation'
  ) THEN
    CREATE POLICY rm_fnb_host_hourly_tenant_isolation ON rm_fnb_host_hourly
      USING (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;
END;
$$;

-- ── 2. Waitlist accuracy tracking (predicted vs actual wait times) ───────
CREATE TABLE IF NOT EXISTS rm_fnb_waitlist_accuracy (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date DATE NOT NULL,
  meal_period TEXT,
  total_entries INTEGER NOT NULL DEFAULT 0,
  entries_with_quote INTEGER NOT NULL DEFAULT 0,
  avg_quoted_minutes NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_actual_minutes NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_error_minutes NUMERIC(5,1) NOT NULL DEFAULT 0,
  accuracy_pct NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 100 - abs(avg_error/avg_quoted * 100)
  under_estimates INTEGER NOT NULL DEFAULT 0,
  over_estimates INTEGER NOT NULL DEFAULT 0,
  exact_or_close INTEGER NOT NULL DEFAULT 0,  -- within ±2 min
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_waitlist_accuracy_natural_key
  ON rm_fnb_waitlist_accuracy (tenant_id, location_id, business_date, meal_period);

CREATE INDEX IF NOT EXISTS idx_rm_waitlist_accuracy_lookup
  ON rm_fnb_waitlist_accuracy (tenant_id, location_id, business_date);

ALTER TABLE rm_fnb_waitlist_accuracy ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rm_fnb_waitlist_accuracy'
      AND policyname = 'rm_fnb_waitlist_accuracy_tenant_isolation'
  ) THEN
    CREATE POLICY rm_fnb_waitlist_accuracy_tenant_isolation ON rm_fnb_waitlist_accuracy
      USING (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;
END;
$$;

-- ── 3. Seating efficiency metrics ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rm_fnb_seating_efficiency (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date DATE NOT NULL,
  meal_period TEXT,
  total_seatings INTEGER NOT NULL DEFAULT 0,
  avg_seat_to_first_order_minutes NUMERIC(5,1) NOT NULL DEFAULT 0,
  capacity_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_party_vs_table_size_ratio NUMERIC(4,2) NOT NULL DEFAULT 0,
  tables_turned_count INTEGER NOT NULL DEFAULT 0,
  avg_turns_per_table NUMERIC(4,2) NOT NULL DEFAULT 0,
  reservation_fill_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  walk_in_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_seating_eff_natural_key
  ON rm_fnb_seating_efficiency (tenant_id, location_id, business_date, meal_period);

CREATE INDEX IF NOT EXISTS idx_rm_seating_eff_lookup
  ON rm_fnb_seating_efficiency (tenant_id, location_id, business_date);

ALTER TABLE rm_fnb_seating_efficiency ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rm_fnb_seating_efficiency'
      AND policyname = 'rm_fnb_seating_efficiency_tenant_isolation'
  ) THEN
    CREATE POLICY rm_fnb_seating_efficiency_tenant_isolation ON rm_fnb_seating_efficiency
      USING (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;
END;
$$;
