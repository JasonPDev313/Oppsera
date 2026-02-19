-- ── Golf Field Catalog ──────────────────────────────────────────
-- Pre-populate reporting_field_catalog with 7 golf datasets.
-- All inserts are idempotent via ON CONFLICT DO NOTHING.

-- ── golf_tee_time_fact dataset ─────────────────────────────────
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'golf_tee_time_fact', 'business_date',     'Business Date',       'date',   NULL,   false, true, true, 'business_date',      'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'booking_source',    'Booking Channel',     'string', NULL,   false, true, true, 'booking_source',     'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'booking_type',      'Booking Type',        'string', NULL,   false, true, true, 'booking_type',       'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'status',            'Status',              'string', NULL,   false, true, true, 'status',             'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'holes',             'Holes',               'number', NULL,   false, true, true, 'holes',              'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'location_id',       'Location',            'string', NULL,   false, true, true, 'location_id',        'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'party_size_booked', 'Party Size (Booked)', 'number', 'sum',  true,  false, true, 'party_size_booked', 'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'party_size_actual', 'Party Size (Actual)', 'number', 'sum',  true,  false, true, 'party_size_actual', 'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'walking_count',     'Walking Count',       'number', 'sum',  true,  false, true, 'walking_count',     'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'riding_count',      'Riding Count',        'number', 'sum',  true,  false, true, 'riding_count',      'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'total_revenue',     'Total Revenue',       'number', 'sum',  true,  false, true, 'total_revenue',     'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'actual_green_fee',  'Actual Green Fee',    'number', 'sum',  true,  false, true, 'actual_green_fee',  'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'actual_cart_fee',   'Actual Cart Fee',     'number', 'sum',  true,  false, true, 'actual_cart_fee',   'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'food_bev',          'Food & Beverage',     'number', 'sum',  true,  false, true, 'food_bev',          'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'pro_shop',          'Pro Shop',            'number', 'sum',  true,  false, true, 'pro_shop',          'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'duration_minutes',  'Round Duration (min)','number', 'avg',  true,  false, true, 'duration_minutes',  'rm_golf_tee_time_fact'),
  (gen_ulid(), 'golf_tee_time_fact', 'start_delay_min',   'Start Delay (min)',   'number', 'avg',  true,  false, true, 'start_delay_min',   'rm_golf_tee_time_fact')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- ── golf_utilization dataset ───────────────────────────────────
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'golf_utilization', 'business_date',      'Business Date',      'date',   NULL,   false, true, true, 'business_date',   'rm_golf_tee_time_demand'),
  (gen_ulid(), 'golf_utilization', 'course_id',          'Course',             'string', NULL,   false, true, true, 'course_id',       'rm_golf_tee_time_demand'),
  (gen_ulid(), 'golf_utilization', 'slots_booked',       'Booked Slots',       'number', 'sum',  true,  false, true, 'slots_booked',   'rm_golf_tee_time_demand'),
  (gen_ulid(), 'golf_utilization', 'slots_available',    'Available Slots',    'number', 'sum',  true,  false, true, 'slots_available', 'rm_golf_tee_time_demand'),
  (gen_ulid(), 'golf_utilization', 'cancellations',      'Cancellations',      'number', 'sum',  true,  false, true, 'cancellations',   'rm_golf_tee_time_demand'),
  (gen_ulid(), 'golf_utilization', 'no_shows',           'No-Shows',           'number', 'sum',  true,  false, true, 'no_shows',        'rm_golf_tee_time_demand'),
  (gen_ulid(), 'golf_utilization', 'utilization_pct_bp', 'Utilization %',      'number', 'avg',  true,  false, true, 'CASE WHEN slots_available > 0 THEN slots_booked * 10000 / slots_available ELSE 0 END', 'rm_golf_tee_time_demand'),
  (gen_ulid(), 'golf_utilization', 'cancel_rate_bp',     'Cancellation Rate',  'number', 'avg',  true,  false, true, 'CASE WHEN slots_booked > 0 THEN cancellations * 10000 / slots_booked ELSE 0 END',     'rm_golf_tee_time_demand')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- ── golf_revenue dataset ───────────────────────────────────────
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'golf_revenue', 'business_date',     'Business Date',     'date',   NULL,   false, true, true, 'business_date',     'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'course_id',         'Course',            'string', NULL,   false, true, true, 'course_id',         'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'green_fee_revenue', 'Green Fee Revenue', 'number', 'sum',  true,  false, true, 'green_fee_revenue', 'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'cart_fee_revenue',  'Cart Fee Revenue',  'number', 'sum',  true,  false, true, 'cart_fee_revenue',  'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'range_fee_revenue', 'Range Fee Revenue', 'number', 'sum',  true,  false, true, 'range_fee_revenue', 'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'food_bev_revenue',  'F&B Revenue',       'number', 'sum',  true,  false, true, 'food_bev_revenue',  'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'pro_shop_revenue',  'Pro Shop Revenue',  'number', 'sum',  true,  false, true, 'pro_shop_revenue',  'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'tax_total',         'Tax Total',         'number', 'sum',  true,  false, true, 'tax_total',         'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'total_revenue',     'Total Revenue',     'number', 'sum',  true,  false, true, 'total_revenue',     'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'rounds_played',     'Rounds Played',     'number', 'sum',  true,  false, true, 'rounds_played',     'rm_golf_revenue_daily'),
  (gen_ulid(), 'golf_revenue', 'rev_per_round',     'Revenue per Round', 'number', 'avg',  true,  false, true, 'CASE WHEN rounds_played > 0 THEN total_revenue / rounds_played ELSE 0 END', 'rm_golf_revenue_daily')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- ── golf_pace dataset ──────────────────────────────────────────
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'golf_pace', 'business_date',       'Business Date',           'date',   NULL,   false, true, true, 'business_date',       'rm_golf_pace_daily'),
  (gen_ulid(), 'golf_pace', 'course_id',           'Course',                  'string', NULL,   false, true, true, 'course_id',           'rm_golf_pace_daily'),
  (gen_ulid(), 'golf_pace', 'rounds_completed',    'Rounds Completed',        'number', 'sum',  true,  false, true, 'rounds_completed',   'rm_golf_pace_daily'),
  (gen_ulid(), 'golf_pace', 'total_duration_min',  'Total Duration (min)',    'number', 'sum',  true,  false, true, 'total_duration_min', 'rm_golf_pace_daily'),
  (gen_ulid(), 'golf_pace', 'slow_rounds_count',   'Slow Rounds',             'number', 'sum',  true,  false, true, 'slow_rounds_count',  'rm_golf_pace_daily'),
  (gen_ulid(), 'golf_pace', 'slow_round_pct_bp',   'Slow Round %',            'number', 'avg',  true,  false, true, 'CASE WHEN rounds_completed > 0 THEN slow_rounds_count * 10000 / rounds_completed ELSE 0 END', 'rm_golf_pace_daily')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- ── golf_customer_play dataset ─────────────────────────────────
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'golf_customer_play', 'customer_id',    'Customer ID',      'string', NULL,   false, true, true, 'customer_id',    'rm_golf_customer_play'),
  (gen_ulid(), 'golf_customer_play', 'customer_name',  'Customer Name',    'string', NULL,   false, true, true, 'customer_name',  'rm_golf_customer_play'),
  (gen_ulid(), 'golf_customer_play', 'last_played_at', 'Last Played',      'date',   NULL,   false, true, true, 'last_played_at', 'rm_golf_customer_play'),
  (gen_ulid(), 'golf_customer_play', 'total_rounds',   'Total Rounds',     'number', 'sum',  true,  false, true, 'total_rounds',   'rm_golf_customer_play'),
  (gen_ulid(), 'golf_customer_play', 'total_revenue',  'Total Revenue',    'number', 'sum',  true,  false, true, 'total_revenue',  'rm_golf_customer_play'),
  (gen_ulid(), 'golf_customer_play', 'avg_party_size', 'Avg Party Size',   'number', 'avg',  true,  false, true, 'avg_party_size', 'rm_golf_customer_play')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- ── golf_ops dataset ───────────────────────────────────────────
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'golf_ops', 'business_date',          'Business Date',         'date',   NULL,   false, true, true, 'business_date',          'rm_golf_ops_daily'),
  (gen_ulid(), 'golf_ops', 'course_id',              'Course',                'string', NULL,   false, true, true, 'course_id',              'rm_golf_ops_daily'),
  (gen_ulid(), 'golf_ops', 'starts_count',           'Total Starts',          'number', 'sum',  true,  false, true, 'starts_count',          'rm_golf_ops_daily'),
  (gen_ulid(), 'golf_ops', 'late_starts_count',      'Late Starts',           'number', 'sum',  true,  false, true, 'late_starts_count',     'rm_golf_ops_daily'),
  (gen_ulid(), 'golf_ops', 'total_start_delay_min',  'Total Start Delay (min)', 'number', 'sum', true, false, true, 'total_start_delay_min', 'rm_golf_ops_daily'),
  (gen_ulid(), 'golf_ops', 'late_start_pct_bp',      'Late Start %',          'number', 'avg',  true,  false, true, 'CASE WHEN starts_count > 0 THEN late_starts_count * 10000 / starts_count ELSE 0 END', 'rm_golf_ops_daily'),
  (gen_ulid(), 'golf_ops', 'interval_compliance_bp', 'Interval Compliance %', 'number', 'avg',  true,  false, true, 'CASE WHEN starts_count > 0 THEN (starts_count - late_starts_count) * 10000 / starts_count ELSE 0 END', 'rm_golf_ops_daily')
ON CONFLICT (dataset, field_key) DO NOTHING;

-- ── golf_channel dataset ───────────────────────────────────────
INSERT INTO reporting_field_catalog (id, dataset, field_key, label, data_type, aggregation, is_metric, is_filturable, is_sortable, column_expression, table_ref)
VALUES
  (gen_ulid(), 'golf_channel', 'business_date',        'Business Date',       'date',   NULL,   false, true, true, 'business_date',        'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'course_id',            'Course',              'string', NULL,   false, true, true, 'course_id',            'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'online_slots_booked',  'Online Bookings',     'number', 'sum',  true,  false, true, 'online_slots_booked',  'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'proshop_slots_booked', 'Pro Shop Bookings',   'number', 'sum',  true,  false, true, 'proshop_slots_booked', 'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'phone_slots_booked',   'Phone Bookings',      'number', 'sum',  true,  false, true, 'phone_slots_booked',   'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'member_rounds',        'Member Rounds',       'number', 'sum',  true,  false, true, 'member_rounds',        'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'public_rounds',        'Public Rounds',       'number', 'sum',  true,  false, true, 'public_rounds',        'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'last_minute_count',    'Last-Minute Bookings','number', 'sum',  true,  false, true, 'last_minute_count',    'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'advanced_count',       'Advanced Bookings',   'number', 'sum',  true,  false, true, 'advanced_count',       'rm_golf_channel_daily'),
  (gen_ulid(), 'golf_channel', 'online_pct_bp',        'Online Booking %',    'number', 'avg',  true,  false, true, 'CASE WHEN (online_slots_booked + proshop_slots_booked + phone_slots_booked) > 0 THEN online_slots_booked * 10000 / (online_slots_booked + proshop_slots_booked + phone_slots_booked) ELSE 0 END', 'rm_golf_channel_daily')
ON CONFLICT (dataset, field_key) DO NOTHING;
