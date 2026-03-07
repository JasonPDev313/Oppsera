-- Business Type Manager: full schema
-- Tables: business_categories, business_types, business_type_versions,
--         business_type_module_defaults, business_type_accounting_templates,
--         business_type_role_templates, business_type_role_permissions,
--         tenant_provisioning_runs, tenant_provisioning_run_steps

-- ── Business Categories ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_categories (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  description   text,
  is_system     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Business Types ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_types (
  id              text PRIMARY KEY,
  category_id     text NOT NULL REFERENCES business_categories(id),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  description     text,
  icon_key        text,
  is_system       boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  show_at_signup  boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  created_by      text,
  updated_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Business Type Versions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_type_versions (
  id                  text PRIMARY KEY,
  business_type_id    text NOT NULL REFERENCES business_types(id),
  version_number      integer NOT NULL,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published', 'archived')),
  change_summary      text,
  published_at        timestamptz,
  published_by        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_btv_type_version
  ON business_type_versions (business_type_id, version_number);

-- Only one active draft per business type
CREATE UNIQUE INDEX IF NOT EXISTS uq_btv_active_draft
  ON business_type_versions (business_type_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_btv_type_status
  ON business_type_versions (business_type_id, status);

-- ── Business Type Module Defaults ───────────────────────────────
CREATE TABLE IF NOT EXISTS business_type_module_defaults (
  id                          text PRIMARY KEY,
  business_type_version_id    text NOT NULL REFERENCES business_type_versions(id),
  module_key                  text NOT NULL,
  is_enabled                  boolean NOT NULL DEFAULT true,
  access_mode                 text NOT NULL DEFAULT 'full'
                              CHECK (access_mode IN ('off', 'view', 'full')),
  sort_order                  integer NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_btmd_version_module
  ON business_type_module_defaults (business_type_version_id, module_key);

-- ── Business Type Accounting Templates ──────────────────────────
CREATE TABLE IF NOT EXISTS business_type_accounting_templates (
  id                          text PRIMARY KEY,
  business_type_version_id    text NOT NULL UNIQUE REFERENCES business_type_versions(id),
  coa_template_ref            text,
  revenue_categories          jsonb NOT NULL DEFAULT '{}',
  payment_gl_mappings         jsonb NOT NULL DEFAULT '{}',
  tax_behavior                jsonb NOT NULL DEFAULT '{}',
  deferred_revenue            jsonb NOT NULL DEFAULT '{}',
  cogs_behavior               text NOT NULL DEFAULT 'disabled'
                              CHECK (cogs_behavior IN ('disabled', 'perpetual', 'periodic')),
  fiscal_settings             jsonb NOT NULL DEFAULT '{}',
  validation_status           text NOT NULL DEFAULT 'incomplete'
                              CHECK (validation_status IN ('incomplete', 'valid', 'invalid')),
  validation_errors           jsonb NOT NULL DEFAULT '[]',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ── Business Type Role Templates ────────────────────────────────
CREATE TABLE IF NOT EXISTS business_type_role_templates (
  id                          text PRIMARY KEY,
  business_type_version_id    text NOT NULL REFERENCES business_type_versions(id),
  role_name                   text NOT NULL,
  role_key                    text NOT NULL,
  description                 text,
  sort_order                  integer NOT NULL DEFAULT 0,
  is_active                   boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_btrt_version_role_key
  ON business_type_role_templates (business_type_version_id, role_key);

-- ── Business Type Role Permissions ──────────────────────────────
CREATE TABLE IF NOT EXISTS business_type_role_permissions (
  id                  text PRIMARY KEY,
  role_template_id    text NOT NULL REFERENCES business_type_role_templates(id) ON DELETE CASCADE,
  permission_key      text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_btrp_role_permission
  ON business_type_role_permissions (role_template_id, permission_key);

-- ── Tenant Provisioning Runs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_provisioning_runs (
  id                          text PRIMARY KEY,
  tenant_id                   text NOT NULL,
  business_type_id            text NOT NULL REFERENCES business_types(id),
  business_type_version_id    text NOT NULL REFERENCES business_type_versions(id),
  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'success', 'partial', 'failed')),
  snapshot_json               jsonb NOT NULL DEFAULT '{}',
  started_at                  timestamptz,
  completed_at                timestamptz,
  created_by                  text,
  error_summary               text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tpr_tenant ON tenant_provisioning_runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tpr_business_type ON tenant_provisioning_runs (business_type_id);

-- ── Tenant Provisioning Run Steps ───────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_provisioning_run_steps (
  id                      text PRIMARY KEY,
  provisioning_run_id     text NOT NULL REFERENCES tenant_provisioning_runs(id),
  domain_key              text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'running', 'success', 'partial', 'failed')),
  details_json            jsonb NOT NULL DEFAULT '{}',
  error_message           text,
  started_at              timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tprs_run_domain
  ON tenant_provisioning_run_steps (provisioning_run_id, domain_key);

CREATE INDEX IF NOT EXISTS idx_tprs_run
  ON tenant_provisioning_run_steps (provisioning_run_id);

-- ── Seed: Business Categories ───────────────────────────────────
INSERT INTO business_categories (id, name, slug, description, is_system, sort_order)
VALUES
  ('01JQXBT000CATEGORY_HOTEL0', 'Hotel', 'hotel', 'Lodging and hospitality properties', true, 1),
  ('01JQXBT000CATEGORY_RESTA0', 'Restaurant', 'restaurant', 'Food and beverage establishments', true, 2),
  ('01JQXBT000CATEGORY_RETAI0', 'Retail', 'retail', 'Retail and merchandise operations', true, 3),
  ('01JQXBT000CATEGORY_GOLF0', 'Golf', 'golf', 'Golf courses and country clubs', true, 4),
  ('01JQXBT000CATEGORY_HYBRI0', 'Hybrid', 'hybrid', 'Multi-vertical operations', true, 5),
  ('01JQXBT000CATEGORY_ENTER0', 'Enterprise', 'enterprise', 'Large-scale multi-unit operations', true, 6),
  ('01JQXBT000CATEGORY_OTHER0', 'Other', 'other', 'Specialty and niche businesses', true, 7)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed: System Business Types ─────────────────────────────────
INSERT INTO business_types (id, category_id, name, slug, description, icon_key, is_system, is_active, show_at_signup, sort_order)
VALUES
  ('01JQXBT000BTYPE_HOTEL000', '01JQXBT000CATEGORY_HOTEL0', 'Hotel', 'hotel', 'Full-service hotel with PMS, reservations, and housekeeping', 'hotel', true, true, true, 1),
  ('01JQXBT000BTYPE_RESTAURA', '01JQXBT000CATEGORY_RESTA0', 'Restaurant', 'restaurant', 'Food and beverage operations with KDS and table management', 'utensils-crossed', true, true, true, 2),
  ('01JQXBT000BTYPE_RETAIL00', '01JQXBT000CATEGORY_RETAI0', 'Retail', 'retail', 'Retail POS with inventory, catalog, and customer management', 'store', true, true, true, 3),
  ('01JQXBT000BTYPE_GOLF0000', '01JQXBT000CATEGORY_GOLF0', 'Golf', 'golf', 'Golf course operations with tee times and pro shop', 'flag', true, true, true, 4),
  ('01JQXBT000BTYPE_SPA00000', '01JQXBT000CATEGORY_OTHER0', 'Spa', 'spa', 'Spa and wellness with appointments and service management', 'sparkles', true, true, true, 5),
  ('01JQXBT000BTYPE_HYBRID00', '01JQXBT000CATEGORY_HYBRI0', 'Hybrid', 'hybrid', 'Multi-vertical operation combining multiple business types', 'layers', true, true, true, 6)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed: Published v1 for each system business type ────────────
INSERT INTO business_type_versions (id, business_type_id, version_number, status, change_summary, published_at)
VALUES
  ('01JQXBT000BTVER_HOTEL000', '01JQXBT000BTYPE_HOTEL000', 1, 'published', 'Initial system version', now()),
  ('01JQXBT000BTVER_RESTAURA', '01JQXBT000BTYPE_RESTAURA', 1, 'published', 'Initial system version', now()),
  ('01JQXBT000BTVER_RETAIL00', '01JQXBT000BTYPE_RETAIL00', 1, 'published', 'Initial system version', now()),
  ('01JQXBT000BTVER_GOLF0000', '01JQXBT000BTYPE_GOLF0000', 1, 'published', 'Initial system version', now()),
  ('01JQXBT000BTVER_SPA00000', '01JQXBT000BTYPE_SPA00000', 1, 'published', 'Initial system version', now()),
  ('01JQXBT000BTVER_HYBRID00', '01JQXBT000BTYPE_HYBRID00', 1, 'published', 'Initial system version', now())
ON CONFLICT (business_type_id, version_number) DO NOTHING;

-- ── Seed: Empty accounting templates for each version ───────────
INSERT INTO business_type_accounting_templates (id, business_type_version_id)
VALUES
  ('01JQXBT000BTACCT_HOTEL00', '01JQXBT000BTVER_HOTEL000'),
  ('01JQXBT000BTACCT_RESTAU0', '01JQXBT000BTVER_RESTAURA'),
  ('01JQXBT000BTACCT_RETAIL0', '01JQXBT000BTVER_RETAIL00'),
  ('01JQXBT000BTACCT_GOLF000', '01JQXBT000BTVER_GOLF0000'),
  ('01JQXBT000BTACCT_SPA0000', '01JQXBT000BTVER_SPA00000'),
  ('01JQXBT000BTACCT_HYBRID0', '01JQXBT000BTVER_HYBRID00')
ON CONFLICT (business_type_version_id) DO NOTHING;

-- Future tables (V2+)
-- business_type_customer_role_templates
-- business_type_inventory_templates
-- business_type_modifier_templates
-- business_type_settings_templates
-- business_type_payment_presets
-- business_type_tax_presets
