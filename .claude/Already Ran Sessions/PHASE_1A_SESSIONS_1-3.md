# OppsEra SuperAdmin Build — Phase 1A (Sessions 1–3)

## CONTEXT FOR CLAUDE

You are building the **OppsEra Enterprise SuperAdmin Portal** — an internal admin tool for managing a multi-tenant ERP platform. The platform serves golf clubs, restaurants, hotels, retail, and marinas.

### Tech Stack
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend**: Node.js / TypeScript modular monolith
- **Database**: PostgreSQL with RLS, ULID identifiers
- **Auth**: JWT-based, platform_admins table (separate from tenant users)
- **Architecture**: Modular monolith — apps/admin imports only from `shared`, `db`, `core`

### Existing Schema Context

These tables ALREADY EXIST and must be respected:

```sql
-- Platform admin auth + RBAC (EXISTS)
platform_admins (id, email, name, password_hash, role, is_active, phone, status, ...)
platform_admin_roles (id, name, description, is_system)
platform_admin_role_permissions (id, role_id, module, submodule, action, scope)
platform_admin_role_assignments (id, admin_id, role_id, assigned_by_admin_id)
platform_admin_audit_log (id, actor_admin_id, action, entity_type, entity_id, tenant_id, before_snapshot, after_snapshot, reason, ip_address, metadata, created_at)

-- Tenants (EXISTS but thin — will extend)
tenants (id, name, slug, status, billing_customer_id, created_at, updated_at)

-- Module entitlements (EXISTS)
entitlements (id, tenant_id, module_key, plan_tier, is_enabled, limits, access_mode, changed_by, change_reason, previous_mode, ...)
entitlement_change_log (id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, ...)

-- Dead letter queue (EXISTS)
event_dead_letters (id, tenant_id, event_id, event_type, event_data, consumer_name, error_message, error_stack, attempt_count, max_retries, first_failed_at, last_failed_at, status, resolved_at, resolved_by, resolution_notes)

-- Audit log (EXISTS, partitioned)
audit_log (id, tenant_id, location_id, actor_user_id, actor_type, action, entity_type, entity_id, changes, metadata, created_at)

-- Users (EXISTS)
users (id, email, name, tenant_id, status, auth_provider_id, ...)
user_security (user_id, mfa_enabled, failed_login_count, locked_until)
user_roles (id, tenant_id, user_id, role_id)

-- System health (EXISTS)
system_health_snapshots (id, captured_at, connection_count, max_connections, cache_hit_pct, total_db_size_bytes, ...)
alert_log (id, level, title, details, tenant_id, context, sent_at, channel)

-- Locations (EXISTS)
locations (id, tenant_id, name, timezone, location_type, is_active, ...)
```

---

## SESSION 1: Tenant Model Enrichment + Tenant List/Detail UI

### Objective
Extend the thin `tenants` table to support admin operations. Build the tenant list and detail screens that serve as the core navigation spine of the entire admin portal.

### 1.1 — Database Migrations

Create the following migration files:

#### Migration: Extend tenants table

```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_status IN ('pending', 'in_progress', 'completed', 'stalled')),
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_phone text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS health_grade text NOT NULL DEFAULT 'A'
    CHECK (health_grade IN ('A', 'B', 'C', 'D', 'F')),
  ADD COLUMN IF NOT EXISTS total_locations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_users integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;
```

#### Migration: Create tenant_onboarding_checklists

```sql
CREATE TABLE public.tenant_onboarding_checklists (
  id text NOT NULL DEFAULT gen_ulid(),
  tenant_id text NOT NULL,
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
  CONSTRAINT tenant_onboarding_checklists_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT tenant_onboarding_checklists_unique
    UNIQUE (tenant_id, step_key)
);

CREATE INDEX idx_tenant_onboarding_tenant ON tenant_onboarding_checklists(tenant_id);
```

#### Migration: Create superadmin_support_notes

```sql
CREATE TABLE public.superadmin_support_notes (
  id text NOT NULL DEFAULT gen_ulid(),
  tenant_id text NOT NULL,
  author_admin_id text NOT NULL,
  content text NOT NULL,
  note_type text NOT NULL DEFAULT 'general'
    CHECK (note_type IN ('general', 'support_ticket', 'escalation', 'implementation', 'financial')),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT superadmin_support_notes_pkey PRIMARY KEY (id),
  CONSTRAINT superadmin_support_notes_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT superadmin_support_notes_author_admin_id_fkey
    FOREIGN KEY (author_admin_id) REFERENCES public.platform_admins(id)
);

CREATE INDEX idx_support_notes_tenant ON superadmin_support_notes(tenant_id, created_at DESC);
```

#### Migration: Create onboarding_step_templates

```sql
CREATE TABLE public.onboarding_step_templates (
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
```

### 1.2 — Seed Data: Onboarding Templates

```sql
-- Golf Club onboarding steps
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
  (gen_ulid(), 'golf', 'go_live_checklist', 'Go-live verification', 'launch', 100);

-- Restaurant onboarding steps
INSERT INTO onboarding_step_templates (id, industry, step_key, step_label, step_group, sort_order) VALUES
  (gen_ulid(), 'restaurant', 'create_location', 'Create primary location', 'setup', 10),
  (gen_ulid(), 'restaurant', 'configure_catalog', 'Set up menu items', 'setup', 20),
  (gen_ulid(), 'restaurant', 'setup_floor_plan', 'Configure floor plan and tables', 'setup', 30),
  (gen_ulid(), 'restaurant', 'configure_kitchen_stations', 'Set up kitchen stations', 'setup', 40),
  (gen_ulid(), 'restaurant', 'configure_taxes', 'Configure tax rates', 'finance', 50),
  (gen_ulid(), 'restaurant', 'setup_chart_of_accounts', 'Set up chart of accounts', 'finance', 60),
  (gen_ulid(), 'restaurant', 'configure_terminals', 'Configure POS terminals', 'hardware', 70),
  (gen_ulid(), 'restaurant', 'staff_training', 'Complete staff training', 'launch', 80),
  (gen_ulid(), 'restaurant', 'go_live_checklist', 'Go-live verification', 'launch', 90);

-- Add similar for: hotel, retail, marina
```

### 1.3 — Backend: Tenant API Endpoints

Build these API routes under `apps/admin/src/routes/tenants/`:

```
GET    /api/admin/tenants                    — List tenants (paginated, filterable)
GET    /api/admin/tenants/:id                — Tenant detail (includes counts, modules, health)
POST   /api/admin/tenants                    — Create tenant
PATCH  /api/admin/tenants/:id                — Update tenant metadata
POST   /api/admin/tenants/:id/activate       — Activate tenant
POST   /api/admin/tenants/:id/suspend        — Suspend tenant (requires reason)
POST   /api/admin/tenants/:id/reactivate     — Reactivate suspended tenant

GET    /api/admin/tenants/:id/onboarding     — Get onboarding checklist
PATCH  /api/admin/tenants/:id/onboarding/:stepKey — Update step status
POST   /api/admin/tenants/:id/onboarding/initialize — Create checklist from template

GET    /api/admin/tenants/:id/notes          — List support notes
POST   /api/admin/tenants/:id/notes          — Create note
PATCH  /api/admin/tenants/:id/notes/:noteId  — Update note (pin/unpin, edit)
DELETE /api/admin/tenants/:id/notes/:noteId  — Delete note
```

**Query filters for tenant list:**
- `status` (active, suspended, pending)
- `onboarding_status` (pending, in_progress, completed, stalled)
- `industry` (golf, restaurant, hotel, retail, marina, general)
- `health_grade` (A, B, C, D, F)
- `search` (name, slug, primary_contact_email)
- `sort` (name, created_at, last_activity_at, health_grade)
- `page`, `limit`

**Every mutation must:**
1. Validate the acting admin has permission
2. Write to `platform_admin_audit_log` with before/after snapshots
3. Return the updated entity

### 1.4 — Frontend: Tenant List Screen

**Route:** `/admin/tenants`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Tenants                            [+ Create]  │
├─────────────────────────────────────────────────┤
│  [Search...] [Status ▼] [Industry ▼] [Health ▼]│
├─────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────┐  │
│  │ Acme Golf Club          Golf     ● Active │  │
│  │ 3 locations · 24 users · Health: A        │  │
│  │ Onboarding: ████████░░ 80%                │  │
│  ├───────────────────────────────────────────┤  │
│  │ Bella Ristorante     Restaurant  ● Active │  │
│  │ 1 location · 12 users · Health: B         │  │
│  │ Onboarding: ██████████ Complete            │  │
│  ├───────────────────────────────────────────┤  │
│  │ Harbor Marina          Marina   ◌ Pending │  │
│  │ 0 locations · 1 user · Health: —          │  │
│  │ Onboarding: ██░░░░░░░░ 15%               │  │
│  └───────────────────────────────────────────┘  │
│  ◄ 1 2 3 ... 42 ►                              │
└─────────────────────────────────────────────────┘
```

**Components to build:**
- `TenantListPage` — page container with filters and pagination
- `TenantCard` — list row showing key info at a glance
- `TenantFilters` — filter bar (status, industry, health, search)
- `CreateTenantDialog` — modal for new tenant creation
- `StatusBadge` — reusable colored badge (active=green, suspended=red, pending=yellow)
- `HealthGradeBadge` — A=green, B=blue, C=yellow, D=orange, F=red
- `OnboardingProgress` — progress bar with percentage

### 1.5 — Frontend: Tenant Detail Screen

**Route:** `/admin/tenants/:id`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  ← Back to Tenants                              │
│                                                  │
│  Acme Golf Club                    ● Active     │
│  golf · acme-golf · Created Jan 15, 2026        │
│  Contact: john@acmegolf.com                     │
│                                                  │
│  ┌────────┬─────────┬──────────┬────────────┐   │
│  │ 3      │ 24      │ A       │ 80%         │   │
│  │Locations│ Users   │ Health  │ Onboarding  │   │
│  └────────┴─────────┴──────────┴────────────┘   │
│                                                  │
│  [Overview] [Modules] [Users] [Onboarding]      │
│  [Notes] [Audit Log] [Timeline]                 │
│                                                  │
│  ─── Overview Tab ───                           │
│  Locations: [table of locations]                │
│  Recent Activity: [last 10 events]              │
│  Module Badges: POS ✓ | Tee Sheet ✓ | CRM ✓    │
│                                                  │
│  ─── Actions Sidebar ───                        │
│  [Impersonate User ▼]                           │
│  [Suspend Tenant]                               │
│  [Edit Details]                                 │
└─────────────────────────────────────────────────┘
```

**Components to build:**
- `TenantDetailPage` — container with tabs
- `TenantHeader` — name, status, key metadata, action buttons
- `TenantStatsBar` — locations, users, health, onboarding counts
- `TenantOverviewTab` — locations table, recent activity, module badges
- `TenantModulesTab` — (built in Session 4)
- `TenantUsersTab` — (built in Session 6)
- `TenantOnboardingTab` — checklist with step status toggles
- `TenantNotesTab` — support notes with pin/create/edit
- `TenantAuditTab` — (built in Session 9)
- `SuspendTenantDialog` — confirmation modal requiring reason
- `EditTenantDialog` — edit metadata, contact info, industry

### 1.6 — Frontend: Admin Portal Shell + Navigation

Build the overall admin portal layout:

**Sidebar Navigation:**
```
┌──────────────────┐
│  OPPSERA ADMIN   │
│  ─────────────── │
│  🏠 Dashboard    │
│  🏢 Tenants      │
│  👤 Users        │
│  📦 Modules      │
│  💀 Dead Letters │
│  ❤️ Health       │
│  💰 Finance      │
│  📋 Audit Logs   │
│  🔍 Search (⌘K) │
│  ─────────────── │
│  ⚙ Settings      │
│  👋 Logout       │
│  ─────────────── │
│  Admin: Jane Doe │
│  Role: Support   │
└──────────────────┘
```

**Components:**
- `AdminLayout` — sidebar + main content area + command palette trigger
- `AdminSidebar` — navigation links with active state, role-based visibility
- `AdminHeader` — breadcrumbs, notification bell placeholder, admin profile
- `CommandPalette` — (placeholder for Session 10, just the trigger/shortcut)

### 1.7 — Tests

Write tests for:

**Backend:**
- `tenants.list` — returns paginated results, respects filters
- `tenants.create` — creates tenant, initializes onboarding from template
- `tenants.suspend` — requires reason, writes audit log, sets suspended_at
- `tenants.reactivate` — clears suspension, writes audit log
- `notes.create` — creates note, validates admin exists
- `notes.pin` — toggles pin status
- `onboarding.initialize` — creates checklist from industry template
- `onboarding.updateStep` — updates step status, sets completed_at/by

**Frontend:**
- Tenant list renders, filters work, pagination works
- Tenant detail loads tabs correctly
- Suspend dialog requires reason input before enabling confirm button
- Create tenant dialog validates required fields
- Notes panel creates/edits/pins notes
- Onboarding checklist toggles step status

---

## SESSION 2: Platform Admin RBAC Reconciliation + Admin Management

### Objective
Clean up the existing RBAC model (reconcile legacy `role` column with the newer role tables), seed canonical roles and permissions, and build the admin management UI.

### 2.1 — Database Migrations

#### Migration: Reconcile platform_admins role system

```sql
-- Step 1: Seed canonical roles
INSERT INTO platform_admin_roles (id, name, description, is_system) VALUES
  ('role_super_admin',     'Super Admin',                'Full platform access. All permissions.',                    true),
  ('role_platform_eng',    'Platform Engineer',          'System health, DLQ, config, debugging. No financial mutations.', true),
  ('role_implementation',  'Implementation Specialist',  'Tenant setup, onboarding, user management, impersonation.',  true),
  ('role_support_agent',   'Support Agent',              'View tenants, manage users, impersonate, view errors.',       true),
  ('role_finance_support', 'Finance Support',            'Financial investigation, audit logs, reporting. No impersonation.', true),
  ('role_viewer',          'Viewer',                     'Read-only access to all sections.',                          true)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Seed permissions for each role
-- Permission format: module.submodule.action
-- Modules: tenants, users, modules, dlq, health, finance, audit, search, impersonation, admin_management

-- Super Admin — everything
INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
  (gen_ulid(), 'role_super_admin', '*', '*', '*', 'global');

-- Platform Engineer
INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
  (gen_ulid(), 'role_platform_eng', 'tenants',       NULL, 'read',         'global'),
  (gen_ulid(), 'role_platform_eng', 'users',          NULL, 'read',         'global'),
  (gen_ulid(), 'role_platform_eng', 'impersonation',  NULL, 'execute',      'global'),
  (gen_ulid(), 'role_platform_eng', 'modules',        NULL, 'read',         'global'),
  (gen_ulid(), 'role_platform_eng', 'modules',        NULL, 'write',        'global'),
  (gen_ulid(), 'role_platform_eng', 'dlq',            NULL, 'read',         'global'),
  (gen_ulid(), 'role_platform_eng', 'dlq',            NULL, 'retry',        'global'),
  (gen_ulid(), 'role_platform_eng', 'dlq',            NULL, 'discard',      'global'),
  (gen_ulid(), 'role_platform_eng', 'health',         NULL, 'read',         'global'),
  (gen_ulid(), 'role_platform_eng', 'finance',        NULL, 'read',         'global'),
  (gen_ulid(), 'role_platform_eng', 'audit',          NULL, 'read',         'global');

-- Implementation Specialist
INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
  (gen_ulid(), 'role_implementation', 'tenants',       NULL, 'read',         'global'),
  (gen_ulid(), 'role_implementation', 'tenants',       NULL, 'write',        'global'),
  (gen_ulid(), 'role_implementation', 'tenants',       NULL, 'create',       'global'),
  (gen_ulid(), 'role_implementation', 'users',          NULL, 'read',         'global'),
  (gen_ulid(), 'role_implementation', 'users',          NULL, 'write',        'global'),
  (gen_ulid(), 'role_implementation', 'impersonation',  NULL, 'execute',      'global'),
  (gen_ulid(), 'role_implementation', 'modules',        NULL, 'read',         'global'),
  (gen_ulid(), 'role_implementation', 'modules',        NULL, 'write',        'global'),
  (gen_ulid(), 'role_implementation', 'dlq',            NULL, 'read',         'global'),
  (gen_ulid(), 'role_implementation', 'health',         NULL, 'read',         'global'),
  (gen_ulid(), 'role_implementation', 'finance',        NULL, 'read',         'global'),
  (gen_ulid(), 'role_implementation', 'audit',          NULL, 'read',         'global');

-- Support Agent
INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
  (gen_ulid(), 'role_support_agent', 'tenants',       NULL, 'read',         'global'),
  (gen_ulid(), 'role_support_agent', 'users',          NULL, 'read',         'global'),
  (gen_ulid(), 'role_support_agent', 'users',          NULL, 'write',        'global'),
  (gen_ulid(), 'role_support_agent', 'impersonation',  NULL, 'execute',      'global'),
  (gen_ulid(), 'role_support_agent', 'dlq',            NULL, 'read',         'global'),
  (gen_ulid(), 'role_support_agent', 'health',         NULL, 'read',         'global'),
  (gen_ulid(), 'role_support_agent', 'finance',        NULL, 'read',         'global'),
  (gen_ulid(), 'role_support_agent', 'audit',          NULL, 'read',         'global');

-- Finance Support
INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
  (gen_ulid(), 'role_finance_support', 'tenants',  NULL, 'read',   'global'),
  (gen_ulid(), 'role_finance_support', 'users',    NULL, 'read',   'global'),
  (gen_ulid(), 'role_finance_support', 'finance',  NULL, 'read',   'global'),
  (gen_ulid(), 'role_finance_support', 'finance',  NULL, 'write',  'global'),
  (gen_ulid(), 'role_finance_support', 'audit',    NULL, 'read',   'global'),
  (gen_ulid(), 'role_finance_support', 'audit',    NULL, 'export', 'global'),
  (gen_ulid(), 'role_finance_support', 'dlq',      NULL, 'read',   'global');

-- Viewer
INSERT INTO platform_admin_role_permissions (id, role_id, module, submodule, action, scope) VALUES
  (gen_ulid(), 'role_viewer', 'tenants',  NULL, 'read', 'global'),
  (gen_ulid(), 'role_viewer', 'users',    NULL, 'read', 'global'),
  (gen_ulid(), 'role_viewer', 'modules',  NULL, 'read', 'global'),
  (gen_ulid(), 'role_viewer', 'dlq',      NULL, 'read', 'global'),
  (gen_ulid(), 'role_viewer', 'health',   NULL, 'read', 'global'),
  (gen_ulid(), 'role_viewer', 'finance',  NULL, 'read', 'global'),
  (gen_ulid(), 'role_viewer', 'audit',    NULL, 'read', 'global');

-- Step 3: Migrate existing admins from legacy role column to role_assignments
INSERT INTO platform_admin_role_assignments (id, admin_id, role_id)
SELECT gen_ulid(), id,
  CASE role
    WHEN 'super_admin' THEN 'role_super_admin'
    WHEN 'admin' THEN 'role_support_agent'
    WHEN 'viewer' THEN 'role_viewer'
    ELSE 'role_viewer'
  END
FROM platform_admins
WHERE NOT EXISTS (
  SELECT 1 FROM platform_admin_role_assignments ra WHERE ra.admin_id = platform_admins.id
);

-- Step 4: Mark legacy column as deprecated (don't drop yet for safety)
COMMENT ON COLUMN platform_admins.role IS 'DEPRECATED: Use platform_admin_role_assignments instead';
```

### 2.2 — Backend: Permission Middleware

Build a reusable middleware/guard:

```typescript
// Pseudo-code for permission checking
interface PermissionCheck {
  module: string;
  action: string;
  submodule?: string;
}

async function requirePermission(adminId: string, check: PermissionCheck): Promise<boolean> {
  // 1. Get admin's role assignments
  // 2. Get permissions for those roles
  // 3. Check if any permission matches:
  //    - Wildcard (*) on module, submodule, or action
  //    - Exact match on module + action
  //    - submodule match if specified
  // 4. Return true/false
}

// Usage in route handlers:
app.get('/api/admin/tenants', async (req, res) => {
  await requirePermission(req.adminId, { module: 'tenants', action: 'read' });
  // ... handler logic
});
```

### 2.3 — Backend: Admin Management API

```
GET    /api/admin/admins                — List all platform admins
GET    /api/admin/admins/:id            — Admin detail (profile + roles + recent activity)
POST   /api/admin/admins/invite         — Invite new admin (email, name, role_id)
PATCH  /api/admin/admins/:id            — Update admin profile
POST   /api/admin/admins/:id/deactivate — Deactivate admin
POST   /api/admin/admins/:id/reactivate — Reactivate admin
POST   /api/admin/admins/:id/roles      — Assign role
DELETE /api/admin/admins/:id/roles/:roleId — Remove role
POST   /api/admin/admins/:id/reset-password — Force password reset

GET    /api/admin/roles                 — List all roles with permission counts
GET    /api/admin/roles/:id             — Role detail with full permissions list
```

### 2.4 — Frontend: Admin Management Screens

**Route:** `/admin/settings/admins`

Build:
- `AdminListPage` — table of all admins with name, email, role badges, status, last login
- `AdminDetailPanel` — slide-over or modal showing profile, roles, activity log
- `InviteAdminDialog` — form: email, name, role selection
- `RoleAssignmentSelect` — multi-select for assigning roles
- `AdminActivityLog` — filtered view of `platform_admin_audit_log` for this admin

**Route:** `/admin/settings/roles`

Build:
- `RoleListPage` — table of roles with permission count, admin count
- `RoleDetailPage` — shows all permissions in a grouped matrix view

### 2.5 — Tests

**Backend:**
- Permission middleware: wildcard matching, exact matching, deny by default
- Admin invite flow: creates admin with pending status, correct role assignment
- Deactivate admin: cannot deactivate self, writes audit log
- Role assignment: validates role exists, prevents duplicate assignments

**Frontend:**
- Admin list renders with correct role badges
- Invite dialog validates email format, requires role selection
- Role detail page shows permission matrix correctly

---

## SESSION 3: Impersonation System

### Objective
Build the complete impersonation system — the single most critical support tool. An admin can assume the identity of a tenant user to see exactly what they see, diagnose issues, and verify fixes.

### 3.1 — Database Migration

```sql
CREATE TABLE public.impersonation_sessions (
  id text NOT NULL DEFAULT gen_ulid(),
  admin_id text NOT NULL,
  tenant_id text NOT NULL,
  target_user_id text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'expired', 'revoked')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  max_duration_minutes integer NOT NULL DEFAULT 60,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  actions_performed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT impersonation_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT impersonation_sessions_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES public.platform_admins(id),
  CONSTRAINT impersonation_sessions_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT impersonation_sessions_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES public.users(id)
);

CREATE INDEX idx_impersonation_sessions_admin ON impersonation_sessions(admin_id, status);
CREATE INDEX idx_impersonation_sessions_active ON impersonation_sessions(status) WHERE status = 'active';
CREATE INDEX idx_impersonation_sessions_tenant ON impersonation_sessions(tenant_id, created_at DESC);
```

### 3.2 — Backend: Impersonation API

```
POST   /api/admin/impersonate                — Start impersonation session
  Body: { tenant_id, target_user_id, reason, max_duration_minutes? }
  Returns: { session_id, token, expires_at }

POST   /api/admin/impersonate/:sessionId/end — End impersonation session
  Returns: { session_id, ended_at, duration_minutes, actions_performed }

GET    /api/admin/impersonate/active         — Get current active session (if any)
  Returns: session details or null

GET    /api/admin/impersonate/history        — List impersonation history (paginated)
  Filters: admin_id, tenant_id, date_range
```

**Impersonation Token:**
```typescript
// The impersonation token is a standard JWT with extra claims:
{
  sub: targetUser.id,          // The user being impersonated
  tenant_id: tenant.id,
  impersonator_id: admin.id,   // The admin doing the impersonating
  impersonation_session_id: session.id,
  is_impersonation: true,      // Flag for middleware/UI detection
  exp: session.expires_at
}
```

**Safety Rules (enforce in backend):**

```typescript
async function startImpersonation(adminId: string, params: StartImpersonationParams) {
  // 1. Check admin has 'impersonation.execute' permission
  // 2. Check target user exists and belongs to target tenant
  // 3. Check target user is NOT a platform admin
  // 4. Check admin has no other active impersonation sessions
  // 5. Check tenant is not suspended
  // 6. Require reason (min 10 characters)
  // 7. Create session record
  // 8. Mint impersonation JWT
  // 9. Write to platform_admin_audit_log:
  //    action: 'impersonation.start'
  //    entity_type: 'user'
  //    entity_id: target_user_id
  //    tenant_id: tenant_id
  //    reason: reason
  // 10. Return session + token
}
```

**Restricted actions during impersonation:**
- Cannot void orders over $500
- Cannot issue refunds over $500
- Cannot change accounting settings
- Cannot delete any records
- Cannot modify other users' permissions
- Cannot access other tenants

### 3.3 — Backend: Impersonation Middleware

```typescript
// In the TENANT app's auth middleware (apps/web), detect impersonation:
function authMiddleware(req, res, next) {
  const decoded = verifyJWT(req.token);

  if (decoded.is_impersonation) {
    req.user = {
      id: decoded.sub,
      tenantId: decoded.tenant_id,
      isImpersonated: true,
      impersonatorId: decoded.impersonator_id,
      impersonationSessionId: decoded.impersonation_session_id,
    };

    // Tag all audit_log entries with actor_type: 'impersonation'
    req.auditContext = {
      actor_type: 'impersonation',
      actor_user_id: decoded.sub,
      metadata: {
        impersonator_admin_id: decoded.impersonator_id,
        impersonation_session_id: decoded.impersonation_session_id,
      }
    };
  }

  next();
}
```

### 3.4 — Backend: Session Expiry Job

```typescript
// Cron job: runs every 5 minutes
async function expireImpersonationSessions() {
  const expired = await db.query(`
    UPDATE impersonation_sessions
    SET status = 'expired', ended_at = now()
    WHERE status = 'active' AND expires_at < now()
    RETURNING id, admin_id, tenant_id, target_user_id
  `);

  for (const session of expired.rows) {
    await writeAuditLog({
      actor_admin_id: session.admin_id,
      action: 'impersonation.expired',
      entity_type: 'impersonation_session',
      entity_id: session.id,
      tenant_id: session.tenant_id,
    });
  }
}
```

### 3.5 — Frontend: Impersonation Trigger (Admin Portal)

On the Tenant Detail page and User Detail page, add:

```
┌─────────────────────────────────────────┐
│  Impersonate User                       │
│                                         │
│  Select User:  [John Smith ▼]           │
│                                         │
│  Reason: (required)                     │
│  ┌─────────────────────────────────┐    │
│  │ Investigating reported issue    │    │
│  │ with tee sheet not loading...   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Duration: [60 minutes ▼]              │
│                                         │
│  ⚠️ You will see the tenant app as     │
│  this user. All actions are logged.    │
│                                         │
│  [Cancel]              [Start Session]  │
└─────────────────────────────────────────┘
```

- `ImpersonateDialog` — modal with user selection, reason input, duration picker
- User dropdown filters to the tenant's users
- Reason minimum 10 characters
- "Start Session" opens new browser tab to tenant app with impersonation token
- Dialog shows warning about logging

### 3.6 — Frontend: Impersonation Banner (Tenant App)

In the **tenant app** (`apps/web`), add a persistent banner when `isImpersonated` is true:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 IMPERSONATION MODE — Viewing as John Smith (Acme Golf)  │
│    Admin: jane@oppsera.com · Expires in 47 min  [End Now]   │
└─────────────────────────────────────────────────────────────┘
```

- Fixed to top of viewport, z-index above everything
- Red/orange background — unmistakable
- Shows impersonated user, tenant, admin email, countdown timer
- "End Now" button calls end-session API and redirects back to admin portal
- Cannot be dismissed or hidden

### 3.7 — Frontend: Impersonation History View (Admin Portal)

**Route:** `/admin/impersonation-log`

Also embedded as tab in Tenant Detail page.

```
┌──────────────────────────────────────────────────────────┐
│  Impersonation Log                                       │
├──────────────────────────────────────────────────────────┤
│  [Admin ▼] [Tenant ▼] [Date Range] [Status ▼]          │
├──────────────────────────────────────────────────────────┤
│  Jane Doe → John Smith (Acme Golf)                      │
│  Reason: Investigating tee sheet loading issue           │
│  Feb 22, 2026 · 10:30 AM – 10:47 AM · 4 actions        │
│  Status: Ended                                          │
├──────────────────────────────────────────────────────────┤
│  Bob Chen → Maria Lopez (Bella Ristorante)              │
│  Reason: Verifying menu configuration fix                │
│  Feb 22, 2026 · 2:15 PM – (active, 43 min remaining)   │
│  Status: ● Active                                       │
└──────────────────────────────────────────────────────────┘
```

### 3.8 — Tests

**Backend:**
- Start impersonation: creates session, mints token, writes audit log
- Start impersonation denied: no permission, suspended tenant, target is admin
- End impersonation: updates session status, writes audit log
- Expiry job: correctly expires overdue sessions
- Impersonation middleware: correctly tags audit entries
- Restricted actions: returns 403 for void/refund over threshold during impersonation

**Frontend:**
- Impersonate dialog validates reason length
- Banner renders with correct info when impersonation token detected
- End session button works and redirects
- History log filters and displays correctly

---

## COMPLETION CHECKLIST — Phase 1A

After completing Sessions 1–3, you should have:

- [ ] Extended tenants table with industry, onboarding, health, contacts
- [ ] Tenant onboarding checklists with industry templates
- [ ] Support notes system
- [ ] Tenant list page with filters, pagination, search
- [ ] Tenant detail page with tabs (overview, onboarding, notes)
- [ ] Admin portal shell (sidebar nav, layout, routing)
- [ ] RBAC system with 6 canonical roles and permission matrix
- [ ] Permission middleware enforcing access on all routes
- [ ] Admin management UI (list, invite, role assignment)
- [ ] Impersonation session tracking table
- [ ] Start/end impersonation API with safety rules
- [ ] Impersonation token minting with special JWT claims
- [ ] Impersonation banner in tenant app
- [ ] Impersonation history/audit log
- [ ] Session auto-expiry job
- [ ] Comprehensive test coverage for all above

This is the foundation everything else builds on.
