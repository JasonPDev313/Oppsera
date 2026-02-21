-- ═══════════════════════════════════════════════════════════════════
-- Migration 0082: F&B POS — Complete Schema
-- Sessions 1-15: Table Management, Sections, Tabs, Kitchen,
--   KDS, Modifiers, Payments, Pre-Auth, Tips, Close Batch,
--   Sync, Receipts, Reporting
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 1 — Table Management & Floor Plan Extension
-- ═══════════════════════════════════════════════════════════════════

-- F&B Tables (first-class entities extracted from floor plan)
CREATE TABLE IF NOT EXISTS fnb_tables (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  room_id TEXT NOT NULL REFERENCES floor_plan_rooms(id),
  section_id TEXT, -- FK stub for Session 2
  floor_plan_object_id TEXT,
  table_number INTEGER NOT NULL,
  display_label TEXT NOT NULL,
  capacity_min INTEGER NOT NULL DEFAULT 1,
  capacity_max INTEGER NOT NULL,
  table_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (table_type IN ('standard','bar_seat','communal','booth','high_top','patio')),
  shape TEXT NOT NULL DEFAULT 'square'
    CHECK (shape IN ('round','square','rectangle','custom','oval')),
  position_x NUMERIC(10,2) NOT NULL DEFAULT 0,
  position_y NUMERIC(10,2) NOT NULL DEFAULT 0,
  width NUMERIC(10,2) NOT NULL DEFAULT 0,
  height NUMERIC(10,2) NOT NULL DEFAULT 0,
  rotation NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_combinable BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE UNIQUE INDEX uq_fnb_tables_tenant_room_number ON fnb_tables(tenant_id, room_id, table_number);
CREATE INDEX idx_fnb_tables_tenant_room_active ON fnb_tables(tenant_id, room_id, is_active);
CREATE INDEX idx_fnb_tables_tenant_location ON fnb_tables(tenant_id, location_id);
CREATE INDEX idx_fnb_tables_section ON fnb_tables(section_id) WHERE section_id IS NOT NULL;

-- F&B Table Live Status
CREATE TABLE IF NOT EXISTS fnb_table_live_status (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  table_id TEXT NOT NULL REFERENCES fnb_tables(id),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','seated','ordered','entrees_fired','dessert','check_presented','paid','dirty','blocked')),
  current_tab_id TEXT, -- FK stub for Session 3
  current_server_user_id TEXT,
  seated_at TIMESTAMPTZ,
  party_size INTEGER,
  estimated_turn_time_minutes INTEGER,
  guest_names TEXT,
  waitlist_entry_id TEXT,
  combine_group_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_table_live_status_table ON fnb_table_live_status(tenant_id, table_id);
CREATE INDEX idx_fnb_table_live_status_tenant_status ON fnb_table_live_status(tenant_id, status);
CREATE INDEX idx_fnb_table_live_status_server ON fnb_table_live_status(tenant_id, current_server_user_id) WHERE current_server_user_id IS NOT NULL;
CREATE INDEX idx_fnb_table_live_status_tab ON fnb_table_live_status(current_tab_id) WHERE current_tab_id IS NOT NULL;

-- F&B Table Status History
CREATE TABLE IF NOT EXISTS fnb_table_status_history (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  table_id TEXT NOT NULL REFERENCES fnb_tables(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT,
  party_size INTEGER,
  server_user_id TEXT,
  tab_id TEXT,
  metadata JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_table_status_history_table_changed ON fnb_table_status_history(tenant_id, table_id, changed_at);
CREATE INDEX idx_fnb_table_status_history_tenant_changed ON fnb_table_status_history(tenant_id, changed_at);

-- F&B Table Combine Groups
CREATE TABLE IF NOT EXISTS fnb_table_combine_groups (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','dissolved')),
  primary_table_id TEXT NOT NULL REFERENCES fnb_tables(id),
  combined_capacity INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX idx_fnb_combine_groups_tenant_location_status ON fnb_table_combine_groups(tenant_id, location_id, status);

-- F&B Table Combine Members
CREATE TABLE IF NOT EXISTS fnb_table_combine_members (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  combine_group_id TEXT NOT NULL REFERENCES fnb_table_combine_groups(id),
  table_id TEXT NOT NULL REFERENCES fnb_tables(id),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_combine_members_group_table ON fnb_table_combine_members(combine_group_id, table_id);
CREATE INDEX idx_fnb_combine_members_table ON fnb_table_combine_members(table_id);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 2 — Server Sections & Shift Model
-- ═══════════════════════════════════════════════════════════════════

-- F&B Sections
CREATE TABLE IF NOT EXISTS fnb_sections (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  room_id TEXT NOT NULL REFERENCES floor_plan_rooms(id),
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE UNIQUE INDEX uq_fnb_sections_tenant_room_name ON fnb_sections(tenant_id, room_id, name);
CREATE INDEX idx_fnb_sections_tenant_location_active ON fnb_sections(tenant_id, location_id, is_active);

-- Add FK from fnb_tables.section_id -> fnb_sections.id
ALTER TABLE fnb_tables ADD CONSTRAINT fk_fnb_tables_section
  FOREIGN KEY (section_id) REFERENCES fnb_sections(id);

-- F&B Server Assignments
CREATE TABLE IF NOT EXISTS fnb_server_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  section_id TEXT NOT NULL REFERENCES fnb_sections(id),
  server_user_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cut','picked_up','ended')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cut_at TIMESTAMPTZ,
  cut_by TEXT,
  picked_up_by TEXT,
  picked_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_server_assignments_tenant_date_status ON fnb_server_assignments(tenant_id, business_date, status);
CREATE INDEX idx_fnb_server_assignments_server_date ON fnb_server_assignments(tenant_id, server_user_id, business_date);
CREATE INDEX idx_fnb_server_assignments_section_date ON fnb_server_assignments(section_id, business_date);

-- F&B Shift Extensions
CREATE TABLE IF NOT EXISTS fnb_shift_extensions (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  employee_time_entry_id TEXT NOT NULL,
  server_user_id TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date DATE NOT NULL,
  shift_status TEXT NOT NULL DEFAULT 'serving'
    CHECK (shift_status IN ('serving','cut','closing','closed')),
  covers_served INTEGER NOT NULL DEFAULT 0,
  total_sales_cents INTEGER NOT NULL DEFAULT 0,
  total_tips_cents INTEGER NOT NULL DEFAULT 0,
  open_tab_count INTEGER NOT NULL DEFAULT 0,
  cash_owed_cents INTEGER NOT NULL DEFAULT 0,
  cash_dropped_cents INTEGER NOT NULL DEFAULT 0,
  checkout_completed_at TIMESTAMPTZ,
  checkout_completed_by TEXT,
  sidework_checklist JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_shift_ext_time_entry ON fnb_shift_extensions(tenant_id, employee_time_entry_id);
CREATE INDEX idx_fnb_shift_ext_server_date ON fnb_shift_extensions(tenant_id, server_user_id, business_date);
CREATE INDEX idx_fnb_shift_ext_location_date_status ON fnb_shift_extensions(tenant_id, location_id, business_date, shift_status);

-- F&B Rotation Tracker
CREATE TABLE IF NOT EXISTS fnb_rotation_tracker (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date DATE NOT NULL,
  next_server_user_id TEXT NOT NULL,
  rotation_order JSONB NOT NULL,
  last_seated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_rotation_tracker_location_date ON fnb_rotation_tracker(tenant_id, location_id, business_date);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 3 — Tabs, Checks & Seat Lifecycle
-- ═══════════════════════════════════════════════════════════════════

-- F&B Tabs
CREATE TABLE IF NOT EXISTS fnb_tabs (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  tab_number INTEGER NOT NULL,
  tab_type TEXT NOT NULL DEFAULT 'dine_in'
    CHECK (tab_type IN ('dine_in','bar','takeout','quick_service')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','ordering','sent_to_kitchen','in_progress','check_requested','split','paying','closed','voided','transferred')),
  table_id TEXT REFERENCES fnb_tables(id),
  server_user_id TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  party_size INTEGER,
  guest_name TEXT,
  primary_order_id TEXT,
  service_type TEXT NOT NULL DEFAULT 'dine_in'
    CHECK (service_type IN ('dine_in','takeout','to_go')),
  current_course_number INTEGER NOT NULL DEFAULT 1,
  business_date DATE NOT NULL,
  customer_id TEXT,
  split_from_tab_id TEXT,
  split_strategy TEXT
    CHECK (split_strategy IS NULL OR split_strategy IN ('by_seat','by_item','equal_split','custom_amount')),
  transferred_from_tab_id TEXT,
  transferred_from_server_user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_tabs_location_date_number ON fnb_tabs(tenant_id, location_id, business_date, tab_number);
CREATE INDEX idx_fnb_tabs_server_status ON fnb_tabs(tenant_id, server_user_id, status);
CREATE INDEX idx_fnb_tabs_table ON fnb_tabs(tenant_id, table_id) WHERE table_id IS NOT NULL;
CREATE INDEX idx_fnb_tabs_tenant_location_status ON fnb_tabs(tenant_id, location_id, status);
CREATE INDEX idx_fnb_tabs_business_date ON fnb_tabs(tenant_id, location_id, business_date);
CREATE INDEX idx_fnb_tabs_primary_order ON fnb_tabs(primary_order_id) WHERE primary_order_id IS NOT NULL;

-- Add FK from fnb_table_live_status.current_tab_id -> fnb_tabs.id
ALTER TABLE fnb_table_live_status ADD CONSTRAINT fk_fnb_live_status_tab
  FOREIGN KEY (current_tab_id) REFERENCES fnb_tabs(id);

-- F&B Tab Number Counters
CREATE TABLE IF NOT EXISTS fnb_tab_counters (
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX uq_fnb_tab_counters_pk ON fnb_tab_counters(tenant_id, location_id, business_date);

-- F&B Tab Courses
CREATE TABLE IF NOT EXISTS fnb_tab_courses (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tab_id TEXT NOT NULL REFERENCES fnb_tabs(id),
  course_number INTEGER NOT NULL,
  course_name TEXT NOT NULL,
  course_status TEXT NOT NULL DEFAULT 'unsent'
    CHECK (course_status IN ('unsent','sent','fired','served','held')),
  fired_at TIMESTAMPTZ,
  fired_by TEXT,
  sent_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_tab_courses_tab_number ON fnb_tab_courses(tab_id, course_number);
CREATE INDEX idx_fnb_tab_courses_tab_status ON fnb_tab_courses(tab_id, course_status);

-- F&B Tab Transfers (Audit)
CREATE TABLE IF NOT EXISTS fnb_tab_transfers (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tab_id TEXT NOT NULL REFERENCES fnb_tabs(id),
  transfer_type TEXT NOT NULL
    CHECK (transfer_type IN ('server','table','item_move')),
  from_server_user_id TEXT,
  to_server_user_id TEXT,
  from_table_id TEXT,
  to_table_id TEXT,
  order_line_ids JSONB,
  reason TEXT,
  transferred_by TEXT NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_tab_transfers_tab ON fnb_tab_transfers(tab_id);
CREATE INDEX idx_fnb_tab_transfers_tenant_transferred ON fnb_tab_transfers(tenant_id, transferred_at);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 4 — Course Pacing, Hold/Fire & Kitchen Tickets
-- ═══════════════════════════════════════════════════════════════════

-- F&B Kitchen Tickets
CREATE TABLE IF NOT EXISTS fnb_kitchen_tickets (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  tab_id TEXT NOT NULL REFERENCES fnb_tabs(id),
  order_id TEXT NOT NULL,
  ticket_number INTEGER NOT NULL,
  course_number INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','ready','served','voided')),
  business_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  sent_by TEXT NOT NULL,
  table_number INTEGER,
  server_name TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_kitchen_tickets_location_date_number ON fnb_kitchen_tickets(tenant_id, location_id, business_date, ticket_number);
CREATE INDEX idx_fnb_kitchen_tickets_tab ON fnb_kitchen_tickets(tab_id);
CREATE INDEX idx_fnb_kitchen_tickets_status ON fnb_kitchen_tickets(tenant_id, location_id, status);
CREATE INDEX idx_fnb_kitchen_tickets_date ON fnb_kitchen_tickets(tenant_id, location_id, business_date);

-- F&B Kitchen Ticket Number Counters
CREATE TABLE IF NOT EXISTS fnb_kitchen_ticket_counters (
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX uq_fnb_kitchen_ticket_counters_pk ON fnb_kitchen_ticket_counters(tenant_id, location_id, business_date);

-- F&B Kitchen Ticket Items
CREATE TABLE IF NOT EXISTS fnb_kitchen_ticket_items (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  ticket_id TEXT NOT NULL REFERENCES fnb_kitchen_tickets(id),
  order_line_id TEXT NOT NULL,
  item_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (item_status IN ('pending','cooking','ready','served','voided')),
  station_id TEXT,
  item_name TEXT NOT NULL,
  modifier_summary TEXT,
  special_instructions TEXT,
  seat_number INTEGER,
  course_name TEXT,
  quantity NUMERIC(10,4) NOT NULL DEFAULT 1,
  is_rush BOOLEAN NOT NULL DEFAULT false,
  is_allergy BOOLEAN NOT NULL DEFAULT false,
  is_vip BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_ticket_items_ticket ON fnb_kitchen_ticket_items(ticket_id);
CREATE INDEX idx_fnb_ticket_items_station_status ON fnb_kitchen_ticket_items(station_id, item_status) WHERE station_id IS NOT NULL;
CREATE INDEX idx_fnb_ticket_items_order_line ON fnb_kitchen_ticket_items(order_line_id);

-- F&B Kitchen Routing Rules
CREATE TABLE IF NOT EXISTS fnb_kitchen_routing_rules (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  rule_type TEXT NOT NULL DEFAULT 'item'
    CHECK (rule_type IN ('item','modifier','department')),
  catalog_item_id TEXT,
  modifier_id TEXT,
  department_id TEXT,
  sub_department_id TEXT,
  station_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_routing_rules_item ON fnb_kitchen_routing_rules(tenant_id, location_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL;
CREATE INDEX idx_fnb_routing_rules_dept ON fnb_kitchen_routing_rules(tenant_id, location_id, department_id) WHERE department_id IS NOT NULL;
CREATE INDEX idx_fnb_routing_rules_station ON fnb_kitchen_routing_rules(station_id);

-- F&B Kitchen Delta Chits
CREATE TABLE IF NOT EXISTS fnb_kitchen_delta_chits (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  ticket_id TEXT NOT NULL REFERENCES fnb_kitchen_tickets(id),
  delta_type TEXT NOT NULL
    CHECK (delta_type IN ('add','void','modify','rush')),
  order_line_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  modifier_summary TEXT,
  seat_number INTEGER,
  quantity NUMERIC(10,4),
  reason TEXT,
  station_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_delta_chits_ticket ON fnb_kitchen_delta_chits(ticket_id);
CREATE INDEX idx_fnb_delta_chits_tenant_created ON fnb_kitchen_delta_chits(tenant_id, created_at);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 5 — KDS Stations & Expo
-- ═══════════════════════════════════════════════════════════════════

-- F&B Kitchen Stations
CREATE TABLE IF NOT EXISTS fnb_kitchen_stations (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  station_type TEXT NOT NULL DEFAULT 'prep'
    CHECK (station_type IN ('prep','expo','bar')),
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  fallback_station_id TEXT,
  backup_printer_id TEXT,
  terminal_location_id TEXT,
  warning_threshold_seconds INTEGER NOT NULL DEFAULT 480,
  critical_threshold_seconds INTEGER NOT NULL DEFAULT 720,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_kitchen_stations_tenant_location_name ON fnb_kitchen_stations(tenant_id, location_id, name);
CREATE INDEX idx_fnb_kitchen_stations_tenant_location_active ON fnb_kitchen_stations(tenant_id, location_id, is_active);

-- Add FK from fnb_kitchen_ticket_items.station_id and fnb_kitchen_routing_rules.station_id
ALTER TABLE fnb_kitchen_ticket_items ADD CONSTRAINT fk_fnb_ticket_items_station
  FOREIGN KEY (station_id) REFERENCES fnb_kitchen_stations(id);
ALTER TABLE fnb_kitchen_routing_rules ADD CONSTRAINT fk_fnb_routing_rules_station
  FOREIGN KEY (station_id) REFERENCES fnb_kitchen_stations(id);
ALTER TABLE fnb_kitchen_delta_chits ADD CONSTRAINT fk_fnb_delta_chits_station
  FOREIGN KEY (station_id) REFERENCES fnb_kitchen_stations(id);

-- F&B Station Display Configs
CREATE TABLE IF NOT EXISTS fnb_station_display_configs (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT NOT NULL REFERENCES fnb_kitchen_stations(id),
  display_device_id TEXT,
  display_mode TEXT NOT NULL DEFAULT 'standard'
    CHECK (display_mode IN ('standard','compact','expo')),
  columns_per_row INTEGER NOT NULL DEFAULT 4,
  sort_by TEXT NOT NULL DEFAULT 'time'
    CHECK (sort_by IN ('time','priority','course')),
  show_modifiers BOOLEAN NOT NULL DEFAULT true,
  show_seat_numbers BOOLEAN NOT NULL DEFAULT true,
  show_course_headers BOOLEAN NOT NULL DEFAULT true,
  auto_scroll_enabled BOOLEAN NOT NULL DEFAULT false,
  sound_alert_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_station_display_configs_station ON fnb_station_display_configs(station_id);

-- F&B Station Metrics Snapshot
CREATE TABLE IF NOT EXISTS fnb_station_metrics_snapshot (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT NOT NULL REFERENCES fnb_kitchen_stations(id),
  business_date DATE NOT NULL,
  tickets_processed INTEGER NOT NULL DEFAULT 0,
  avg_ticket_time_seconds INTEGER,
  items_bumped INTEGER NOT NULL DEFAULT 0,
  items_voided INTEGER NOT NULL DEFAULT 0,
  tickets_past_threshold INTEGER NOT NULL DEFAULT 0,
  peak_hour INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_station_metrics_station_date ON fnb_station_metrics_snapshot(station_id, business_date);
CREATE INDEX idx_fnb_station_metrics_tenant_date ON fnb_station_metrics_snapshot(tenant_id, business_date);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 6 — Modifiers, 86 Board & Menu Availability
-- ═══════════════════════════════════════════════════════════════════

-- F&B 86 Log
CREATE TABLE IF NOT EXISTS fnb_eighty_six_log (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('item','modifier')),
  entity_id TEXT NOT NULL,
  station_id TEXT,
  reason TEXT,
  eighty_sixed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  eighty_sixed_by TEXT NOT NULL,
  restored_at TIMESTAMPTZ,
  restored_by TEXT,
  auto_restore_at_day_end BOOLEAN NOT NULL DEFAULT true,
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_86_log_active ON fnb_eighty_six_log(tenant_id, location_id, entity_type, entity_id);
CREATE INDEX idx_fnb_86_log_tenant_date ON fnb_eighty_six_log(tenant_id, location_id, business_date);

-- F&B Menu Periods
CREATE TABLE IF NOT EXISTS fnb_menu_periods (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  days_of_week JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_menu_periods_location_name ON fnb_menu_periods(tenant_id, location_id, name);
CREATE INDEX idx_fnb_menu_periods_location_active ON fnb_menu_periods(tenant_id, location_id, is_active);

-- F&B Menu Availability Windows
CREATE TABLE IF NOT EXISTS fnb_menu_availability_windows (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('item','category')),
  entity_id TEXT NOT NULL,
  menu_period_id TEXT REFERENCES fnb_menu_periods(id),
  start_date DATE,
  end_date DATE,
  hide_when_unavailable BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_availability_entity ON fnb_menu_availability_windows(tenant_id, location_id, entity_type, entity_id);
CREATE INDEX idx_fnb_availability_period ON fnb_menu_availability_windows(menu_period_id) WHERE menu_period_id IS NOT NULL;

-- F&B Allergen Definitions
CREATE TABLE IF NOT EXISTS fnb_allergen_definitions (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  icon TEXT,
  severity TEXT NOT NULL DEFAULT 'standard'
    CHECK (severity IN ('standard','severe')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_allergen_definitions_tenant_name ON fnb_allergen_definitions(tenant_id, name);

-- F&B Item Allergens
CREATE TABLE IF NOT EXISTS fnb_item_allergens (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  catalog_item_id TEXT NOT NULL,
  allergen_id TEXT NOT NULL REFERENCES fnb_allergen_definitions(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_item_allergens_item_allergen ON fnb_item_allergens(catalog_item_id, allergen_id);
CREATE INDEX idx_fnb_item_allergens_item ON fnb_item_allergens(tenant_id, catalog_item_id);

-- F&B Prep Note Presets
CREATE TABLE IF NOT EXISTS fnb_prep_note_presets (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT REFERENCES locations(id),
  catalog_item_id TEXT,
  note_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_prep_note_presets_tenant_location ON fnb_prep_note_presets(tenant_id, location_id);
CREATE INDEX idx_fnb_prep_note_presets_item ON fnb_prep_note_presets(tenant_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 7 — Split Checks, Merged Tabs & Payment Flows
-- ═══════════════════════════════════════════════════════════════════

-- F&B Auto Gratuity Rules
CREATE TABLE IF NOT EXISTS fnb_auto_gratuity_rules (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT REFERENCES locations(id),
  name TEXT NOT NULL,
  party_size_threshold INTEGER NOT NULL,
  gratuity_percentage NUMERIC(5,2) NOT NULL,
  is_taxable BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_auto_gratuity_tenant_location ON fnb_auto_gratuity_rules(tenant_id, location_id);

-- F&B Payment Sessions
CREATE TABLE IF NOT EXISTS fnb_payment_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tab_id TEXT NOT NULL REFERENCES fnb_tabs(id),
  order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','failed')),
  check_presented_at TIMESTAMPTZ,
  check_presented_by TEXT,
  split_strategy TEXT
    CHECK (split_strategy IS NULL OR split_strategy IN ('by_seat','by_item','equal_split','custom_amount')),
  split_details JSONB,
  total_amount_cents INTEGER NOT NULL,
  paid_amount_cents INTEGER NOT NULL DEFAULT 0,
  remaining_amount_cents INTEGER NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_payment_sessions_tab ON fnb_payment_sessions(tab_id);
CREATE INDEX idx_fnb_payment_sessions_order ON fnb_payment_sessions(order_id);
CREATE INDEX idx_fnb_payment_sessions_status ON fnb_payment_sessions(tenant_id, status);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 8 — Pre-Auth Bar Tabs & Card-on-File
-- ═══════════════════════════════════════════════════════════════════

-- F&B Tab Pre-Auths
CREATE TABLE IF NOT EXISTS fnb_tab_preauths (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tab_id TEXT NOT NULL REFERENCES fnb_tabs(id),
  status TEXT NOT NULL DEFAULT 'authorized'
    CHECK (status IN ('authorized','captured','adjusted','finalized','voided','expired')),
  auth_amount_cents INTEGER NOT NULL,
  captured_amount_cents INTEGER,
  tip_amount_cents INTEGER,
  final_amount_cents INTEGER,
  card_token TEXT NOT NULL,
  card_last4 TEXT NOT NULL,
  card_brand TEXT,
  provider_ref TEXT,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at TIMESTAMPTZ,
  adjusted_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_walkout BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_tab_preauths_tab ON fnb_tab_preauths(tab_id);
CREATE INDEX idx_fnb_tab_preauths_status ON fnb_tab_preauths(tenant_id, status);

-- F&B Tip Adjustments
CREATE TABLE IF NOT EXISTS fnb_tip_adjustments (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tab_id TEXT NOT NULL REFERENCES fnb_tabs(id),
  preauth_id TEXT REFERENCES fnb_tab_preauths(id),
  tender_id TEXT,
  original_tip_cents INTEGER NOT NULL DEFAULT 0,
  adjusted_tip_cents INTEGER NOT NULL,
  adjustment_reason TEXT,
  adjusted_by TEXT NOT NULL,
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_final BOOLEAN NOT NULL DEFAULT false,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_tip_adjustments_tab ON fnb_tip_adjustments(tab_id);
CREATE INDEX idx_fnb_tip_adjustments_tenant_adjusted ON fnb_tip_adjustments(tenant_id, adjusted_at);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 9 — Tips, Tip Pooling & Gratuity Rules
-- ═══════════════════════════════════════════════════════════════════

-- F&B Tip Pools
CREATE TABLE IF NOT EXISTS fnb_tip_pools (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  pool_type TEXT NOT NULL
    CHECK (pool_type IN ('full','percentage','points')),
  pool_scope TEXT NOT NULL DEFAULT 'daily'
    CHECK (pool_scope IN ('shift','daily','location')),
  percentage_to_pool NUMERIC(5,2),
  distribution_method TEXT NOT NULL DEFAULT 'hours'
    CHECK (distribution_method IN ('hours','points','equal')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_tip_pools_tenant_location ON fnb_tip_pools(tenant_id, location_id);

-- F&B Tip Pool Participants
CREATE TABLE IF NOT EXISTS fnb_tip_pool_participants (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pool_id TEXT NOT NULL REFERENCES fnb_tip_pools(id),
  role_id TEXT NOT NULL,
  points_value INTEGER NOT NULL DEFAULT 10,
  is_contributor BOOLEAN NOT NULL DEFAULT true,
  is_recipient BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_tip_pool_participants_pool_role ON fnb_tip_pool_participants(pool_id, role_id);

-- F&B Tip Pool Distributions
CREATE TABLE IF NOT EXISTS fnb_tip_pool_distributions (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pool_id TEXT NOT NULL REFERENCES fnb_tip_pools(id),
  business_date DATE NOT NULL,
  total_pool_amount_cents INTEGER NOT NULL,
  distribution_details JSONB NOT NULL,
  distributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  distributed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_tip_pool_distributions_pool_date ON fnb_tip_pool_distributions(pool_id, business_date);
CREATE INDEX idx_fnb_tip_pool_distributions_tenant_date ON fnb_tip_pool_distributions(tenant_id, business_date);

-- F&B Tip Declarations
CREATE TABLE IF NOT EXISTS fnb_tip_declarations (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  server_user_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  cash_tips_declared_cents INTEGER NOT NULL,
  cash_sales_cents INTEGER NOT NULL DEFAULT 0,
  declaration_percentage NUMERIC(5,2),
  meets_minimum_threshold BOOLEAN NOT NULL DEFAULT true,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_tip_declarations_server_date ON fnb_tip_declarations(tenant_id, server_user_id, business_date);
CREATE INDEX idx_fnb_tip_declarations_tenant_date ON fnb_tip_declarations(tenant_id, business_date);

-- F&B Tip Out Entries
CREATE TABLE IF NOT EXISTS fnb_tip_out_entries (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  from_server_user_id TEXT NOT NULL,
  to_employee_id TEXT NOT NULL,
  to_role_name TEXT,
  business_date DATE NOT NULL,
  amount_cents INTEGER NOT NULL,
  calculation_method TEXT NOT NULL
    CHECK (calculation_method IN ('fixed','percentage_of_tips','percentage_of_sales')),
  calculation_basis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_tip_out_from_server_date ON fnb_tip_out_entries(tenant_id, from_server_user_id, business_date);
CREATE INDEX idx_fnb_tip_out_to_employee_date ON fnb_tip_out_entries(tenant_id, to_employee_id, business_date);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 10 — Close Batch, Z-Report & Cash Control
-- ═══════════════════════════════════════════════════════════════════

-- F&B Close Batches
CREATE TABLE IF NOT EXISTS fnb_close_batches (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  business_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','reconciled','posted','locked')),
  started_at TIMESTAMPTZ,
  started_by TEXT,
  reconciled_at TIMESTAMPTZ,
  reconciled_by TEXT,
  posted_at TIMESTAMPTZ,
  posted_by TEXT,
  locked_at TIMESTAMPTZ,
  gl_journal_entry_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_close_batches_location_date ON fnb_close_batches(tenant_id, location_id, business_date);
CREATE INDEX idx_fnb_close_batches_status ON fnb_close_batches(tenant_id, status);

-- F&B Close Batch Summaries
CREATE TABLE IF NOT EXISTS fnb_close_batch_summaries (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  close_batch_id TEXT NOT NULL REFERENCES fnb_close_batches(id),
  gross_sales_cents INTEGER NOT NULL DEFAULT 0,
  net_sales_cents INTEGER NOT NULL DEFAULT 0,
  tax_collected_cents INTEGER NOT NULL DEFAULT 0,
  tips_credit_cents INTEGER NOT NULL DEFAULT 0,
  tips_cash_declared_cents INTEGER NOT NULL DEFAULT 0,
  service_charges_cents INTEGER NOT NULL DEFAULT 0,
  discounts_cents INTEGER NOT NULL DEFAULT 0,
  comps_cents INTEGER NOT NULL DEFAULT 0,
  voids_cents INTEGER NOT NULL DEFAULT 0,
  voids_count INTEGER NOT NULL DEFAULT 0,
  discounts_count INTEGER NOT NULL DEFAULT 0,
  comps_count INTEGER NOT NULL DEFAULT 0,
  covers_count INTEGER NOT NULL DEFAULT 0,
  avg_check_cents INTEGER NOT NULL DEFAULT 0,
  tender_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  sales_by_department JSONB,
  tax_by_group JSONB,
  cash_starting_float_cents INTEGER NOT NULL DEFAULT 0,
  cash_sales_cents INTEGER NOT NULL DEFAULT 0,
  cash_tips_cents INTEGER NOT NULL DEFAULT 0,
  cash_drops_cents INTEGER NOT NULL DEFAULT 0,
  cash_paid_outs_cents INTEGER NOT NULL DEFAULT 0,
  cash_expected_cents INTEGER NOT NULL DEFAULT 0,
  cash_counted_cents INTEGER,
  cash_over_short_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_close_batch_summaries_batch ON fnb_close_batch_summaries(close_batch_id);

-- F&B Server Checkouts
CREATE TABLE IF NOT EXISTS fnb_server_checkouts (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  close_batch_id TEXT NOT NULL REFERENCES fnb_close_batches(id),
  server_user_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed')),
  total_sales_cents INTEGER NOT NULL DEFAULT 0,
  cash_collected_cents INTEGER NOT NULL DEFAULT 0,
  credit_tips_cents INTEGER NOT NULL DEFAULT 0,
  cash_tips_declared_cents INTEGER NOT NULL DEFAULT 0,
  tip_out_paid_cents INTEGER NOT NULL DEFAULT 0,
  cash_owed_to_house_cents INTEGER NOT NULL DEFAULT 0,
  open_tab_count INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_server_checkouts_batch_server ON fnb_server_checkouts(close_batch_id, server_user_id);
CREATE INDEX idx_fnb_server_checkouts_tenant_date ON fnb_server_checkouts(tenant_id, business_date);

-- F&B Cash Drops
CREATE TABLE IF NOT EXISTS fnb_cash_drops (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  close_batch_id TEXT REFERENCES fnb_close_batches(id),
  amount_cents INTEGER NOT NULL,
  employee_id TEXT NOT NULL,
  terminal_id TEXT,
  business_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_cash_drops_batch ON fnb_cash_drops(close_batch_id) WHERE close_batch_id IS NOT NULL;
CREATE INDEX idx_fnb_cash_drops_tenant_date ON fnb_cash_drops(tenant_id, location_id, business_date);

-- F&B Cash Paid Outs
CREATE TABLE IF NOT EXISTS fnb_cash_paid_outs (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  close_batch_id TEXT REFERENCES fnb_close_batches(id),
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  vendor_name TEXT,
  employee_id TEXT NOT NULL,
  approved_by TEXT,
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_cash_paid_outs_batch ON fnb_cash_paid_outs(close_batch_id) WHERE close_batch_id IS NOT NULL;
CREATE INDEX idx_fnb_cash_paid_outs_tenant_date ON fnb_cash_paid_outs(tenant_id, location_id, business_date);

-- F&B Deposit Slips
CREATE TABLE IF NOT EXISTS fnb_deposit_slips (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  close_batch_id TEXT NOT NULL REFERENCES fnb_close_batches(id),
  deposit_amount_cents INTEGER NOT NULL,
  deposit_date DATE NOT NULL,
  bank_reference TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_deposit_slips_batch ON fnb_deposit_slips(close_batch_id);
CREATE INDEX idx_fnb_deposit_slips_tenant_date ON fnb_deposit_slips(tenant_id, deposit_date);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 13 — Real-Time Sync, Concurrency & Offline
-- ═══════════════════════════════════════════════════════════════════

-- F&B Soft Locks
CREATE TABLE IF NOT EXISTS fnb_soft_locks (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('tab','table','ticket')),
  entity_id TEXT NOT NULL,
  locked_by TEXT NOT NULL,
  terminal_id TEXT,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fnb_soft_locks_entity ON fnb_soft_locks(tenant_id, entity_type, entity_id);
CREATE INDEX idx_fnb_soft_locks_expires ON fnb_soft_locks(expires_at);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 14 — Receipts, Printer Routing & Chit Design
-- ═══════════════════════════════════════════════════════════════════

-- F&B Print Routing Rules
CREATE TABLE IF NOT EXISTS fnb_print_routing_rules (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  station_id TEXT REFERENCES fnb_kitchen_stations(id),
  printer_id TEXT NOT NULL,
  print_job_type TEXT NOT NULL
    CHECK (print_job_type IN ('kitchen_chit','bar_chit','delta_chit','expo_chit','guest_check','receipt','cash_drop_receipt','close_batch_report')),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fnb_print_routing_station ON fnb_print_routing_rules(station_id) WHERE station_id IS NOT NULL;
CREATE INDEX idx_fnb_print_routing_location_type ON fnb_print_routing_rules(tenant_id, location_id, print_job_type);

-- ═══════════════════════════════════════════════════════════════════
-- SESSION 15 — F&B Reporting Read Models
-- ═══════════════════════════════════════════════════════════════════

-- rm_fnb_server_performance
CREATE TABLE IF NOT EXISTS rm_fnb_server_performance (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  server_user_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  covers INTEGER NOT NULL DEFAULT 0,
  total_sales NUMERIC(19,4) NOT NULL DEFAULT 0,
  avg_check NUMERIC(19,4) NOT NULL DEFAULT 0,
  tip_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  tip_percentage NUMERIC(5,2),
  tables_turned INTEGER NOT NULL DEFAULT 0,
  avg_turn_time_minutes INTEGER,
  comps NUMERIC(19,4) NOT NULL DEFAULT 0,
  voids NUMERIC(19,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_rm_fnb_server_perf ON rm_fnb_server_performance(tenant_id, location_id, server_user_id, business_date);
CREATE INDEX idx_rm_fnb_server_perf_date ON rm_fnb_server_performance(tenant_id, business_date);

-- rm_fnb_table_turns
CREATE TABLE IF NOT EXISTS rm_fnb_table_turns (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  turns_count INTEGER NOT NULL DEFAULT 0,
  avg_party_size NUMERIC(5,2),
  avg_turn_time_minutes INTEGER,
  avg_check_cents INTEGER,
  total_revenue_cents INTEGER NOT NULL DEFAULT 0,
  peak_hour_turns JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_rm_fnb_table_turns ON rm_fnb_table_turns(tenant_id, location_id, table_id, business_date);
CREATE INDEX idx_rm_fnb_table_turns_date ON rm_fnb_table_turns(tenant_id, business_date);

-- rm_fnb_kitchen_performance
CREATE TABLE IF NOT EXISTS rm_fnb_kitchen_performance (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  tickets_processed INTEGER NOT NULL DEFAULT 0,
  avg_ticket_time_seconds INTEGER,
  items_bumped INTEGER NOT NULL DEFAULT 0,
  items_voided INTEGER NOT NULL DEFAULT 0,
  tickets_past_threshold INTEGER NOT NULL DEFAULT 0,
  peak_hour INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_rm_fnb_kitchen_perf ON rm_fnb_kitchen_performance(tenant_id, location_id, station_id, business_date);
CREATE INDEX idx_rm_fnb_kitchen_perf_date ON rm_fnb_kitchen_performance(tenant_id, business_date);

-- rm_fnb_daypart_sales
CREATE TABLE IF NOT EXISTS rm_fnb_daypart_sales (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  daypart TEXT NOT NULL
    CHECK (daypart IN ('breakfast','lunch','dinner','late_night')),
  covers INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  gross_sales NUMERIC(19,4) NOT NULL DEFAULT 0,
  net_sales NUMERIC(19,4) NOT NULL DEFAULT 0,
  avg_check NUMERIC(19,4) NOT NULL DEFAULT 0,
  top_items_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_rm_fnb_daypart_sales ON rm_fnb_daypart_sales(tenant_id, location_id, business_date, daypart);
CREATE INDEX idx_rm_fnb_daypart_sales_date ON rm_fnb_daypart_sales(tenant_id, business_date);

-- rm_fnb_menu_mix
CREATE TABLE IF NOT EXISTS rm_fnb_menu_mix (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  catalog_item_id TEXT NOT NULL,
  catalog_item_name TEXT NOT NULL,
  category_name TEXT,
  department_name TEXT,
  quantity_sold NUMERIC(10,4) NOT NULL DEFAULT 0,
  percentage_of_total_items NUMERIC(5,2),
  revenue NUMERIC(19,4) NOT NULL DEFAULT 0,
  percentage_of_total_revenue NUMERIC(5,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_rm_fnb_menu_mix ON rm_fnb_menu_mix(tenant_id, location_id, business_date, catalog_item_id);
CREATE INDEX idx_rm_fnb_menu_mix_date ON rm_fnb_menu_mix(tenant_id, business_date);

-- rm_fnb_discount_comp_analysis
CREATE TABLE IF NOT EXISTS rm_fnb_discount_comp_analysis (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  total_discounts NUMERIC(19,4) NOT NULL DEFAULT 0,
  discount_by_type JSONB,
  total_comps NUMERIC(19,4) NOT NULL DEFAULT 0,
  comp_by_reason JSONB,
  void_count INTEGER NOT NULL DEFAULT 0,
  void_by_reason JSONB,
  discount_as_pct_of_sales NUMERIC(5,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_rm_fnb_discount_comp ON rm_fnb_discount_comp_analysis(tenant_id, location_id, business_date);
CREATE INDEX idx_rm_fnb_discount_comp_date ON rm_fnb_discount_comp_analysis(tenant_id, business_date);

-- rm_fnb_hourly_sales
CREATE TABLE IF NOT EXISTS rm_fnb_hourly_sales (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  covers INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  sales_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_rm_fnb_hourly_sales ON rm_fnb_hourly_sales(tenant_id, location_id, business_date, hour);
CREATE INDEX idx_rm_fnb_hourly_sales_date ON rm_fnb_hourly_sales(tenant_id, business_date);

-- ═══════════════════════════════════════════════════════════════════
-- RLS Policies for all F&B tables
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all F&B tables
ALTER TABLE fnb_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_live_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_combine_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_combine_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_server_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_shift_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_rotation_tracker ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_ticket_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_delta_chits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_station_display_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_station_metrics_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_eighty_six_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_menu_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_menu_availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_allergen_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_item_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_prep_note_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_auto_gratuity_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_preauths ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_pool_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_pool_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_out_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_close_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_close_batch_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_server_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_cash_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_cash_paid_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_deposit_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_soft_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_print_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_server_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_table_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_kitchen_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_daypart_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_menu_mix ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_discount_comp_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_hourly_sales ENABLE ROW LEVEL SECURITY;

ALTER TABLE fnb_tables FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_live_status FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_combine_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_table_combine_members FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_sections FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_server_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_shift_extensions FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_rotation_tracker FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tabs FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_courses FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_ticket_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_ticket_items FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_routing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_delta_chits FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_kitchen_stations FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_station_display_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_station_metrics_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_eighty_six_log FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_menu_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_menu_availability_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_allergen_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_item_allergens FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_prep_note_presets FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_auto_gratuity_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_payment_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_preauths FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_pools FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_pool_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_pool_distributions FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_declarations FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_tip_out_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_close_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_close_batch_summaries FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_server_checkouts FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_cash_drops FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_cash_paid_outs FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_deposit_slips FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_soft_locks FORCE ROW LEVEL SECURITY;
ALTER TABLE fnb_print_routing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_server_performance FORCE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_table_turns FORCE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_kitchen_performance FORCE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_daypart_sales FORCE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_menu_mix FORCE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_discount_comp_analysis FORCE ROW LEVEL SECURITY;
ALTER TABLE rm_fnb_hourly_sales FORCE ROW LEVEL SECURITY;

-- Create RLS policies (SELECT/INSERT/UPDATE/DELETE) for all tenant-scoped tables
-- Using a helper pattern: tenant_id = current_setting('app.current_tenant_id')

DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'fnb_tables','fnb_table_live_status','fnb_table_status_history',
    'fnb_table_combine_groups','fnb_table_combine_members',
    'fnb_sections','fnb_server_assignments','fnb_shift_extensions','fnb_rotation_tracker',
    'fnb_tabs','fnb_tab_counters','fnb_tab_courses','fnb_tab_transfers',
    'fnb_kitchen_tickets','fnb_kitchen_ticket_counters','fnb_kitchen_ticket_items',
    'fnb_kitchen_routing_rules','fnb_kitchen_delta_chits',
    'fnb_kitchen_stations','fnb_station_display_configs','fnb_station_metrics_snapshot',
    'fnb_eighty_six_log','fnb_menu_periods','fnb_menu_availability_windows',
    'fnb_allergen_definitions','fnb_item_allergens','fnb_prep_note_presets',
    'fnb_auto_gratuity_rules','fnb_payment_sessions',
    'fnb_tab_preauths','fnb_tip_adjustments',
    'fnb_tip_pools','fnb_tip_pool_participants','fnb_tip_pool_distributions',
    'fnb_tip_declarations','fnb_tip_out_entries',
    'fnb_close_batches','fnb_close_batch_summaries','fnb_server_checkouts',
    'fnb_cash_drops','fnb_cash_paid_outs','fnb_deposit_slips',
    'fnb_soft_locks','fnb_print_routing_rules',
    'rm_fnb_server_performance','rm_fnb_table_turns','rm_fnb_kitchen_performance',
    'rm_fnb_daypart_sales','rm_fnb_menu_mix','rm_fnb_discount_comp_analysis','rm_fnb_hourly_sales'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_setting(''app.current_tenant_id'', true))',
      tbl || '_select', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true))',
      tbl || '_insert', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id = current_setting(''app.current_tenant_id'', true))',
      tbl || '_update', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (tenant_id = current_setting(''app.current_tenant_id'', true))',
      tbl || '_delete', tbl
    );
  END LOOP;
END $$;
