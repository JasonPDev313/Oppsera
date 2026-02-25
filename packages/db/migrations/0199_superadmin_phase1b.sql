-- ============================================================
-- Migration 0199: SuperAdmin Phase 1B (Sessions 4-6)
-- Feature flags, DLQ retry log, cross-tenant user management
-- ============================================================

-- ── Session 4: Feature Flag Definitions (system-wide) ───────

CREATE TABLE IF NOT EXISTS public.feature_flag_definitions (
  id text NOT NULL DEFAULT gen_ulid(),
  flag_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  module_key text,
  risk_level text NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flag_definitions_pkey PRIMARY KEY (id)
);

-- ── Session 4: Tenant Feature Flags (per-tenant) ────────────

CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  id text NOT NULL DEFAULT gen_ulid(),
  tenant_id text NOT NULL,
  flag_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  description text,
  enabled_at timestamptz,
  enabled_by text,
  disabled_at timestamptz,
  disabled_by text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_feature_flags_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_feature_flags_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT tenant_feature_flags_unique UNIQUE (tenant_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_tenant ON tenant_feature_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_key ON tenant_feature_flags(flag_key, is_enabled);

-- ── Seed: Feature flag definitions ──────────────────────────

INSERT INTO feature_flag_definitions (id, flag_key, display_name, description, module_key, risk_level) VALUES
  (gen_ulid(), 'beta_semantic_search',     'Semantic AI Search',        'Enable AI-powered semantic search in reporting',      'reporting',    'medium'),
  (gen_ulid(), 'beta_guest_pay',           'Guest QR Pay',              'Enable QR code payment for restaurant guests',        'fnb',          'medium'),
  (gen_ulid(), 'beta_kitchen_display',     'Kitchen Display System',    'Enable KDS screens for kitchen stations',             'fnb',          'low'),
  (gen_ulid(), 'beta_inventory_recipes',   'Recipe Management',         'Enable recipe costing and components',                'inventory',    'low'),
  (gen_ulid(), 'beta_multi_currency',      'Multi-Currency Support',    'Enable multi-currency transactions',                  'accounting',   'high'),
  (gen_ulid(), 'beta_autopay',             'Membership AutoPay',        'Enable automatic payment processing for memberships', 'membership',   'high'),
  (gen_ulid(), 'beta_pace_of_play',        'Pace of Play Tracking',    'Enable GPS-based pace of play monitoring',            'golf',         'low'),
  (gen_ulid(), 'beta_online_ordering',     'Online Ordering',          'Enable customer-facing online ordering',               'fnb',          'medium'),
  (gen_ulid(), 'beta_pms_night_audit',     'PMS Night Audit',          'Enable automated night audit processing',             'pms',          'high'),
  (gen_ulid(), 'enable_legacy_gl_posting', 'Legacy GL Posting',        'Keep legacy GL posting behavior active',              'accounting',   'low')
ON CONFLICT (flag_key) DO NOTHING;

-- ── Seed: Module templates by industry ──────────────────────

INSERT INTO module_templates (id, name, description, business_type, is_system, modules) VALUES
(gen_ulid(), 'Golf Club Standard', 'Standard module set for golf clubs', 'golf', true,
 '[
   {"module_key": "pos", "access_mode": "full"},
   {"module_key": "catalog", "access_mode": "full"},
   {"module_key": "crm", "access_mode": "full"},
   {"module_key": "tee_sheet", "access_mode": "full"},
   {"module_key": "events", "access_mode": "full"},
   {"module_key": "membership", "access_mode": "full"},
   {"module_key": "accounting", "access_mode": "full"},
   {"module_key": "reporting", "access_mode": "full"},
   {"module_key": "inventory", "access_mode": "view"},
   {"module_key": "fnb", "access_mode": "off"}
 ]'::jsonb),

(gen_ulid(), 'Restaurant Standard', 'Standard module set for restaurants', 'restaurant', true,
 '[
   {"module_key": "pos", "access_mode": "full"},
   {"module_key": "catalog", "access_mode": "full"},
   {"module_key": "crm", "access_mode": "full"},
   {"module_key": "fnb", "access_mode": "full"},
   {"module_key": "inventory", "access_mode": "full"},
   {"module_key": "accounting", "access_mode": "full"},
   {"module_key": "reporting", "access_mode": "full"},
   {"module_key": "tee_sheet", "access_mode": "off"},
   {"module_key": "membership", "access_mode": "off"},
   {"module_key": "pms", "access_mode": "off"}
 ]'::jsonb),

(gen_ulid(), 'Hotel Standard', 'Standard module set for hotels', 'hotel', true,
 '[
   {"module_key": "pos", "access_mode": "full"},
   {"module_key": "catalog", "access_mode": "full"},
   {"module_key": "crm", "access_mode": "full"},
   {"module_key": "pms", "access_mode": "full"},
   {"module_key": "fnb", "access_mode": "full"},
   {"module_key": "accounting", "access_mode": "full"},
   {"module_key": "reporting", "access_mode": "full"},
   {"module_key": "events", "access_mode": "view"},
   {"module_key": "tee_sheet", "access_mode": "off"},
   {"module_key": "membership", "access_mode": "off"}
 ]'::jsonb),

(gen_ulid(), 'Retail Standard', 'Standard module set for retail', 'retail', true,
 '[
   {"module_key": "pos", "access_mode": "full"},
   {"module_key": "catalog", "access_mode": "full"},
   {"module_key": "crm", "access_mode": "full"},
   {"module_key": "inventory", "access_mode": "full"},
   {"module_key": "accounting", "access_mode": "full"},
   {"module_key": "reporting", "access_mode": "full"},
   {"module_key": "tee_sheet", "access_mode": "off"},
   {"module_key": "fnb", "access_mode": "off"},
   {"module_key": "membership", "access_mode": "off"},
   {"module_key": "pms", "access_mode": "off"}
 ]'::jsonb)
ON CONFLICT DO NOTHING;

-- ── Session 5: DLQ indexes for admin portal queries ─────────

CREATE INDEX IF NOT EXISTS idx_event_dead_letters_tenant_status
  ON event_dead_letters(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_dead_letters_consumer
  ON event_dead_letters(consumer_name, status);
CREATE INDEX IF NOT EXISTS idx_event_dead_letters_event_type
  ON event_dead_letters(event_type, status);
CREATE INDEX IF NOT EXISTS idx_event_dead_letters_status_created
  ON event_dead_letters(status, created_at DESC);

-- ── Session 5: Dead Letter Retry Log ────────────────────────

CREATE TABLE IF NOT EXISTS public.dead_letter_retry_log (
  id text NOT NULL DEFAULT gen_ulid(),
  dead_letter_id text NOT NULL,
  retry_number integer NOT NULL,
  retried_by text NOT NULL,
  retry_result text NOT NULL CHECK (retry_result IN ('success', 'failed')),
  error_message text,
  retried_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dead_letter_retry_log_pkey PRIMARY KEY (id),
  CONSTRAINT dead_letter_retry_log_dead_letter_id_fkey
    FOREIGN KEY (dead_letter_id) REFERENCES public.event_dead_letters(id)
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_retry_log_dl ON dead_letter_retry_log(dead_letter_id);
