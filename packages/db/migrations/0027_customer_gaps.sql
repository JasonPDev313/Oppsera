-- Migration: 0027_customer_gaps
-- Customer gaps domain: customer_addresses, customer_facility_assignments,
-- customer_location_settings, customer_discount_overrides,
-- customer_signed_waivers, membership_applications
-- Also adds columns to existing customers table

-- ══════════════════════════════════════════════════════════════════
-- Part 1: ALTER customers table — add gap columns
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE customers ADD COLUMN IF NOT EXISTS prefix TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS suffix TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS home_phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ghin_number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS projected_rounds INTEGER;

-- ══════════════════════════════════════════════════════════════════
-- Part 2: New tables
-- ══════════════════════════════════════════════════════════════════

-- ── customer_addresses ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_addresses (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  customer_id     TEXT NOT NULL,
  entity_type     TEXT NOT NULL DEFAULT 'customer',
  address_type    TEXT NOT NULL DEFAULT 'home',
  line1           TEXT,
  line2           TEXT,
  line3           TEXT,
  city            TEXT,
  county          TEXT,
  state           TEXT,
  country         TEXT,
  postal_code     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant_customer
  ON customer_addresses (tenant_id, customer_id);

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_addresses_select ON customer_addresses FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_addresses_insert ON customer_addresses FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_addresses_update ON customer_addresses FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_addresses_delete ON customer_addresses FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── customer_facility_assignments ─────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_facility_assignments (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  customer_id         TEXT NOT NULL,
  assignment_type     TEXT NOT NULL,
  assignment_number   TEXT,
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_facility_assignments_tenant_customer_type
  ON customer_facility_assignments (tenant_id, customer_id, assignment_type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_facility_assignments_tenant_type_number
  ON customer_facility_assignments (tenant_id, assignment_type, assignment_number)
  WHERE assignment_number IS NOT NULL;

ALTER TABLE customer_facility_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_facility_assignments_select ON customer_facility_assignments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_facility_assignments_insert ON customer_facility_assignments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_facility_assignments_update ON customer_facility_assignments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_facility_assignments_delete ON customer_facility_assignments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── customer_location_settings ────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_location_settings (
  id                            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                     TEXT NOT NULL REFERENCES tenants(id),
  customer_id                   TEXT NOT NULL,
  location_id                   TEXT NOT NULL,
  disable_online_tee_bookings   BOOLEAN NOT NULL DEFAULT false,
  disable_online_reservations   BOOLEAN NOT NULL DEFAULT false,
  service_charge_exempt         BOOLEAN NOT NULL DEFAULT false,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_location_settings_tenant_customer_location
  ON customer_location_settings (tenant_id, customer_id, location_id);

ALTER TABLE customer_location_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_location_settings_select ON customer_location_settings FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_location_settings_insert ON customer_location_settings FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_location_settings_update ON customer_location_settings FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_location_settings_delete ON customer_location_settings FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── customer_discount_overrides ───────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_discount_overrides (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  customer_id             TEXT NOT NULL,
  membership_id           TEXT,
  department_id           TEXT,
  discount_percentage     NUMERIC(5,2) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_discount_overrides_tenant_customer
  ON customer_discount_overrides (tenant_id, customer_id);

ALTER TABLE customer_discount_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_discount_overrides_select ON customer_discount_overrides FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_discount_overrides_insert ON customer_discount_overrides FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_discount_overrides_update ON customer_discount_overrides FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_discount_overrides_delete ON customer_discount_overrides FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── customer_signed_waivers ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_signed_waivers (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  customer_id       TEXT NOT NULL,
  course_id         TEXT,
  reservation_id    TEXT,
  waiver_content    TEXT NOT NULL,
  signature_type    TEXT NOT NULL DEFAULT 'digital',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_signed_waivers_tenant_customer
  ON customer_signed_waivers (tenant_id, customer_id);

ALTER TABLE customer_signed_waivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_signed_waivers_select ON customer_signed_waivers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_signed_waivers_insert ON customer_signed_waivers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_signed_waivers_update ON customer_signed_waivers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY customer_signed_waivers_delete ON customer_signed_waivers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── membership_applications ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_applications (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  customer_id           TEXT,
  membership_plan_id    TEXT,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  application_content   JSONB,
  approval_status       TEXT NOT NULL DEFAULT 'pending',
  completion_status     TEXT NOT NULL DEFAULT 'incomplete',
  voucher_id            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_applications_tenant_approval
  ON membership_applications (tenant_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_membership_applications_tenant_customer
  ON membership_applications (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE membership_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_applications_select ON membership_applications FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_applications_insert ON membership_applications FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_applications_update ON membership_applications FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY membership_applications_delete ON membership_applications FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
