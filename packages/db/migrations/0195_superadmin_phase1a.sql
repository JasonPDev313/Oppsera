-- Migration 0195: SuperAdmin Phase 1A — Tenant enrichment, onboarding, support notes
-- Sessions 1-3 of the SuperAdmin Portal build

-- ── 1. Extend tenants table ──────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_phone text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS health_grade text NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS total_locations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_users integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_onboarding_status_check') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_onboarding_status_check
      CHECK (onboarding_status IN ('pending', 'in_progress', 'completed', 'stalled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_health_grade_check') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_health_grade_check
      CHECK (health_grade IN ('A', 'B', 'C', 'D', 'F'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenants_onboarding_status ON tenants(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_tenants_industry ON tenants(industry);
CREATE INDEX IF NOT EXISTS idx_tenants_health_grade ON tenants(health_grade);
CREATE INDEX IF NOT EXISTS idx_tenants_last_activity ON tenants(last_activity_at DESC NULLS LAST);

-- ── 2. Tenant Onboarding Checklists ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_onboarding_checklists (
  id text NOT NULL DEFAULT gen_ulid(),
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_label text NOT NULL,
  step_group text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),
  sort_order integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  completed_by text,
  blocker_notes text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_checklists_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_onboarding_checklists_unique UNIQUE (tenant_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_tenant ON tenant_onboarding_checklists(tenant_id);

-- ── 3. SuperAdmin Support Notes ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.superadmin_support_notes (
  id text NOT NULL DEFAULT gen_ulid(),
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_admin_id text NOT NULL REFERENCES public.platform_admins(id),
  content text NOT NULL,
  note_type text NOT NULL DEFAULT 'general'
    CHECK (note_type IN ('general', 'support_ticket', 'escalation', 'implementation', 'financial')),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT superadmin_support_notes_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_support_notes_tenant ON superadmin_support_notes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_notes_author ON superadmin_support_notes(author_admin_id);

-- ── 4. Onboarding Step Templates ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_step_templates (
  id text NOT NULL DEFAULT gen_ulid(),
  industry text NOT NULL,
  step_key text NOT NULL,
  step_label text NOT NULL,
  step_group text NOT NULL DEFAULT 'general',
  sort_order integer NOT NULL DEFAULT 0,
  auto_check_query text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_step_templates_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_templates_industry_step ON onboarding_step_templates(industry, step_key);

-- ── 5. Seed Onboarding Templates ────────────────────────────────
INSERT INTO onboarding_step_templates (id, industry, step_key, step_label, step_group, sort_order) VALUES
  (gen_ulid(), 'golf', 'create_location', 'Create primary location', 'setup', 10),
  (gen_ulid(), 'golf', 'configure_courses', 'Configure golf courses', 'setup', 20),
  (gen_ulid(), 'golf', 'setup_tee_sheet', 'Set up tee sheet schedule', 'setup', 30),
  (gen_ulid(), 'golf', 'import_members', 'Import member database', 'data', 40),
  (gen_ulid(), 'golf', 'configure_catalog', 'Set up catalog items', 'setup', 50),
  (gen_ulid(), 'golf', 'configure_taxes', 'Configure tax rates and groups', 'finance', 60),
  (gen_ulid(), 'golf', 'setup_chart_of_accounts', 'Set up chart of accounts', 'finance', 70),
  (gen_ulid(), 'golf', 'configure_terminals', 'Configure POS terminals', 'hardware', 80),
  (gen_ulid(), 'golf', 'staff_training', 'Complete staff training', 'launch', 90),
  (gen_ulid(), 'golf', 'go_live_checklist', 'Go-live verification', 'launch', 100)
ON CONFLICT (industry, step_key) DO NOTHING;

INSERT INTO onboarding_step_templates (id, industry, step_key, step_label, step_group, sort_order) VALUES
  (gen_ulid(), 'restaurant', 'create_location', 'Create primary location', 'setup', 10),
  (gen_ulid(), 'restaurant', 'configure_catalog', 'Set up menu items', 'setup', 20),
  (gen_ulid(), 'restaurant', 'setup_floor_plan', 'Configure floor plan and tables', 'setup', 30),
  (gen_ulid(), 'restaurant', 'configure_kitchen_stations', 'Set up kitchen stations', 'setup', 40),
  (gen_ulid(), 'restaurant', 'configure_taxes', 'Configure tax rates', 'finance', 50),
  (gen_ulid(), 'restaurant', 'setup_chart_of_accounts', 'Set up chart of accounts', 'finance', 60),
  (gen_ulid(), 'restaurant', 'configure_terminals', 'Configure POS terminals', 'hardware', 70),
  (gen_ulid(), 'restaurant', 'staff_training', 'Complete staff training', 'launch', 80),
  (gen_ulid(), 'restaurant', 'go_live_checklist', 'Go-live verification', 'launch', 90)
ON CONFLICT (industry, step_key) DO NOTHING;

INSERT INTO onboarding_step_templates (id, industry, step_key, step_label, step_group, sort_order) VALUES
  (gen_ulid(), 'hotel', 'create_location', 'Create primary location', 'setup', 10),
  (gen_ulid(), 'hotel', 'configure_room_types', 'Configure room types and rates', 'setup', 20),
  (gen_ulid(), 'hotel', 'setup_rate_plans', 'Set up rate plans', 'setup', 30),
  (gen_ulid(), 'hotel', 'configure_catalog', 'Set up catalog items', 'setup', 40),
  (gen_ulid(), 'hotel', 'configure_taxes', 'Configure tax rates', 'finance', 50),
  (gen_ulid(), 'hotel', 'setup_chart_of_accounts', 'Set up chart of accounts', 'finance', 60),
  (gen_ulid(), 'hotel', 'configure_channels', 'Set up booking channels', 'setup', 70),
  (gen_ulid(), 'hotel', 'configure_terminals', 'Configure POS terminals', 'hardware', 80),
  (gen_ulid(), 'hotel', 'staff_training', 'Complete staff training', 'launch', 90),
  (gen_ulid(), 'hotel', 'go_live_checklist', 'Go-live verification', 'launch', 100)
ON CONFLICT (industry, step_key) DO NOTHING;

INSERT INTO onboarding_step_templates (id, industry, step_key, step_label, step_group, sort_order) VALUES
  (gen_ulid(), 'retail', 'create_location', 'Create primary location', 'setup', 10),
  (gen_ulid(), 'retail', 'configure_catalog', 'Set up catalog items', 'setup', 20),
  (gen_ulid(), 'retail', 'import_inventory', 'Import inventory data', 'data', 30),
  (gen_ulid(), 'retail', 'configure_taxes', 'Configure tax rates', 'finance', 40),
  (gen_ulid(), 'retail', 'setup_chart_of_accounts', 'Set up chart of accounts', 'finance', 50),
  (gen_ulid(), 'retail', 'configure_terminals', 'Configure POS terminals', 'hardware', 60),
  (gen_ulid(), 'retail', 'staff_training', 'Complete staff training', 'launch', 70),
  (gen_ulid(), 'retail', 'go_live_checklist', 'Go-live verification', 'launch', 80)
ON CONFLICT (industry, step_key) DO NOTHING;

INSERT INTO onboarding_step_templates (id, industry, step_key, step_label, step_group, sort_order) VALUES
  (gen_ulid(), 'marina', 'create_location', 'Create primary location', 'setup', 10),
  (gen_ulid(), 'marina', 'configure_slips', 'Configure slip inventory', 'setup', 20),
  (gen_ulid(), 'marina', 'configure_catalog', 'Set up catalog items', 'setup', 30),
  (gen_ulid(), 'marina', 'import_members', 'Import member database', 'data', 40),
  (gen_ulid(), 'marina', 'configure_taxes', 'Configure tax rates', 'finance', 50),
  (gen_ulid(), 'marina', 'setup_chart_of_accounts', 'Set up chart of accounts', 'finance', 60),
  (gen_ulid(), 'marina', 'configure_terminals', 'Configure POS terminals', 'hardware', 70),
  (gen_ulid(), 'marina', 'staff_training', 'Complete staff training', 'launch', 80),
  (gen_ulid(), 'marina', 'go_live_checklist', 'Go-live verification', 'launch', 90)
ON CONFLICT (industry, step_key) DO NOTHING;

-- ── 6. Seed Phase 1A canonical admin roles ──────────────────────
INSERT INTO platform_admin_roles (id, name, description, is_system) VALUES
  (gen_ulid(), 'Platform Engineer',          'System health, DLQ, config, debugging. No financial mutations.', true),
  (gen_ulid(), 'Implementation Specialist',  'Tenant setup, onboarding, user management, impersonation.', true),
  (gen_ulid(), 'Support Agent',              'View tenants, manage users, impersonate, view errors.', true),
  (gen_ulid(), 'Finance Support',            'Financial investigation, audit logs, reporting. No impersonation.', true),
  (gen_ulid(), 'Viewer',                     'Read-only access to all sections.', true)
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE v_role_id text;
BEGIN
  -- Platform Engineer
  SELECT id INTO v_role_id FROM platform_admin_roles WHERE name = 'Platform Engineer';
  IF v_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM platform_admin_role_permissions WHERE role_id = v_role_id LIMIT 1) THEN
    INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
      (gen_ulid(), v_role_id, 'tenants',       NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'users',         NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'impersonation', NULL, 'execute', 'global'),
      (gen_ulid(), v_role_id, 'modules',       NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'modules',       NULL, 'write',   'global'),
      (gen_ulid(), v_role_id, 'dlq',           NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'dlq',           NULL, 'retry',   'global'),
      (gen_ulid(), v_role_id, 'dlq',           NULL, 'discard', 'global'),
      (gen_ulid(), v_role_id, 'health',        NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'finance',       NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'audit',         NULL, 'read',    'global');
  END IF;

  -- Implementation Specialist
  SELECT id INTO v_role_id FROM platform_admin_roles WHERE name = 'Implementation Specialist';
  IF v_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM platform_admin_role_permissions WHERE role_id = v_role_id LIMIT 1) THEN
    INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
      (gen_ulid(), v_role_id, 'tenants',       NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'tenants',       NULL, 'write',   'global'),
      (gen_ulid(), v_role_id, 'tenants',       NULL, 'create',  'global'),
      (gen_ulid(), v_role_id, 'users',         NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'users',         NULL, 'write',   'global'),
      (gen_ulid(), v_role_id, 'impersonation', NULL, 'execute', 'global'),
      (gen_ulid(), v_role_id, 'modules',       NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'modules',       NULL, 'write',   'global'),
      (gen_ulid(), v_role_id, 'dlq',           NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'health',        NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'finance',       NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'audit',         NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'onboarding',    NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'onboarding',    NULL, 'write',   'global'),
      (gen_ulid(), v_role_id, 'notes',         NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'notes',         NULL, 'write',   'global');
  END IF;

  -- Support Agent
  SELECT id INTO v_role_id FROM platform_admin_roles WHERE name = 'Support Agent';
  IF v_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM platform_admin_role_permissions WHERE role_id = v_role_id LIMIT 1) THEN
    INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
      (gen_ulid(), v_role_id, 'tenants',       NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'users',         NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'users',         NULL, 'write',   'global'),
      (gen_ulid(), v_role_id, 'impersonation', NULL, 'execute', 'global'),
      (gen_ulid(), v_role_id, 'dlq',           NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'health',        NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'finance',       NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'audit',         NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'notes',         NULL, 'read',    'global'),
      (gen_ulid(), v_role_id, 'notes',         NULL, 'write',   'global');
  END IF;

  -- Finance Support
  SELECT id INTO v_role_id FROM platform_admin_roles WHERE name = 'Finance Support';
  IF v_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM platform_admin_role_permissions WHERE role_id = v_role_id LIMIT 1) THEN
    INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
      (gen_ulid(), v_role_id, 'tenants', NULL, 'read',   'global'),
      (gen_ulid(), v_role_id, 'users',   NULL, 'read',   'global'),
      (gen_ulid(), v_role_id, 'finance', NULL, 'read',   'global'),
      (gen_ulid(), v_role_id, 'finance', NULL, 'write',  'global'),
      (gen_ulid(), v_role_id, 'audit',   NULL, 'read',   'global'),
      (gen_ulid(), v_role_id, 'audit',   NULL, 'export', 'global'),
      (gen_ulid(), v_role_id, 'dlq',     NULL, 'read',   'global');
  END IF;

  -- Viewer
  SELECT id INTO v_role_id FROM platform_admin_roles WHERE name = 'Viewer';
  IF v_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM platform_admin_role_permissions WHERE role_id = v_role_id LIMIT 1) THEN
    INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
      (gen_ulid(), v_role_id, 'tenants', NULL, 'read', 'global'),
      (gen_ulid(), v_role_id, 'users',   NULL, 'read', 'global'),
      (gen_ulid(), v_role_id, 'modules', NULL, 'read', 'global'),
      (gen_ulid(), v_role_id, 'dlq',     NULL, 'read', 'global'),
      (gen_ulid(), v_role_id, 'health',  NULL, 'read', 'global'),
      (gen_ulid(), v_role_id, 'finance', NULL, 'read', 'global'),
      (gen_ulid(), v_role_id, 'audit',   NULL, 'read', 'global');
  END IF;
END $$;

COMMENT ON COLUMN platform_admins.role IS 'DEPRECATED: Use platform_admin_role_assignments instead';
