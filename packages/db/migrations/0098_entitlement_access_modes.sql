-- Migration: Entitlement Access Modes
-- Evolves the binary on/off entitlement model to three-mode access control (OFF / VIEW / FULL)
-- Adds change audit log and module templates tables

-- 1. Add access_mode column with default 'full' for backward compat
ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'full';

-- 2. Migrate existing data: isEnabled=true -> 'full', isEnabled=false -> 'off'
UPDATE entitlements SET access_mode = CASE WHEN is_enabled THEN 'full' ELSE 'off' END;

-- 3. Add change tracking columns
ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS changed_by TEXT,
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS previous_mode TEXT;

-- 4. Add CHECK constraint for access_mode
ALTER TABLE entitlements
  ADD CONSTRAINT chk_entitlements_access_mode
  CHECK (access_mode IN ('off', 'view', 'full'));

-- 5. Create entitlement_change_log table (append-only audit trail)
CREATE TABLE IF NOT EXISTS entitlement_change_log (
  id TEXT NOT NULL DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module_key TEXT NOT NULL,
  previous_mode TEXT NOT NULL,
  new_mode TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_reason TEXT,
  change_source TEXT NOT NULL DEFAULT 'manual',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_entitlement_change_log_tenant
  ON entitlement_change_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entitlement_change_log_module
  ON entitlement_change_log (tenant_id, module_key, created_at DESC);

-- 6. Create module_templates table
CREATE TABLE IF NOT EXISTS module_templates (
  id TEXT NOT NULL DEFAULT gen_ulid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  business_type TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  modules JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_module_templates_system_name
  ON module_templates (LOWER(TRIM(name))) WHERE is_system = true;

-- 7. RLS policies for entitlement_change_log (append-only)
ALTER TABLE entitlement_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_change_log FORCE ROW LEVEL SECURITY;

CREATE POLICY entitlement_change_log_select ON entitlement_change_log
  FOR SELECT TO authenticated
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY entitlement_change_log_insert ON entitlement_change_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- 8. RLS policies for module_templates
ALTER TABLE module_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY module_templates_select ON module_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY module_templates_insert ON module_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_system = false);

CREATE POLICY module_templates_update ON module_templates
  FOR UPDATE TO authenticated
  USING (is_system = false);

CREATE POLICY module_templates_delete ON module_templates
  FOR DELETE TO authenticated
  USING (is_system = false);

-- 9. Seed system templates
INSERT INTO module_templates (id, name, description, business_type, is_system, modules) VALUES
(gen_ulid(), 'Restaurant / Bar', 'Full restaurant setup with F&B POS, floor plans, and inventory', 'restaurant', true,
 '[{"moduleKey":"platform_core","accessMode":"full"},{"moduleKey":"catalog","accessMode":"full"},{"moduleKey":"pos_retail","accessMode":"full"},{"moduleKey":"pos_fnb","accessMode":"full"},{"moduleKey":"payments","accessMode":"full"},{"moduleKey":"inventory","accessMode":"full"},{"moduleKey":"customers","accessMode":"full"},{"moduleKey":"reporting","accessMode":"full"},{"moduleKey":"room_layouts","accessMode":"full"}]'),
(gen_ulid(), 'Retail Store', 'Standard retail setup with POS and inventory', 'retail', true,
 '[{"moduleKey":"platform_core","accessMode":"full"},{"moduleKey":"catalog","accessMode":"full"},{"moduleKey":"pos_retail","accessMode":"full"},{"moduleKey":"payments","accessMode":"full"},{"moduleKey":"inventory","accessMode":"full"},{"moduleKey":"customers","accessMode":"full"},{"moduleKey":"reporting","accessMode":"full"}]'),
(gen_ulid(), 'Golf Course', 'Full golf operation with F&B, pro shop, and golf ops', 'golf', true,
 '[{"moduleKey":"platform_core","accessMode":"full"},{"moduleKey":"catalog","accessMode":"full"},{"moduleKey":"pos_retail","accessMode":"full"},{"moduleKey":"pos_fnb","accessMode":"full"},{"moduleKey":"payments","accessMode":"full"},{"moduleKey":"inventory","accessMode":"full"},{"moduleKey":"customers","accessMode":"full"},{"moduleKey":"reporting","accessMode":"full"},{"moduleKey":"room_layouts","accessMode":"full"},{"moduleKey":"golf_ops","accessMode":"full"}]'),
(gen_ulid(), 'Hybrid Venue', 'Multi-purpose venue with all modules enabled', 'hybrid', true,
 '[{"moduleKey":"platform_core","accessMode":"full"},{"moduleKey":"catalog","accessMode":"full"},{"moduleKey":"pos_retail","accessMode":"full"},{"moduleKey":"pos_fnb","accessMode":"full"},{"moduleKey":"payments","accessMode":"full"},{"moduleKey":"inventory","accessMode":"full"},{"moduleKey":"customers","accessMode":"full"},{"moduleKey":"reporting","accessMode":"full"},{"moduleKey":"room_layouts","accessMode":"full"},{"moduleKey":"accounting","accessMode":"full"},{"moduleKey":"ap","accessMode":"full"},{"moduleKey":"ar","accessMode":"full"},{"moduleKey":"golf_ops","accessMode":"full"},{"moduleKey":"semantic","accessMode":"full"}]');
