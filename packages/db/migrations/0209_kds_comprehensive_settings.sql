-- Migration 0209: Comprehensive KDS Settings & Configuration
-- Enhances the KDS infrastructure with industry-leading settings:
--   - Bump bar key mappings per station
--   - KDS display preferences (view modes, themes, font sizes)
--   - Station routing enhancements (channel/order-type conditions)
--   - Expo fire control settings
--   - Audio/visual alert configuration
--   - Performance target settings per station
--   - Assembly line / screen communication modes

-- ══════════════════════════════════════════════════════════════════
-- 1. Enhance fnb_kitchen_stations with new settings columns
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE fnb_kitchen_stations
  ADD COLUMN IF NOT EXISTS info_threshold_seconds integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS auto_bump_on_all_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS screen_communication_mode text NOT NULL DEFAULT 'independent',
  ADD COLUMN IF NOT EXISTS assembly_line_order integer,
  ADD COLUMN IF NOT EXISTS pause_receiving boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supervised_by_expo_id text,
  ADD COLUMN IF NOT EXISTS show_other_station_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_order_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_channels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS estimated_prep_seconds integer;

COMMENT ON COLUMN fnb_kitchen_stations.info_threshold_seconds IS 'On-time→Caution threshold (green→yellow)';
COMMENT ON COLUMN fnb_kitchen_stations.screen_communication_mode IS 'independent|multi_clear|prep_expo|assembly_line|mirror';
COMMENT ON COLUMN fnb_kitchen_stations.assembly_line_order IS 'Sequential order for assembly_line mode (1,2,3...)';
COMMENT ON COLUMN fnb_kitchen_stations.pause_receiving IS 'Temporarily stop routing new tickets to this station';
COMMENT ON COLUMN fnb_kitchen_stations.supervised_by_expo_id IS 'Which expo station supervises this prep station';
COMMENT ON COLUMN fnb_kitchen_stations.allowed_order_types IS 'Empty = all; else subset of dine_in,takeout,delivery,bar';
COMMENT ON COLUMN fnb_kitchen_stations.allowed_channels IS 'Empty = all; else subset of pos,online,kiosk,third_party';

-- ══════════════════════════════════════════════════════════════════
-- 2. Enhance fnb_station_display_configs with comprehensive settings
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE fnb_station_display_configs
  ADD COLUMN IF NOT EXISTS view_mode text NOT NULL DEFAULT 'ticket',
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS font_size text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS ticket_size text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS show_server_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_dining_option boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_order_source boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_special_instructions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_allergen_warnings boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_item_colors boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS consolidate_identical_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_payment_status boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modifier_display_mode text NOT NULL DEFAULT 'vertical',
  ADD COLUMN IF NOT EXISTS orientation text NOT NULL DEFAULT 'landscape',
  ADD COLUMN IF NOT EXISTS all_day_summary_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_day_max_items integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS show_prep_time_estimate boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_course_status boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS flash_on_new_ticket boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS flash_on_modification boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_bump_on_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS input_mode text NOT NULL DEFAULT 'touch';

COMMENT ON COLUMN fnb_station_display_configs.view_mode IS 'ticket|grid|split|all_day';
COMMENT ON COLUMN fnb_station_display_configs.theme IS 'dark|light';
COMMENT ON COLUMN fnb_station_display_configs.font_size IS 'small|medium|large|xlarge';
COMMENT ON COLUMN fnb_station_display_configs.ticket_size IS 'small|medium|large|dynamic';
COMMENT ON COLUMN fnb_station_display_configs.modifier_display_mode IS 'vertical|horizontal|inline';
COMMENT ON COLUMN fnb_station_display_configs.orientation IS 'landscape|portrait';
COMMENT ON COLUMN fnb_station_display_configs.input_mode IS 'touch|bump_bar|both';

-- ══════════════════════════════════════════════════════════════════
-- 3. KDS Bump Bar Profiles
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_kds_bump_bar_profiles (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  location_id text REFERENCES locations(id),
  profile_name text NOT NULL,
  button_count integer NOT NULL DEFAULT 10,
  key_mappings jsonb NOT NULL DEFAULT '[]',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_bump_bar_profiles_tenant_name
  ON fnb_kds_bump_bar_profiles(tenant_id, profile_name);

CREATE INDEX IF NOT EXISTS idx_fnb_bump_bar_profiles_tenant_active
  ON fnb_kds_bump_bar_profiles(tenant_id, is_active);

COMMENT ON TABLE fnb_kds_bump_bar_profiles IS 'Bump bar key mapping profiles — each profile maps physical buttons to KDS actions';
COMMENT ON COLUMN fnb_kds_bump_bar_profiles.key_mappings IS 'Array of {buttonIndex, scanCode, action, label, color?}';

-- ══════════════════════════════════════════════════════════════════
-- 4. KDS Sound/Alert Profiles
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_kds_alert_profiles (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  location_id text REFERENCES locations(id),
  profile_name text NOT NULL,
  new_ticket_alert jsonb,
  warning_alert jsonb,
  critical_alert jsonb,
  rush_alert jsonb,
  allergy_alert jsonb,
  modification_alert jsonb,
  complete_alert jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_kds_alert_profiles_tenant_name
  ON fnb_kds_alert_profiles(tenant_id, profile_name);

COMMENT ON TABLE fnb_kds_alert_profiles IS 'Audio/visual alert configuration profiles for KDS stations';

-- ══════════════════════════════════════════════════════════════════
-- 5. Link stations to profiles
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE fnb_station_display_configs
  ADD COLUMN IF NOT EXISTS bump_bar_profile_id text,
  ADD COLUMN IF NOT EXISTS alert_profile_id text;

-- ══════════════════════════════════════════════════════════════════
-- 6. Enhance routing rules with condition-based routing
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE fnb_kitchen_routing_rules
  ADD COLUMN IF NOT EXISTS rule_name text,
  ADD COLUMN IF NOT EXISTS order_type_condition text,
  ADD COLUMN IF NOT EXISTS channel_condition text,
  ADD COLUMN IF NOT EXISTS time_condition_start text,
  ADD COLUMN IF NOT EXISTS time_condition_end text,
  ADD COLUMN IF NOT EXISTS category_id text;

COMMENT ON COLUMN fnb_kitchen_routing_rules.order_type_condition IS 'Only apply for: dine_in|takeout|delivery|bar (null=all)';
COMMENT ON COLUMN fnb_kitchen_routing_rules.channel_condition IS 'Only apply for: pos|online|kiosk|third_party (null=all)';
COMMENT ON COLUMN fnb_kitchen_routing_rules.time_condition_start IS 'HH:MM start of time window (null=always)';
COMMENT ON COLUMN fnb_kitchen_routing_rules.time_condition_end IS 'HH:MM end of time window (null=always)';
COMMENT ON COLUMN fnb_kitchen_routing_rules.category_id IS 'Catalog category (more granular than department)';

-- Index for category-based routing
CREATE INDEX IF NOT EXISTS idx_fnb_routing_rules_category
  ON fnb_kitchen_routing_rules(tenant_id, location_id, category_id)
  WHERE category_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════
-- 7. Enhance kitchen ticket items with routing metadata
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE fnb_kitchen_ticket_items
  ADD COLUMN IF NOT EXISTS routing_rule_id text,
  ADD COLUMN IF NOT EXISTS kitchen_label text,
  ADD COLUMN IF NOT EXISTS item_color text,
  ADD COLUMN IF NOT EXISTS priority_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_prep_seconds integer,
  ADD COLUMN IF NOT EXISTS bumped_by text;

COMMENT ON COLUMN fnb_kitchen_ticket_items.routing_rule_id IS 'Which routing rule assigned this item to its station';
COMMENT ON COLUMN fnb_kitchen_ticket_items.kitchen_label IS 'Custom display label for kitchen (overrides item name)';
COMMENT ON COLUMN fnb_kitchen_ticket_items.item_color IS 'Custom color for this item on KDS (hex)';
COMMENT ON COLUMN fnb_kitchen_ticket_items.priority_level IS '0=normal, 1-8=priority (higher=more urgent)';
COMMENT ON COLUMN fnb_kitchen_ticket_items.bumped_by IS 'User ID who bumped this item';

-- ══════════════════════════════════════════════════════════════════
-- 8. KDS Performance Targets (per station, per order type)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_kds_performance_targets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  location_id text REFERENCES locations(id),
  station_id text REFERENCES fnb_kitchen_stations(id),
  order_type text,
  target_prep_seconds integer NOT NULL,
  warning_prep_seconds integer NOT NULL,
  critical_prep_seconds integer NOT NULL,
  speed_of_service_goal_seconds integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_kds_perf_targets
  ON fnb_kds_performance_targets(tenant_id, COALESCE(station_id, ''), COALESCE(order_type, ''));

COMMENT ON TABLE fnb_kds_performance_targets IS 'Speed-of-service targets for KDS performance reporting';
COMMENT ON COLUMN fnb_kds_performance_targets.target_prep_seconds IS 'Target prep time for this station/order type';
COMMENT ON COLUMN fnb_kds_performance_targets.warning_prep_seconds IS 'Warning threshold — on-time→caution (green→yellow)';
COMMENT ON COLUMN fnb_kds_performance_targets.critical_prep_seconds IS 'Critical threshold — caution→overdue (yellow→red)';
COMMENT ON COLUMN fnb_kds_performance_targets.speed_of_service_goal_seconds IS 'Overall SOS goal for reporting';

-- ══════════════════════════════════════════════════════════════════
-- 9. KDS Item Prep Times (catalog item → estimated prep seconds)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_kds_item_prep_times (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  catalog_item_id text NOT NULL,
  station_id text REFERENCES fnb_kitchen_stations(id),
  estimated_prep_seconds integer NOT NULL DEFAULT 300,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_kds_item_prep_times
  ON fnb_kds_item_prep_times(tenant_id, catalog_item_id, COALESCE(station_id, ''));

COMMENT ON TABLE fnb_kds_item_prep_times IS 'Estimated prep time per item — used for course pacing and meal timing';

-- ══════════════════════════════════════════════════════════════════
-- 10. RLS Policies
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE fnb_kds_bump_bar_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kds_bump_bar_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fnb_kds_bump_bar_profiles_sel ON fnb_kds_bump_bar_profiles;
CREATE POLICY fnb_kds_bump_bar_profiles_sel ON fnb_kds_bump_bar_profiles
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_bump_bar_profiles_ins ON fnb_kds_bump_bar_profiles;
CREATE POLICY fnb_kds_bump_bar_profiles_ins ON fnb_kds_bump_bar_profiles
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_bump_bar_profiles_upd ON fnb_kds_bump_bar_profiles;
CREATE POLICY fnb_kds_bump_bar_profiles_upd ON fnb_kds_bump_bar_profiles
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_bump_bar_profiles_del ON fnb_kds_bump_bar_profiles;
CREATE POLICY fnb_kds_bump_bar_profiles_del ON fnb_kds_bump_bar_profiles
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

ALTER TABLE fnb_kds_alert_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kds_alert_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fnb_kds_alert_profiles_sel ON fnb_kds_alert_profiles;
CREATE POLICY fnb_kds_alert_profiles_sel ON fnb_kds_alert_profiles
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_alert_profiles_ins ON fnb_kds_alert_profiles;
CREATE POLICY fnb_kds_alert_profiles_ins ON fnb_kds_alert_profiles
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_alert_profiles_upd ON fnb_kds_alert_profiles;
CREATE POLICY fnb_kds_alert_profiles_upd ON fnb_kds_alert_profiles
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_alert_profiles_del ON fnb_kds_alert_profiles;
CREATE POLICY fnb_kds_alert_profiles_del ON fnb_kds_alert_profiles
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

ALTER TABLE fnb_kds_performance_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kds_performance_targets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fnb_kds_perf_targets_sel ON fnb_kds_performance_targets;
CREATE POLICY fnb_kds_perf_targets_sel ON fnb_kds_performance_targets
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_perf_targets_ins ON fnb_kds_performance_targets;
CREATE POLICY fnb_kds_perf_targets_ins ON fnb_kds_performance_targets
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_perf_targets_upd ON fnb_kds_performance_targets;
CREATE POLICY fnb_kds_perf_targets_upd ON fnb_kds_performance_targets
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_perf_targets_del ON fnb_kds_performance_targets;
CREATE POLICY fnb_kds_perf_targets_del ON fnb_kds_performance_targets
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

ALTER TABLE fnb_kds_item_prep_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_kds_item_prep_times FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fnb_kds_item_prep_times_sel ON fnb_kds_item_prep_times;
CREATE POLICY fnb_kds_item_prep_times_sel ON fnb_kds_item_prep_times
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_item_prep_times_ins ON fnb_kds_item_prep_times;
CREATE POLICY fnb_kds_item_prep_times_ins ON fnb_kds_item_prep_times
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_item_prep_times_upd ON fnb_kds_item_prep_times;
CREATE POLICY fnb_kds_item_prep_times_upd ON fnb_kds_item_prep_times
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS fnb_kds_item_prep_times_del ON fnb_kds_item_prep_times;
CREATE POLICY fnb_kds_item_prep_times_del ON fnb_kds_item_prep_times
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- ══════════════════════════════════════════════════════════════════
-- 11. Enhance tickets with priority & hold/fire support
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE fnb_kitchen_tickets
  ADD COLUMN IF NOT EXISTS priority_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_held boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS held_at timestamptz,
  ADD COLUMN IF NOT EXISTS fired_at timestamptz,
  ADD COLUMN IF NOT EXISTS fired_by text,
  ADD COLUMN IF NOT EXISTS order_type text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS estimated_pickup_at timestamptz,
  ADD COLUMN IF NOT EXISTS bumped_at timestamptz,
  ADD COLUMN IF NOT EXISTS bumped_by text;

COMMENT ON COLUMN fnb_kitchen_tickets.priority_level IS '0=normal, 1-8=priority (higher=more urgent like Oracle MICROS)';
COMMENT ON COLUMN fnb_kitchen_tickets.is_held IS 'Hold/Fire course pacing — true = held, waiting for fire command';
COMMENT ON COLUMN fnb_kitchen_tickets.order_type IS 'dine_in|takeout|delivery|bar — used for display filtering';
COMMENT ON COLUMN fnb_kitchen_tickets.channel IS 'pos|online|kiosk|third_party — used for routing';
