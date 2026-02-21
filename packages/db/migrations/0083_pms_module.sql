-- Migration: 0082_pms_module
-- Purpose: Create all PMS (Property Management System) tables
-- Tables: 16 tables for properties, rooms, reservations, folios, housekeeping, calendar read models

-- Enable btree_gist extension for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ══════════════════════════════════════════════════════════════════
-- 1. pms_properties — property/hotel configuration
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_properties (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  currency TEXT NOT NULL DEFAULT 'USD',
  address_json JSONB,
  tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  check_in_time TEXT NOT NULL DEFAULT '15:00',
  check_out_time TEXT NOT NULL DEFAULT '11:00',
  night_audit_time TEXT NOT NULL DEFAULT '03:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_pms_properties_tenant ON pms_properties(tenant_id);

ALTER TABLE pms_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_properties_select ON pms_properties FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_properties_insert ON pms_properties FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_properties_update ON pms_properties FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_properties_delete ON pms_properties FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 2. pms_room_types — room type definitions
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_room_types (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  max_adults INTEGER NOT NULL DEFAULT 2,
  max_children INTEGER NOT NULL DEFAULT 0,
  max_occupancy INTEGER NOT NULL DEFAULT 2,
  beds_json JSONB,
  amenities_json JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_pms_room_types_tenant ON pms_room_types(tenant_id);
CREATE INDEX idx_pms_room_types_property ON pms_room_types(tenant_id, property_id);
CREATE UNIQUE INDEX uq_pms_room_types_code ON pms_room_types(tenant_id, property_id, code);

ALTER TABLE pms_room_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_room_types_select ON pms_room_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_room_types_insert ON pms_room_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_room_types_update ON pms_room_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_room_types_delete ON pms_room_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 3. pms_rooms — individual room units
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_rooms (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  room_type_id TEXT NOT NULL REFERENCES pms_room_types(id),
  room_number TEXT NOT NULL,
  floor TEXT,
  status TEXT NOT NULL DEFAULT 'VACANT_CLEAN',
  is_out_of_order BOOLEAN NOT NULL DEFAULT false,
  out_of_order_reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  features_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_pms_rooms_tenant ON pms_rooms(tenant_id);
CREATE INDEX idx_pms_rooms_property ON pms_rooms(tenant_id, property_id);
CREATE INDEX idx_pms_rooms_type ON pms_rooms(tenant_id, property_id, room_type_id);
CREATE INDEX idx_pms_rooms_status ON pms_rooms(tenant_id, property_id, status);
CREATE UNIQUE INDEX uq_pms_rooms_number ON pms_rooms(tenant_id, property_id, room_number);

ALTER TABLE pms_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_rooms_select ON pms_rooms FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rooms_insert ON pms_rooms FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rooms_update ON pms_rooms FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rooms_delete ON pms_rooms FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 4. pms_rate_plans — rate plan definitions
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_rate_plans (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_pms_rate_plans_tenant ON pms_rate_plans(tenant_id);
CREATE INDEX idx_pms_rate_plans_property ON pms_rate_plans(tenant_id, property_id);
CREATE UNIQUE INDEX uq_pms_rate_plans_code ON pms_rate_plans(tenant_id, property_id, code);

ALTER TABLE pms_rate_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_rate_plans_select ON pms_rate_plans FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rate_plans_insert ON pms_rate_plans FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rate_plans_update ON pms_rate_plans FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rate_plans_delete ON pms_rate_plans FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 5. pms_rate_plan_prices — nightly rate prices per room type per date range
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_rate_plan_prices (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  rate_plan_id TEXT NOT NULL REFERENCES pms_rate_plans(id),
  room_type_id TEXT NOT NULL REFERENCES pms_room_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  nightly_base_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rate_price_dates CHECK (end_date > start_date)
);

CREATE INDEX idx_pms_rate_plan_prices_tenant ON pms_rate_plan_prices(tenant_id);
CREATE INDEX idx_pms_rate_plan_prices_plan ON pms_rate_plan_prices(rate_plan_id, room_type_id);
CREATE INDEX idx_pms_rate_plan_prices_dates ON pms_rate_plan_prices(rate_plan_id, room_type_id, start_date, end_date);

ALTER TABLE pms_rate_plan_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_rate_plan_prices_select ON pms_rate_plan_prices FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rate_plan_prices_insert ON pms_rate_plan_prices FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rate_plan_prices_update ON pms_rate_plan_prices FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_rate_plan_prices_delete ON pms_rate_plan_prices FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 6. pms_guests — lightweight guest profiles
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_guests (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  customer_id TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_json JSONB,
  preferences_json JSONB,
  notes TEXT,
  total_stays INTEGER NOT NULL DEFAULT 0,
  last_stay_date DATE,
  is_vip BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_pms_guests_tenant ON pms_guests(tenant_id);
CREATE INDEX idx_pms_guests_property ON pms_guests(tenant_id, property_id);
CREATE INDEX idx_pms_guests_email ON pms_guests(tenant_id, property_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_pms_guests_name ON pms_guests(tenant_id, property_id, last_name, first_name);

ALTER TABLE pms_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_guests_select ON pms_guests FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_guests_insert ON pms_guests FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_guests_update ON pms_guests FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_guests_delete ON pms_guests FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 7. pms_reservations — core reservation records (source of truth)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_reservations (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  guest_id TEXT REFERENCES pms_guests(id),
  primary_guest_json JSONB NOT NULL,
  room_type_id TEXT NOT NULL REFERENCES pms_room_types(id),
  room_id TEXT REFERENCES pms_rooms(id),
  rate_plan_id TEXT NOT NULL REFERENCES pms_rate_plans(id),
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  stay_range DATERANGE GENERATED ALWAYS AS (daterange(check_in_date, check_out_date, '[)')) STORED,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  source_type TEXT NOT NULL DEFAULT 'DIRECT',
  source_ref TEXT,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  nightly_rate_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  internal_notes TEXT,
  guest_notes TEXT,
  confirmation_number TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  checked_in_at TIMESTAMPTZ,
  checked_in_by TEXT,
  checked_out_at TIMESTAMPTZ,
  checked_out_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  CONSTRAINT chk_reservation_dates CHECK (check_out_date > check_in_date)
);

CREATE INDEX idx_pms_reservations_tenant ON pms_reservations(tenant_id);
CREATE INDEX idx_pms_reservations_property ON pms_reservations(tenant_id, property_id);
CREATE INDEX idx_pms_reservations_status ON pms_reservations(tenant_id, property_id, status);
CREATE INDEX idx_pms_reservations_dates ON pms_reservations(tenant_id, property_id, check_in_date, check_out_date);
CREATE INDEX idx_pms_reservations_guest ON pms_reservations(tenant_id, guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX idx_pms_reservations_room ON pms_reservations(tenant_id, room_id) WHERE room_id IS NOT NULL;
CREATE INDEX idx_pms_reservations_confirmation ON pms_reservations(tenant_id, confirmation_number) WHERE confirmation_number IS NOT NULL;

ALTER TABLE pms_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_reservations_select ON pms_reservations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_reservations_insert ON pms_reservations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_reservations_update ON pms_reservations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_reservations_delete ON pms_reservations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 8. pms_room_blocks — room occupancy blocks (overlap enforcement)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_room_blocks (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  room_id TEXT NOT NULL REFERENCES pms_rooms(id),
  reservation_id TEXT REFERENCES pms_reservations(id),
  block_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_block_dates CHECK (end_date > start_date),
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  ) WHERE (is_active = true AND block_type IN ('RESERVATION', 'MAINTENANCE', 'HOLD'))
);

CREATE INDEX idx_pms_room_blocks_tenant ON pms_room_blocks(tenant_id);
CREATE INDEX idx_pms_room_blocks_room ON pms_room_blocks(tenant_id, room_id);
CREATE INDEX idx_pms_room_blocks_reservation ON pms_room_blocks(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX idx_pms_room_blocks_dates ON pms_room_blocks(tenant_id, property_id, start_date, end_date);

ALTER TABLE pms_room_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_room_blocks_select ON pms_room_blocks FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_room_blocks_insert ON pms_room_blocks FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_room_blocks_update ON pms_room_blocks FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_room_blocks_delete ON pms_room_blocks FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 9. pms_folios — guest folios linked to reservations
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_folios (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  reservation_id TEXT NOT NULL REFERENCES pms_reservations(id),
  guest_id TEXT REFERENCES pms_guests(id),
  status TEXT NOT NULL DEFAULT 'OPEN',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  payment_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_pms_folios_tenant ON pms_folios(tenant_id);
CREATE INDEX idx_pms_folios_reservation ON pms_folios(reservation_id);
CREATE INDEX idx_pms_folios_property ON pms_folios(tenant_id, property_id);

ALTER TABLE pms_folios ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_folios_select ON pms_folios FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_folios_insert ON pms_folios FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_folios_update ON pms_folios FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_folios_delete ON pms_folios FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 10. pms_folio_entries — ledger-style folio charges/credits
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_folio_entries (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  folio_id TEXT NOT NULL REFERENCES pms_folios(id),
  entry_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  business_date DATE NOT NULL,
  source_ref TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pms_folio_entries_tenant ON pms_folio_entries(tenant_id);
CREATE INDEX idx_pms_folio_entries_folio ON pms_folio_entries(folio_id);
CREATE INDEX idx_pms_folio_entries_type ON pms_folio_entries(folio_id, entry_type);

ALTER TABLE pms_folio_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_folio_entries_select ON pms_folio_entries FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_folio_entries_insert ON pms_folio_entries FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 11. pms_room_status_log — housekeeping status change audit trail
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_room_status_log (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  room_id TEXT NOT NULL REFERENCES pms_rooms(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  business_date DATE NOT NULL,
  reason TEXT,
  changed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pms_room_status_log_tenant ON pms_room_status_log(tenant_id);
CREATE INDEX idx_pms_room_status_log_room ON pms_room_status_log(room_id);
CREATE INDEX idx_pms_room_status_log_date ON pms_room_status_log(tenant_id, property_id, business_date);

ALTER TABLE pms_room_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_room_status_log_select ON pms_room_status_log FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_room_status_log_insert ON pms_room_status_log FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 12. pms_audit_log — PMS-specific audit log
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  diff_json JSONB,
  actor_id TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pms_audit_log_tenant ON pms_audit_log(tenant_id);
CREATE INDEX idx_pms_audit_log_entity ON pms_audit_log(tenant_id, entity_type, entity_id);
CREATE INDEX idx_pms_audit_log_date ON pms_audit_log(tenant_id, property_id, created_at);

ALTER TABLE pms_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_audit_log_select ON pms_audit_log FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_audit_log_insert ON pms_audit_log FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 13. pms_idempotency_keys — idempotency for calendar operations
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_idempotency_keys (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  command TEXT NOT NULL,
  response_json JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_pms_idempotency_keys ON pms_idempotency_keys(tenant_id, key);
CREATE INDEX idx_pms_idempotency_keys_expires ON pms_idempotency_keys(expires_at);

ALTER TABLE pms_idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_idempotency_keys_select ON pms_idempotency_keys FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_idempotency_keys_insert ON pms_idempotency_keys FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 14. pms_outbox — domain event outbox
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pms_outbox (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pms_outbox_status ON pms_outbox(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_pms_outbox_tenant ON pms_outbox(tenant_id);

ALTER TABLE pms_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY pms_outbox_select ON pms_outbox FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_outbox_insert ON pms_outbox FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY pms_outbox_update ON pms_outbox FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 15. rm_pms_calendar_segments — calendar read model (one row per reservation-room-day)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rm_pms_calendar_segments (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  room_id TEXT NOT NULL REFERENCES pms_rooms(id),
  business_date DATE NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES pms_reservations(id),
  status TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'DIRECT',
  color_key TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rm_pms_calendar_segments_query ON rm_pms_calendar_segments(tenant_id, property_id, business_date);
CREATE UNIQUE INDEX uq_rm_pms_calendar_segments ON rm_pms_calendar_segments(tenant_id, property_id, room_id, business_date);
CREATE INDEX idx_rm_pms_calendar_segments_reservation ON rm_pms_calendar_segments(reservation_id);

ALTER TABLE rm_pms_calendar_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY rm_pms_calendar_segments_select ON rm_pms_calendar_segments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_pms_calendar_segments_insert ON rm_pms_calendar_segments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_pms_calendar_segments_update ON rm_pms_calendar_segments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_pms_calendar_segments_delete ON rm_pms_calendar_segments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- 16. rm_pms_daily_occupancy — occupancy dashboard read model
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rm_pms_daily_occupancy (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  business_date DATE NOT NULL,
  total_rooms INTEGER NOT NULL DEFAULT 0,
  rooms_occupied INTEGER NOT NULL DEFAULT 0,
  rooms_available INTEGER NOT NULL DEFAULT 0,
  rooms_ooo INTEGER NOT NULL DEFAULT 0,
  arrivals INTEGER NOT NULL DEFAULT 0,
  departures INTEGER NOT NULL DEFAULT 0,
  occupancy_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  adr_cents INTEGER NOT NULL DEFAULT 0,
  revpar_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_rm_pms_daily_occupancy ON rm_pms_daily_occupancy(tenant_id, property_id, business_date);
CREATE INDEX idx_rm_pms_daily_occupancy_query ON rm_pms_daily_occupancy(tenant_id, property_id, business_date);

ALTER TABLE rm_pms_daily_occupancy ENABLE ROW LEVEL SECURITY;
CREATE POLICY rm_pms_daily_occupancy_select ON rm_pms_daily_occupancy FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_pms_daily_occupancy_insert ON rm_pms_daily_occupancy FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_pms_daily_occupancy_update ON rm_pms_daily_occupancy FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY rm_pms_daily_occupancy_delete ON rm_pms_daily_occupancy FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
