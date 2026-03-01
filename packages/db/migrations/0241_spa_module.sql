-- Migration 0241: Spa Module - Domain Tables + Infrastructure
-- 29 domain tables + 2 infra tables (idempotency + outbox) = 31 tables
-- CQRS read models (rm_spa_*) are in migration 0242
-- All tables use RLS with subquery-wrapped current_setting for InitPlan evaluation

-- ============================================================================
-- 1. spa_settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT REFERENCES locations(id),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  day_close_time TEXT NOT NULL DEFAULT '00:00',
  default_currency TEXT NOT NULL DEFAULT 'USD',
  tax_inclusive BOOLEAN NOT NULL DEFAULT false,
  default_buffer_minutes INTEGER NOT NULL DEFAULT 15,
  default_cleanup_minutes INTEGER NOT NULL DEFAULT 10,
  default_setup_minutes INTEGER NOT NULL DEFAULT 5,
  online_booking_enabled BOOLEAN NOT NULL DEFAULT false,
  waitlist_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_assign_provider BOOLEAN NOT NULL DEFAULT true,
  rebooking_window_days INTEGER NOT NULL DEFAULT 90,
  notification_preferences JSONB DEFAULT '{}',
  deposit_rules JSONB DEFAULT '{}',
  cancellation_defaults JSONB DEFAULT '{}',
  enterprise_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_settings_tenant ON spa_settings(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spa_settings_tenant_location ON spa_settings(tenant_id, location_id) WHERE location_id IS NOT NULL;

ALTER TABLE spa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_settings" ON spa_settings;
CREATE POLICY "tenant_select_spa_settings" ON spa_settings FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_settings" ON spa_settings;
CREATE POLICY "tenant_insert_spa_settings" ON spa_settings FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_settings" ON spa_settings;
CREATE POLICY "tenant_update_spa_settings" ON spa_settings FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_settings" ON spa_settings;
CREATE POLICY "tenant_delete_spa_settings" ON spa_settings FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 2. spa_service_categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_service_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  parent_id TEXT,
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_service_categories_tenant ON spa_service_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_spa_service_categories_parent ON spa_service_categories(tenant_id, parent_id);

ALTER TABLE spa_service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_service_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_service_categories" ON spa_service_categories;
CREATE POLICY "tenant_select_spa_service_categories" ON spa_service_categories FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_service_categories" ON spa_service_categories;
CREATE POLICY "tenant_insert_spa_service_categories" ON spa_service_categories FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_service_categories" ON spa_service_categories;
CREATE POLICY "tenant_update_spa_service_categories" ON spa_service_categories FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_service_categories" ON spa_service_categories;
CREATE POLICY "tenant_delete_spa_service_categories" ON spa_service_categories FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 3. spa_services
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  category_id TEXT REFERENCES spa_service_categories(id),
  name TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  category TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  cleanup_minutes INTEGER NOT NULL DEFAULT 0,
  setup_minutes INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(12,2) NOT NULL,
  member_price NUMERIC(12,2),
  peak_price NUMERIC(12,2),
  cost NUMERIC(12,2),
  max_capacity INTEGER NOT NULL DEFAULT 1,
  is_couples BOOLEAN NOT NULL DEFAULT false,
  is_group BOOLEAN NOT NULL DEFAULT false,
  min_group_size INTEGER,
  max_group_size INTEGER,
  requires_intake BOOLEAN NOT NULL DEFAULT false,
  requires_consent BOOLEAN NOT NULL DEFAULT false,
  contraindications JSONB DEFAULT '[]',
  preparation_instructions TEXT,
  aftercare_instructions TEXT,
  catalog_item_id TEXT REFERENCES catalog_items(id),
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archived_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_spa_services_tenant ON spa_services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_spa_services_category ON spa_services(tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_spa_services_active ON spa_services(tenant_id, is_active);

ALTER TABLE spa_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_services FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_services" ON spa_services;
CREATE POLICY "tenant_select_spa_services" ON spa_services FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_services" ON spa_services;
CREATE POLICY "tenant_insert_spa_services" ON spa_services FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_services" ON spa_services;
CREATE POLICY "tenant_update_spa_services" ON spa_services FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_services" ON spa_services;
CREATE POLICY "tenant_delete_spa_services" ON spa_services FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 4. spa_service_addons
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_service_addons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  member_price NUMERIC(12,2),
  is_standalone BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_service_addons_tenant ON spa_service_addons(tenant_id);

ALTER TABLE spa_service_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_service_addons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_service_addons" ON spa_service_addons;
CREATE POLICY "tenant_select_spa_service_addons" ON spa_service_addons FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_service_addons" ON spa_service_addons;
CREATE POLICY "tenant_insert_spa_service_addons" ON spa_service_addons FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_service_addons" ON spa_service_addons;
CREATE POLICY "tenant_update_spa_service_addons" ON spa_service_addons FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_service_addons" ON spa_service_addons;
CREATE POLICY "tenant_delete_spa_service_addons" ON spa_service_addons FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 5. spa_service_addon_links
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_service_addon_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  service_id TEXT NOT NULL REFERENCES spa_services(id),
  addon_id TEXT NOT NULL REFERENCES spa_service_addons(id),
  is_default BOOLEAN NOT NULL DEFAULT false,
  price_override NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_service_addon_links_service ON spa_service_addon_links(tenant_id, service_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spa_service_addon_links ON spa_service_addon_links(tenant_id, service_id, addon_id);

ALTER TABLE spa_service_addon_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_service_addon_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_service_addon_links" ON spa_service_addon_links;
CREATE POLICY "tenant_select_spa_service_addon_links" ON spa_service_addon_links FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_service_addon_links" ON spa_service_addon_links;
CREATE POLICY "tenant_insert_spa_service_addon_links" ON spa_service_addon_links FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_service_addon_links" ON spa_service_addon_links;
CREATE POLICY "tenant_update_spa_service_addon_links" ON spa_service_addon_links FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_service_addon_links" ON spa_service_addon_links;
CREATE POLICY "tenant_delete_spa_service_addon_links" ON spa_service_addon_links FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 6. spa_providers
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_providers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  display_name TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  specialties JSONB DEFAULT '[]',
  certifications JSONB DEFAULT '[]',
  hire_date DATE,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  is_bookable_online BOOLEAN NOT NULL DEFAULT true,
  accept_new_clients BOOLEAN NOT NULL DEFAULT true,
  max_daily_appointments INTEGER,
  break_duration_minutes INTEGER NOT NULL DEFAULT 30,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_providers_tenant ON spa_providers(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spa_providers_user ON spa_providers(tenant_id, user_id);

ALTER TABLE spa_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_providers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_providers" ON spa_providers;
CREATE POLICY "tenant_select_spa_providers" ON spa_providers FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_providers" ON spa_providers;
CREATE POLICY "tenant_insert_spa_providers" ON spa_providers FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_providers" ON spa_providers;
CREATE POLICY "tenant_update_spa_providers" ON spa_providers FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_providers" ON spa_providers;
CREATE POLICY "tenant_delete_spa_providers" ON spa_providers FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 7. spa_provider_availability
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_provider_availability (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_id TEXT NOT NULL REFERENCES spa_providers(id),
  day_of_week INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location_id TEXT REFERENCES locations(id),
  effective_from DATE NOT NULL,
  effective_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_provider_availability_provider ON spa_provider_availability(tenant_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_spa_provider_availability_day ON spa_provider_availability(tenant_id, provider_id, day_of_week);

ALTER TABLE spa_provider_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_provider_availability FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_provider_availability" ON spa_provider_availability;
CREATE POLICY "tenant_select_spa_provider_availability" ON spa_provider_availability FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_provider_availability" ON spa_provider_availability;
CREATE POLICY "tenant_insert_spa_provider_availability" ON spa_provider_availability FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_provider_availability" ON spa_provider_availability;
CREATE POLICY "tenant_update_spa_provider_availability" ON spa_provider_availability FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_provider_availability" ON spa_provider_availability;
CREATE POLICY "tenant_delete_spa_provider_availability" ON spa_provider_availability FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 8. spa_provider_time_off
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_provider_time_off (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_id TEXT NOT NULL REFERENCES spa_providers(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_provider_time_off_provider ON spa_provider_time_off(tenant_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_spa_provider_time_off_range ON spa_provider_time_off(tenant_id, provider_id, start_at, end_at);

ALTER TABLE spa_provider_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_provider_time_off FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_provider_time_off" ON spa_provider_time_off;
CREATE POLICY "tenant_select_spa_provider_time_off" ON spa_provider_time_off FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_provider_time_off" ON spa_provider_time_off;
CREATE POLICY "tenant_insert_spa_provider_time_off" ON spa_provider_time_off FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_provider_time_off" ON spa_provider_time_off;
CREATE POLICY "tenant_update_spa_provider_time_off" ON spa_provider_time_off FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_provider_time_off" ON spa_provider_time_off;
CREATE POLICY "tenant_delete_spa_provider_time_off" ON spa_provider_time_off FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 9. spa_provider_service_eligibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_provider_service_eligibility (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_id TEXT NOT NULL REFERENCES spa_providers(id),
  service_id TEXT NOT NULL REFERENCES spa_services(id),
  proficiency_level TEXT NOT NULL DEFAULT 'standard',
  custom_duration_minutes INTEGER,
  custom_price NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_provider_service_eligibility_provider ON spa_provider_service_eligibility(tenant_id, provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spa_provider_service_eligibility ON spa_provider_service_eligibility(tenant_id, provider_id, service_id);

ALTER TABLE spa_provider_service_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_provider_service_eligibility FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_provider_service_eligibility" ON spa_provider_service_eligibility;
CREATE POLICY "tenant_select_spa_provider_service_eligibility" ON spa_provider_service_eligibility FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_provider_service_eligibility" ON spa_provider_service_eligibility;
CREATE POLICY "tenant_insert_spa_provider_service_eligibility" ON spa_provider_service_eligibility FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_provider_service_eligibility" ON spa_provider_service_eligibility;
CREATE POLICY "tenant_update_spa_provider_service_eligibility" ON spa_provider_service_eligibility FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_provider_service_eligibility" ON spa_provider_service_eligibility;
CREATE POLICY "tenant_delete_spa_provider_service_eligibility" ON spa_provider_service_eligibility FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 10. spa_resources
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_resources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  description TEXT,
  capacity INTEGER NOT NULL DEFAULT 1,
  location_id TEXT REFERENCES locations(id),
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  cleanup_minutes INTEGER NOT NULL DEFAULT 0,
  amenities JSONB DEFAULT '[]',
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_resources_tenant ON spa_resources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_spa_resources_type ON spa_resources(tenant_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_spa_resources_location ON spa_resources(tenant_id, location_id);

ALTER TABLE spa_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_resources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_resources" ON spa_resources;
CREATE POLICY "tenant_select_spa_resources" ON spa_resources FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_resources" ON spa_resources;
CREATE POLICY "tenant_insert_spa_resources" ON spa_resources FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_resources" ON spa_resources;
CREATE POLICY "tenant_update_spa_resources" ON spa_resources FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_resources" ON spa_resources;
CREATE POLICY "tenant_delete_spa_resources" ON spa_resources FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 11. spa_service_resource_requirements
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_service_resource_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  service_id TEXT NOT NULL REFERENCES spa_services(id),
  resource_id TEXT REFERENCES spa_resources(id),
  resource_type TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_service_resource_requirements_service ON spa_service_resource_requirements(tenant_id, service_id);

ALTER TABLE spa_service_resource_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_service_resource_requirements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_service_resource_requirements" ON spa_service_resource_requirements;
CREATE POLICY "tenant_select_spa_service_resource_requirements" ON spa_service_resource_requirements FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_service_resource_requirements" ON spa_service_resource_requirements;
CREATE POLICY "tenant_insert_spa_service_resource_requirements" ON spa_service_resource_requirements FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_service_resource_requirements" ON spa_service_resource_requirements;
CREATE POLICY "tenant_update_spa_service_resource_requirements" ON spa_service_resource_requirements FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_service_resource_requirements" ON spa_service_resource_requirements;
CREATE POLICY "tenant_delete_spa_service_resource_requirements" ON spa_service_resource_requirements FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 12. spa_appointments
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_appointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  appointment_number TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  location_id TEXT REFERENCES locations(id),
  provider_id TEXT REFERENCES spa_providers(id),
  resource_id TEXT REFERENCES spa_resources(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  booking_source TEXT NOT NULL DEFAULT 'front_desk',
  booking_channel TEXT,
  notes TEXT,
  internal_notes TEXT,
  deposit_amount_cents INTEGER NOT NULL DEFAULT 0,
  deposit_status TEXT NOT NULL DEFAULT 'none',
  deposit_payment_id TEXT,
  cancellation_reason TEXT,
  canceled_at TIMESTAMPTZ,
  canceled_by TEXT,
  no_show_fee_charged BOOLEAN NOT NULL DEFAULT false,
  checked_in_at TIMESTAMPTZ,
  checked_in_by TEXT,
  service_started_at TIMESTAMPTZ,
  service_completed_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  order_id TEXT REFERENCES orders(id),
  pms_folio_id TEXT,
  recurrence_rule JSONB DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_spa_appointments_number ON spa_appointments(tenant_id, appointment_number);
CREATE INDEX IF NOT EXISTS idx_spa_appointments_status ON spa_appointments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_spa_appointments_location_time ON spa_appointments(tenant_id, location_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_spa_appointments_customer ON spa_appointments(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_spa_appointments_provider_time ON spa_appointments(tenant_id, provider_id, start_at);

ALTER TABLE spa_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_appointments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_appointments" ON spa_appointments;
CREATE POLICY "tenant_select_spa_appointments" ON spa_appointments FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_appointments" ON spa_appointments;
CREATE POLICY "tenant_insert_spa_appointments" ON spa_appointments FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_appointments" ON spa_appointments;
CREATE POLICY "tenant_update_spa_appointments" ON spa_appointments FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_appointments" ON spa_appointments;
CREATE POLICY "tenant_delete_spa_appointments" ON spa_appointments FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 13. spa_appointment_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_appointment_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  appointment_id TEXT NOT NULL REFERENCES spa_appointments(id),
  service_id TEXT NOT NULL REFERENCES spa_services(id),
  addon_id TEXT REFERENCES spa_service_addons(id),
  provider_id TEXT REFERENCES spa_providers(id),
  resource_id TEXT REFERENCES spa_resources(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  price_cents INTEGER NOT NULL,
  member_price_cents INTEGER,
  final_price_cents INTEGER NOT NULL,
  discount_amount_cents INTEGER NOT NULL DEFAULT 0,
  discount_reason TEXT,
  package_balance_id TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_appointment_items_appointment ON spa_appointment_items(tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_spa_appointment_items_provider_time ON spa_appointment_items(tenant_id, provider_id, start_at);

ALTER TABLE spa_appointment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_appointment_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_appointment_items" ON spa_appointment_items;
CREATE POLICY "tenant_select_spa_appointment_items" ON spa_appointment_items FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_appointment_items" ON spa_appointment_items;
CREATE POLICY "tenant_insert_spa_appointment_items" ON spa_appointment_items FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_appointment_items" ON spa_appointment_items;
CREATE POLICY "tenant_update_spa_appointment_items" ON spa_appointment_items FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_appointment_items" ON spa_appointment_items;
CREATE POLICY "tenant_delete_spa_appointment_items" ON spa_appointment_items FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 14. spa_appointment_history (append-only audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_appointment_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  appointment_id TEXT NOT NULL REFERENCES spa_appointments(id),
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  changes JSONB DEFAULT '{}',
  performed_by TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_appointment_history_appointment ON spa_appointment_history(tenant_id, appointment_id);

ALTER TABLE spa_appointment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_appointment_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_appointment_history" ON spa_appointment_history;
CREATE POLICY "tenant_select_spa_appointment_history" ON spa_appointment_history FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_appointment_history" ON spa_appointment_history;
CREATE POLICY "tenant_insert_spa_appointment_history" ON spa_appointment_history FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_appointment_history" ON spa_appointment_history;
CREATE POLICY "tenant_update_spa_appointment_history" ON spa_appointment_history FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_appointment_history" ON spa_appointment_history;
CREATE POLICY "tenant_delete_spa_appointment_history" ON spa_appointment_history FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 15. spa_waitlist
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_waitlist (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT REFERENCES customers(id),
  service_id TEXT REFERENCES spa_services(id),
  preferred_provider_id TEXT REFERENCES spa_providers(id),
  preferred_date DATE,
  preferred_time_start TIME,
  preferred_time_end TIME,
  flexibility TEXT NOT NULL DEFAULT 'flexible_time',
  status TEXT NOT NULL DEFAULT 'waiting',
  offered_appointment_id TEXT REFERENCES spa_appointments(id),
  priority INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_waitlist_status ON spa_waitlist(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_spa_waitlist_customer ON spa_waitlist(tenant_id, customer_id);

ALTER TABLE spa_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_waitlist FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_waitlist" ON spa_waitlist;
CREATE POLICY "tenant_select_spa_waitlist" ON spa_waitlist FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_waitlist" ON spa_waitlist;
CREATE POLICY "tenant_insert_spa_waitlist" ON spa_waitlist FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_waitlist" ON spa_waitlist;
CREATE POLICY "tenant_update_spa_waitlist" ON spa_waitlist FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_waitlist" ON spa_waitlist;
CREATE POLICY "tenant_delete_spa_waitlist" ON spa_waitlist FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 16. spa_intake_form_templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_intake_form_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  form_type TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  required_for_services JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_intake_form_templates_tenant ON spa_intake_form_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_spa_intake_form_templates_type ON spa_intake_form_templates(tenant_id, form_type);

ALTER TABLE spa_intake_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_intake_form_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_intake_form_templates" ON spa_intake_form_templates;
CREATE POLICY "tenant_select_spa_intake_form_templates" ON spa_intake_form_templates FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_intake_form_templates" ON spa_intake_form_templates;
CREATE POLICY "tenant_insert_spa_intake_form_templates" ON spa_intake_form_templates FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_intake_form_templates" ON spa_intake_form_templates;
CREATE POLICY "tenant_update_spa_intake_form_templates" ON spa_intake_form_templates FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_intake_form_templates" ON spa_intake_form_templates;
CREATE POLICY "tenant_delete_spa_intake_form_templates" ON spa_intake_form_templates FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 17. spa_intake_responses
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_intake_responses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  template_id TEXT NOT NULL REFERENCES spa_intake_form_templates(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  appointment_id TEXT REFERENCES spa_appointments(id),
  responses JSONB NOT NULL DEFAULT '{}',
  signed_at TIMESTAMPTZ,
  signature_data TEXT,
  ip_address TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_intake_responses_customer ON spa_intake_responses(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_spa_intake_responses_appointment ON spa_intake_responses(tenant_id, appointment_id);

ALTER TABLE spa_intake_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_intake_responses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_intake_responses" ON spa_intake_responses;
CREATE POLICY "tenant_select_spa_intake_responses" ON spa_intake_responses FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_intake_responses" ON spa_intake_responses;
CREATE POLICY "tenant_insert_spa_intake_responses" ON spa_intake_responses FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_intake_responses" ON spa_intake_responses;
CREATE POLICY "tenant_update_spa_intake_responses" ON spa_intake_responses FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_intake_responses" ON spa_intake_responses;
CREATE POLICY "tenant_delete_spa_intake_responses" ON spa_intake_responses FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 18. spa_clinical_notes
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_clinical_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  appointment_id TEXT NOT NULL REFERENCES spa_appointments(id),
  appointment_item_id TEXT REFERENCES spa_appointment_items(id),
  provider_id TEXT NOT NULL REFERENCES spa_providers(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  note_type TEXT NOT NULL DEFAULT 'soap',
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  general_notes TEXT,
  is_confidential BOOLEAN NOT NULL DEFAULT false,
  photos JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_clinical_notes_appointment ON spa_clinical_notes(tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_spa_clinical_notes_customer ON spa_clinical_notes(tenant_id, customer_id);

ALTER TABLE spa_clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_clinical_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_clinical_notes" ON spa_clinical_notes;
CREATE POLICY "tenant_select_spa_clinical_notes" ON spa_clinical_notes FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_clinical_notes" ON spa_clinical_notes;
CREATE POLICY "tenant_insert_spa_clinical_notes" ON spa_clinical_notes FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_clinical_notes" ON spa_clinical_notes;
CREATE POLICY "tenant_update_spa_clinical_notes" ON spa_clinical_notes FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_clinical_notes" ON spa_clinical_notes;
CREATE POLICY "tenant_delete_spa_clinical_notes" ON spa_clinical_notes FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 19. spa_contraindications
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_contraindications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  condition TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'moderate',
  affected_services JSONB DEFAULT '[]',
  notes TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reported_by TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_contraindications_customer ON spa_contraindications(tenant_id, customer_id);

ALTER TABLE spa_contraindications ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_contraindications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_contraindications" ON spa_contraindications;
CREATE POLICY "tenant_select_spa_contraindications" ON spa_contraindications FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_contraindications" ON spa_contraindications;
CREATE POLICY "tenant_insert_spa_contraindications" ON spa_contraindications FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_contraindications" ON spa_contraindications;
CREATE POLICY "tenant_update_spa_contraindications" ON spa_contraindications FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_contraindications" ON spa_contraindications;
CREATE POLICY "tenant_delete_spa_contraindications" ON spa_contraindications FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 20. spa_commission_rules
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_commission_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  provider_id TEXT REFERENCES spa_providers(id),
  service_id TEXT REFERENCES spa_services(id),
  service_category TEXT,
  commission_type TEXT NOT NULL,
  rate NUMERIC(5,2),
  flat_amount NUMERIC(12,2),
  tiers JSONB DEFAULT '[]',
  applies_to TEXT NOT NULL DEFAULT 'service',
  effective_from DATE NOT NULL,
  effective_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_commission_rules_tenant ON spa_commission_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_spa_commission_rules_provider ON spa_commission_rules(tenant_id, provider_id);

ALTER TABLE spa_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_commission_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_commission_rules" ON spa_commission_rules;
CREATE POLICY "tenant_select_spa_commission_rules" ON spa_commission_rules FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_commission_rules" ON spa_commission_rules;
CREATE POLICY "tenant_insert_spa_commission_rules" ON spa_commission_rules FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_commission_rules" ON spa_commission_rules;
CREATE POLICY "tenant_update_spa_commission_rules" ON spa_commission_rules FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_commission_rules" ON spa_commission_rules;
CREATE POLICY "tenant_delete_spa_commission_rules" ON spa_commission_rules FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 21. spa_commission_ledger (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_commission_ledger (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_id TEXT NOT NULL REFERENCES spa_providers(id),
  appointment_id TEXT REFERENCES spa_appointments(id),
  appointment_item_id TEXT REFERENCES spa_appointment_items(id),
  order_id TEXT REFERENCES orders(id),
  rule_id TEXT NOT NULL REFERENCES spa_commission_rules(id),
  commission_type TEXT NOT NULL,
  base_amount_cents INTEGER NOT NULL,
  commission_amount_cents INTEGER NOT NULL,
  rate_applied NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'calculated',
  pay_period TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  adjustment_reason TEXT,
  original_amount_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_commission_ledger_provider ON spa_commission_ledger(tenant_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_spa_commission_ledger_pay_period ON spa_commission_ledger(tenant_id, provider_id, pay_period);
CREATE INDEX IF NOT EXISTS idx_spa_commission_ledger_status ON spa_commission_ledger(tenant_id, status);

ALTER TABLE spa_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_commission_ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_commission_ledger" ON spa_commission_ledger;
CREATE POLICY "tenant_select_spa_commission_ledger" ON spa_commission_ledger FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_commission_ledger" ON spa_commission_ledger;
CREATE POLICY "tenant_insert_spa_commission_ledger" ON spa_commission_ledger FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_commission_ledger" ON spa_commission_ledger;
CREATE POLICY "tenant_update_spa_commission_ledger" ON spa_commission_ledger FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_commission_ledger" ON spa_commission_ledger;
CREATE POLICY "tenant_delete_spa_commission_ledger" ON spa_commission_ledger FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 22. spa_package_definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_package_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  package_type TEXT NOT NULL,
  included_services JSONB DEFAULT '[]',
  total_sessions INTEGER,
  total_credits NUMERIC(12,2),
  total_value_cents INTEGER,
  selling_price_cents INTEGER NOT NULL,
  validity_days INTEGER NOT NULL,
  is_transferable BOOLEAN NOT NULL DEFAULT false,
  is_shareable BOOLEAN NOT NULL DEFAULT false,
  max_shares INTEGER NOT NULL DEFAULT 1,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  renewal_price_cents INTEGER,
  freeze_allowed BOOLEAN NOT NULL DEFAULT false,
  max_freeze_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_package_definitions_tenant ON spa_package_definitions(tenant_id);

ALTER TABLE spa_package_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_package_definitions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_package_definitions" ON spa_package_definitions;
CREATE POLICY "tenant_select_spa_package_definitions" ON spa_package_definitions FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_package_definitions" ON spa_package_definitions;
CREATE POLICY "tenant_insert_spa_package_definitions" ON spa_package_definitions FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_package_definitions" ON spa_package_definitions;
CREATE POLICY "tenant_update_spa_package_definitions" ON spa_package_definitions FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_package_definitions" ON spa_package_definitions;
CREATE POLICY "tenant_delete_spa_package_definitions" ON spa_package_definitions FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 23. spa_package_balances
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_package_balances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  package_def_id TEXT NOT NULL REFERENCES spa_package_definitions(id),
  purchase_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  sessions_total INTEGER,
  sessions_used INTEGER NOT NULL DEFAULT 0,
  credits_total NUMERIC(12,2),
  credits_used NUMERIC(12,2) NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'active',
  frozen_at TIMESTAMPTZ,
  frozen_until TIMESTAMPTZ,
  freeze_count INTEGER NOT NULL DEFAULT 0,
  order_id TEXT REFERENCES orders(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_package_balances_customer ON spa_package_balances(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_spa_package_balances_customer_status ON spa_package_balances(tenant_id, customer_id, status);

ALTER TABLE spa_package_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_package_balances FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_package_balances" ON spa_package_balances;
CREATE POLICY "tenant_select_spa_package_balances" ON spa_package_balances FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_package_balances" ON spa_package_balances;
CREATE POLICY "tenant_insert_spa_package_balances" ON spa_package_balances FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_package_balances" ON spa_package_balances;
CREATE POLICY "tenant_update_spa_package_balances" ON spa_package_balances FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_package_balances" ON spa_package_balances;
CREATE POLICY "tenant_delete_spa_package_balances" ON spa_package_balances FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 24. spa_package_redemptions
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_package_redemptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  balance_id TEXT NOT NULL REFERENCES spa_package_balances(id),
  appointment_id TEXT REFERENCES spa_appointments(id),
  appointment_item_id TEXT REFERENCES spa_appointment_items(id),
  sessions_redeemed INTEGER NOT NULL DEFAULT 1,
  credits_redeemed NUMERIC(12,2) NOT NULL DEFAULT '0',
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_by TEXT,
  voided BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_package_redemptions_balance ON spa_package_redemptions(tenant_id, balance_id);

ALTER TABLE spa_package_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_package_redemptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_package_redemptions" ON spa_package_redemptions;
CREATE POLICY "tenant_select_spa_package_redemptions" ON spa_package_redemptions FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_package_redemptions" ON spa_package_redemptions;
CREATE POLICY "tenant_insert_spa_package_redemptions" ON spa_package_redemptions FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_package_redemptions" ON spa_package_redemptions;
CREATE POLICY "tenant_update_spa_package_redemptions" ON spa_package_redemptions FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_package_redemptions" ON spa_package_redemptions;
CREATE POLICY "tenant_delete_spa_package_redemptions" ON spa_package_redemptions FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 25. spa_room_turnover_tasks
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_room_turnover_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  resource_id TEXT NOT NULL REFERENCES spa_resources(id),
  appointment_id TEXT REFERENCES spa_appointments(id),
  task_type TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  checklist JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_room_turnover_tasks_resource ON spa_room_turnover_tasks(tenant_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_spa_room_turnover_tasks_status ON spa_room_turnover_tasks(tenant_id, status);

ALTER TABLE spa_room_turnover_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_room_turnover_tasks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_room_turnover_tasks" ON spa_room_turnover_tasks;
CREATE POLICY "tenant_select_spa_room_turnover_tasks" ON spa_room_turnover_tasks FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_room_turnover_tasks" ON spa_room_turnover_tasks;
CREATE POLICY "tenant_insert_spa_room_turnover_tasks" ON spa_room_turnover_tasks FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_room_turnover_tasks" ON spa_room_turnover_tasks;
CREATE POLICY "tenant_update_spa_room_turnover_tasks" ON spa_room_turnover_tasks FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_room_turnover_tasks" ON spa_room_turnover_tasks;
CREATE POLICY "tenant_delete_spa_room_turnover_tasks" ON spa_room_turnover_tasks FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 26. spa_daily_operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_daily_operations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date DATE NOT NULL,
  opening_checklist JSONB DEFAULT '[]',
  closing_checklist JSONB DEFAULT '[]',
  opened_by TEXT,
  opened_at TIMESTAMPTZ,
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  incidents JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_daily_operations_location ON spa_daily_operations(tenant_id, location_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spa_daily_operations_date ON spa_daily_operations(tenant_id, location_id, business_date);

ALTER TABLE spa_daily_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_daily_operations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_daily_operations" ON spa_daily_operations;
CREATE POLICY "tenant_select_spa_daily_operations" ON spa_daily_operations FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_daily_operations" ON spa_daily_operations;
CREATE POLICY "tenant_insert_spa_daily_operations" ON spa_daily_operations FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_daily_operations" ON spa_daily_operations;
CREATE POLICY "tenant_update_spa_daily_operations" ON spa_daily_operations FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_daily_operations" ON spa_daily_operations;
CREATE POLICY "tenant_delete_spa_daily_operations" ON spa_daily_operations FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 27. spa_booking_widget_config
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_booking_widget_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT REFERENCES locations(id),
  theme JSONB DEFAULT '{}',
  logo_url TEXT,
  welcome_message TEXT,
  booking_lead_time_hours INTEGER NOT NULL DEFAULT 2,
  max_advance_booking_days INTEGER NOT NULL DEFAULT 90,
  require_deposit BOOLEAN NOT NULL DEFAULT false,
  deposit_type TEXT NOT NULL DEFAULT 'percentage',
  deposit_value NUMERIC(12,2) NOT NULL DEFAULT '0',
  cancellation_window_hours INTEGER NOT NULL DEFAULT 24,
  cancellation_fee_type TEXT NOT NULL DEFAULT 'none',
  cancellation_fee_value NUMERIC(12,2) NOT NULL DEFAULT '0',
  show_prices BOOLEAN NOT NULL DEFAULT true,
  show_provider_photos BOOLEAN NOT NULL DEFAULT true,
  allow_provider_selection BOOLEAN NOT NULL DEFAULT true,
  allow_addon_selection BOOLEAN NOT NULL DEFAULT true,
  custom_css TEXT,
  redirect_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_booking_widget_config_tenant ON spa_booking_widget_config(tenant_id);

ALTER TABLE spa_booking_widget_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_booking_widget_config FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_booking_widget_config" ON spa_booking_widget_config;
CREATE POLICY "tenant_select_spa_booking_widget_config" ON spa_booking_widget_config FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_booking_widget_config" ON spa_booking_widget_config;
CREATE POLICY "tenant_insert_spa_booking_widget_config" ON spa_booking_widget_config FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_booking_widget_config" ON spa_booking_widget_config;
CREATE POLICY "tenant_update_spa_booking_widget_config" ON spa_booking_widget_config FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_booking_widget_config" ON spa_booking_widget_config;
CREATE POLICY "tenant_delete_spa_booking_widget_config" ON spa_booking_widget_config FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 28. spa_idempotency_keys (module-specific idempotency)
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_idempotency_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  operation TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_spa_idempotency_keys ON spa_idempotency_keys(tenant_id, key, operation);

ALTER TABLE spa_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_idempotency_keys" ON spa_idempotency_keys;
CREATE POLICY "tenant_select_spa_idempotency_keys" ON spa_idempotency_keys FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_idempotency_keys" ON spa_idempotency_keys;
CREATE POLICY "tenant_insert_spa_idempotency_keys" ON spa_idempotency_keys FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_idempotency_keys" ON spa_idempotency_keys;
CREATE POLICY "tenant_update_spa_idempotency_keys" ON spa_idempotency_keys FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_idempotency_keys" ON spa_idempotency_keys;
CREATE POLICY "tenant_delete_spa_idempotency_keys" ON spa_idempotency_keys FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- 29. spa_outbox (module-specific event outbox)
-- ============================================================================
CREATE TABLE IF NOT EXISTS spa_outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  published_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_outbox_tenant_status ON spa_outbox(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_spa_outbox_status_created ON spa_outbox(status, created_at);

ALTER TABLE spa_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_spa_outbox" ON spa_outbox;
CREATE POLICY "tenant_select_spa_outbox" ON spa_outbox FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_insert_spa_outbox" ON spa_outbox;
CREATE POLICY "tenant_insert_spa_outbox" ON spa_outbox FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_update_spa_outbox" ON spa_outbox;
CREATE POLICY "tenant_update_spa_outbox" ON spa_outbox FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS "tenant_delete_spa_outbox" ON spa_outbox;
CREATE POLICY "tenant_delete_spa_outbox" ON spa_outbox FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));


-- ============================================================================
-- Self-referential FK for spa_service_categories.parent_id
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE spa_service_categories
    ADD CONSTRAINT fk_spa_service_categories_parent
    FOREIGN KEY (parent_id) REFERENCES spa_service_categories(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
