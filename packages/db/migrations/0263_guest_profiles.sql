-- Session 9: Guest Intelligence — fnb_guest_profiles table
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_guest_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  customer_id TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  guest_name TEXT,
  visit_count INTEGER NOT NULL DEFAULT 0,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  cancel_count INTEGER NOT NULL DEFAULT 0,
  avg_ticket_cents INTEGER,
  total_spend_cents INTEGER NOT NULL DEFAULT 0,
  last_visit_date DATE,
  first_visit_date DATE,
  preferred_tables TEXT,
  preferred_server TEXT,
  seating_preference TEXT,
  frequent_items JSONB,
  tags JSONB,
  notes TEXT,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_guest_profiles_customer
  ON fnb_guest_profiles (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_fnb_guest_profiles_phone
  ON fnb_guest_profiles (tenant_id, guest_phone);

CREATE INDEX IF NOT EXISTS idx_fnb_guest_profiles_email
  ON fnb_guest_profiles (tenant_id, guest_email);

ALTER TABLE fnb_guest_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fnb_guest_profiles'
      AND policyname = 'fnb_guest_profiles_tenant_isolation'
  ) THEN
    CREATE POLICY fnb_guest_profiles_tenant_isolation ON fnb_guest_profiles
      USING (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;
END;
$$;
