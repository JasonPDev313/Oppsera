# OppsEra SuperAdmin Build — Phase 1B (Sessions 4–6)

## CONTEXT FOR CLAUDE

You are continuing the build of the **OppsEra Enterprise SuperAdmin Portal**. Sessions 1–3 have already been completed and the following is now in place:

### What Already Exists (from Sessions 1–3)

**Database:**
- Extended `tenants` table (industry, onboarding_status, health_grade, contacts, metadata)
- `tenant_onboarding_checklists` table with industry templates
- `superadmin_support_notes` table
- `onboarding_step_templates` table with seed data
- RBAC roles seeded: super_admin, platform_engineer, implementation_specialist, support_agent, finance_support, viewer
- Full permission matrix in `platform_admin_role_permissions`
- `impersonation_sessions` table

**Backend:**
- Tenant CRUD + lifecycle APIs (create, activate, suspend, reactivate)
- Onboarding checklist APIs
- Support notes APIs
- Permission middleware (`requirePermission`)
- Admin management APIs (list, invite, role assignment)
- Impersonation APIs (start, end, history)
- Impersonation token minting + session expiry job

**Frontend:**
- Admin portal shell (sidebar, layout, routing)
- Tenant list page with filters
- Tenant detail page with tabs (overview, onboarding, notes)
- Admin management pages
- Impersonation dialog + banner + history log

### Existing Schema Tables You'll Query (already exist in production)

```sql
-- Module entitlements (EXISTS)
entitlements (id, tenant_id, module_key, plan_tier, is_enabled, limits, access_mode, changed_by, change_reason, previous_mode, activated_at, expires_at)
entitlement_change_log (id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, change_source, metadata)

-- Dead letter queue (EXISTS)
event_dead_letters (id, tenant_id, event_id, event_type, event_data, consumer_name, error_message, error_stack, attempt_count, max_retries, first_failed_at, last_failed_at, status, resolved_at, resolved_by, resolution_notes)

-- Users (EXISTS)
users (id, email, name, tenant_id, status, auth_provider_id, first_name, last_name, display_name, phone, last_login_at, primary_role_id, password_hash, password_reset_required)
user_security (user_id, unique_login_pin_hash, pos_override_pin_hash, mfa_enabled, failed_login_count, locked_until)
user_roles (id, tenant_id, user_id, role_id)
role_assignments (id, tenant_id, user_id, role_id, location_id)
roles (id, tenant_id, name, description, is_system)
role_permissions (id, role_id, permission)

-- API keys (EXISTS)
api_keys (id, tenant_id, name, key_hash, key_prefix, is_enabled, expires_at, revoked_at)

-- Locations (EXISTS)
locations (id, tenant_id, name, timezone, location_type, is_active)

-- Module templates (EXISTS)
module_templates (id, name, description, business_type, is_system, modules)
```

---

## SESSION 4: Module Provisioning + Feature Flags

### Objective
Build the module management system: enable/disable modules per tenant, manage feature flags, view the capability matrix, and apply industry templates. This uses the existing `entitlements` table as the source of truth.

### 4.1 — Database Migration

#### Migration: Create tenant_feature_flags

```sql
CREATE TABLE public.tenant_feature_flags (
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

CREATE INDEX idx_tenant_feature_flags_tenant ON tenant_feature_flags(tenant_id);
CREATE INDEX idx_tenant_feature_flags_key ON tenant_feature_flags(flag_key, is_enabled);
```

#### Seed: Feature flag definitions

```sql
-- These are the known feature flags in the system
-- They are NOT per-tenant — they define what flags exist
CREATE TABLE public.feature_flag_definitions (
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

INSERT INTO feature_flag_definitions (id, flag_key, display_name, description, module_key, risk_level) VALUES
  (gen_ulid(), 'beta_semantic_search',     'Semantic AI Search',         'Enable AI-powered semantic search in reporting',      'reporting',    'medium'),
  (gen_ulid(), 'beta_guest_pay',           'Guest QR Pay',              'Enable QR code payment for restaurant guests',          'fnb',          'medium'),
  (gen_ulid(), 'beta_kitchen_display',     'Kitchen Display System',    'Enable KDS screens for kitchen stations',               'fnb',          'low'),
  (gen_ulid(), 'beta_inventory_recipes',   'Recipe Management',         'Enable recipe costing and components',                  'inventory',    'low'),
  (gen_ulid(), 'beta_multi_currency',      'Multi-Currency Support',    'Enable multi-currency transactions',                    'accounting',   'high'),
  (gen_ulid(), 'beta_autopay',             'Membership AutoPay',        'Enable automatic payment processing for memberships',   'membership',   'high'),
  (gen_ulid(), 'beta_pace_of_play',        'Pace of Play Tracking',    'Enable GPS-based pace of play monitoring',              'golf',         'low'),
  (gen_ulid(), 'beta_online_ordering',     'Online Ordering',          'Enable customer-facing online ordering',                 'fnb',          'medium'),
  (gen_ulid(), 'beta_pms_night_audit',     'PMS Night Audit',          'Enable automated night audit processing',               'pms',          'high'),
  (gen_ulid(), 'enable_legacy_gl_posting', 'Legacy GL Posting',        'Keep legacy GL posting behavior active',                'accounting',   'low');
```

#### Seed: Module templates by industry

```sql
-- Update module_templates with canonical industry defaults
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
 ]'::jsonb);
```

### 4.2 — Backend: Module Provisioning API

```
GET    /api/admin/tenants/:id/modules              — List tenant's entitlements with status
POST   /api/admin/tenants/:id/modules/apply-template — Apply industry template to tenant
PATCH  /api/admin/tenants/:id/modules/:moduleKey    — Update module access_mode (off/view/full)
  Body: { access_mode: 'full', reason: 'Client upgraded plan' }

GET    /api/admin/modules/matrix                    — Capability matrix: all tenants × modules
  Returns: [{ tenant_id, tenant_name, modules: { pos: 'full', fnb: 'off', ... } }]

GET    /api/admin/modules/templates                 — List available module templates

GET    /api/admin/tenants/:id/feature-flags         — List feature flags for tenant
PATCH  /api/admin/tenants/:id/feature-flags/:flagKey — Toggle feature flag
  Body: { is_enabled: true }

GET    /api/admin/feature-flags/definitions         — List all feature flag definitions
```

**Module enable validation:**
When enabling a module, validate prerequisites:
```typescript
const MODULE_PREREQUISITES: Record<string, string[]> = {
  fnb: ['pos', 'catalog'],
  tee_sheet: ['pos'],
  events: ['pos', 'catalog'],
  membership: ['crm'],
  pms: ['pos', 'crm'],
  inventory: ['catalog'],
  accounting: ['pos'],
};

async function validateModuleEnable(tenantId: string, moduleKey: string) {
  const prerequisites = MODULE_PREREQUISITES[moduleKey] || [];
  const existing = await getEntitlements(tenantId);

  const missing = prerequisites.filter(prereq =>
    !existing.find(e => e.module_key === prereq && e.access_mode !== 'off')
  );

  if (missing.length > 0) {
    throw new Error(`Cannot enable ${moduleKey}. Missing prerequisites: ${missing.join(', ')}`);
  }
}
```

**Every module change must:**
1. Validate prerequisites
2. Write to `entitlements` table
3. Write to `entitlement_change_log`
4. Write to `platform_admin_audit_log`

### 4.3 — Frontend: Modules Tab (Tenant Detail)

Embedded in the Tenant Detail page as the "Modules" tab.

```
┌─────────────────────────────────────────────────────────┐
│  Modules                        [Apply Template ▼]      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Module           │ Status    │ Access │ Actions  │    │
│  ├──────────────────┼───────────┼────────┼──────────┤    │
│  │ 🛒 POS           │ ● Active  │ Full   │ [Edit]   │    │
│  │ 📋 Catalog       │ ● Active  │ Full   │ [Edit]   │    │
│  │ 👤 CRM           │ ● Active  │ Full   │ [Edit]   │    │
│  │ ⛳ Tee Sheet      │ ● Active  │ Full   │ [Edit]   │    │
│  │ 🎪 Events        │ ● Active  │ Full   │ [Edit]   │    │
│  │ 💳 Membership    │ ● Active  │ Full   │ [Edit]   │    │
│  │ 💰 Accounting    │ ● Active  │ Full   │ [Edit]   │    │
│  │ 📊 Reporting     │ ● Active  │ Full   │ [Edit]   │    │
│  │ 🍽️ F&B           │ ◌ Off     │ —      │ [Enable] │    │
│  │ 📦 Inventory     │ 👁 View   │ View   │ [Edit]   │    │
│  │ 🏨 PMS           │ ◌ Off     │ —      │ [Enable] │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ── Feature Flags ──                                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Beta Semantic Search   [○ Off]     Reporting     │    │
│  │ Guest QR Pay           [● On]      F&B    ⚠ Med │    │
│  │ Kitchen Display        [○ Off]     F&B           │    │
│  │ Multi-Currency         [○ Off]     Accounting 🔴 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ── Change History ──                                   │
│  Feb 20: pos access_mode → full (by Jane Doe)          │
│  Feb 18: fnb access_mode off → full (by Bob Chen)      │
│  Feb 15: Template "Golf Standard" applied (by Jane)     │
└─────────────────────────────────────────────────────────┘
```

**Components:**
- `TenantModulesTab` — container for all module management
- `ModuleEntitlementRow` — row with status indicator, access mode badge, edit action
- `ModuleEditDialog` — modal to change access_mode with reason field
- `ApplyTemplateDialog` — select industry template, preview changes, confirm
- `FeatureFlagsPanel` — list of toggles with risk level indicators
- `ModuleChangeHistory` — chronological list from `entitlement_change_log`

### 4.4 — Frontend: Capability Matrix (Global View)

**Route:** `/admin/modules`

```
┌──────────────────────────────────────────────────────────────────┐
│  Module Capability Matrix                                        │
├──────────────────────────────────────────────────────────────────┤
│  [Industry ▼] [Status ▼] [Search tenant...]                    │
├──────────────────────────────────────────────────────────────────┤
│              │ POS │ Cat │ CRM │ Tee │ F&B │ Inv │ Acct│ PMS  │
│  ────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼──────│
│  Acme Golf   │ ●   │ ●   │ ●   │ ●   │ ◌   │ 👁  │ ●   │ ◌   │
│  Bella Risto │ ●   │ ●   │ ●   │ ◌   │ ●   │ ●   │ ●   │ ◌   │
│  Harbor Mar  │ ●   │ ●   │ ●   │ ◌   │ ◌   │ ◌   │ ◌   │ ◌   │
│  Grand Hotel │ ●   │ ●   │ ●   │ ◌   │ ●   │ ◌   │ ●   │ ●   │
└──────────────────────────────────────────────────────────────────┘
● = Full   👁 = View   ◌ = Off

Click any cell → opens module edit dialog for that tenant+module
```

**Components:**
- `CapabilityMatrixPage` — full page heatmap/grid view
- `MatrixCell` — clickable cell with status indicator, opens edit dialog
- Matrix is scrollable horizontally for many modules
- Row click → navigates to tenant detail

### 4.5 — Tests

**Backend:**
- Apply template: creates correct entitlements for industry
- Enable module: validates prerequisites, writes change log
- Disable module: warns if dependents exist, writes change log
- Toggle feature flag: sets enabled_at/by, writes audit log
- Capability matrix: returns correct cross-tenant data

**Frontend:**
- Module tab renders all modules with correct status
- Edit dialog shows access_mode options, requires reason
- Apply template dialog shows preview of changes
- Feature flag toggles work with confirmation for high-risk flags
- Capability matrix renders and cells are clickable

---

## SESSION 5: Dead Letter Queue Management

### Objective
Build the DLQ management interface — one of the highest-value tools for operations. This lets the team see failed events, diagnose root causes, and retry or discard them.

### 5.1 — Database Updates

The `event_dead_letters` table already exists. Add helpful indexes and a retry tracking table:

```sql
-- Add indexes for admin portal query patterns
CREATE INDEX IF NOT EXISTS idx_event_dead_letters_tenant_status
  ON event_dead_letters(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_dead_letters_consumer
  ON event_dead_letters(consumer_name, status);
CREATE INDEX IF NOT EXISTS idx_event_dead_letters_event_type
  ON event_dead_letters(event_type, status);
CREATE INDEX IF NOT EXISTS idx_event_dead_letters_status_created
  ON event_dead_letters(status, created_at DESC);

-- Track retry attempts with more detail
CREATE TABLE public.dead_letter_retry_log (
  id text NOT NULL DEFAULT gen_ulid(),
  dead_letter_id text NOT NULL,
  retry_number integer NOT NULL,
  retried_by text NOT NULL,
  retry_result text NOT NULL CHECK (retry_result IN ('success', 'failed')),
  error_message text,
  retried_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dead_letter_retry_log_pkey PRIMARY KEY (id),
  CONSTRAINT dead_letter_retry_log_dead_letter_id_fkey
    FOREIGN KEY (dead_letter_id) REFERENCES public.event_dead_letters(id),
  CONSTRAINT dead_letter_retry_log_retried_by_fkey
    FOREIGN KEY (retried_by) REFERENCES public.platform_admins(id)
);

CREATE INDEX idx_dead_letter_retry_log_dl ON dead_letter_retry_log(dead_letter_id);
```

### 5.2 — Backend: DLQ API

```
GET    /api/admin/dlq                          — List dead letters (paginated, filterable)
  Filters: tenant_id, status, event_type, consumer_name, date_from, date_to
  Sort: created_at, last_failed_at, attempt_count

GET    /api/admin/dlq/stats                    — Aggregate stats
  Returns: { total, by_status: {failed: N, resolved: N, discarded: N},
             by_tenant: [{tenant_id, tenant_name, count}],
             by_consumer: [{consumer_name, count}],
             by_event_type: [{event_type, count}] }

GET    /api/admin/dlq/:id                      — Single dead letter detail
  Returns: full record + retry history from dead_letter_retry_log

POST   /api/admin/dlq/:id/retry                — Retry single event
  Body: { notes?: string }
  Process:
    1. Re-dispatch event to the original consumer
    2. If success: update status to 'resolved', set resolved_at/by
    3. If failure: increment attempt_count, log to retry_log
    4. Write audit log

POST   /api/admin/dlq/:id/discard              — Discard event (give up)
  Body: { reason: string }  // REQUIRED
  Process:
    1. Update status to 'discarded' (add this to the check constraint if needed)
    2. Set resolved_at/by, resolution_notes = reason
    3. Write audit log

POST   /api/admin/dlq/batch-retry              — Retry multiple events
  Body: { filters: { tenant_id?, consumer_name?, event_type?, date_from?, date_to? }, notes?: string }
  Process:
    1. Find all matching dead letters with status = 'failed'
    2. Process each sequentially (or in batches of 10)
    3. Return summary: { attempted, succeeded, failed }

POST   /api/admin/dlq/batch-discard            — Discard multiple events
  Body: { dead_letter_ids: string[], reason: string }
```

**Retry implementation:**
```typescript
async function retryDeadLetter(deadLetterId: string, adminId: string, notes?: string) {
  const dl = await getDeadLetter(deadLetterId);
  if (dl.status !== 'failed') throw new Error('Can only retry failed events');

  try {
    // Re-dispatch to the original consumer
    await eventBus.dispatch(dl.consumer_name, {
      id: dl.event_id,
      type: dl.event_type,
      data: dl.event_data,
    });

    // Success: mark resolved
    await db.query(`
      UPDATE event_dead_letters
      SET status = 'resolved', resolved_at = now(), resolved_by = $1, resolution_notes = $2
      WHERE id = $3
    `, [adminId, notes || 'Retried successfully via admin portal', deadLetterId]);

    await logRetryAttempt(deadLetterId, adminId, 'success');
    return { success: true };

  } catch (error) {
    // Failure: increment count, log attempt
    await db.query(`
      UPDATE event_dead_letters
      SET attempt_count = attempt_count + 1, last_failed_at = now()
      WHERE id = $1
    `, [deadLetterId]);

    await logRetryAttempt(deadLetterId, adminId, 'failed', error.message);
    return { success: false, error: error.message };
  }
}
```

### 5.3 — Frontend: DLQ Dashboard

**Route:** `/admin/dead-letters`

```
┌─────────────────────────────────────────────────────────────────┐
│  Dead Letter Queue                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │    47    │ │    12    │ │    32    │ │     3    │           │
│  │  Failed  │ │Resolved  │ │Discarded │ │  Today   │           │
│  │  ■■■■■  │ │  ■■     │ │  ■■■■   │ │  ■      │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  ── By Tenant (Top 5) ──           ── By Consumer ──            │
│  Acme Golf: 12                     OrderPostingConsumer: 18     │
│  Bella Risto: 8                    InventoryMovementConsumer: 11│
│  Grand Hotel: 6                    MembershipBillingConsumer: 8 │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  [Tenant ▼] [Status ▼] [Consumer ▼] [Event Type ▼] [Date ▼]  │
│  [Batch Retry Selected]  [Batch Discard Selected]               │
├─────────────────────────────────────────────────────────────────┤
│  ☐ │ order.posted │ OrderPostingConsumer │ Acme Golf            │
│    │ Failed 3 times · Last: 2 hours ago                         │
│    │ Error: GL account mapping not found for department "Caddie"│
│    │ [View] [Retry] [Discard]                                   │
│  ──┼────────────────────────────────────────────────────────────│
│  ☐ │ inventory.adjusted │ InventoryMovementConsumer │ Bella     │
│    │ Failed 5 times · Last: 30 min ago                          │
│    │ Error: Item SKU "WINE-001" not found in location           │
│    │ [View] [Retry] [Discard]                                   │
│  ──┼────────────────────────────────────────────────────────────│
│  ☐ │ membership.billed │ MembershipBillingConsumer │ Harbor     │
│    │ Failed 1 time · Last: 5 min ago                            │
│    │ Error: Payment method expired for account #1234            │
│    │ [View] [Retry] [Discard]                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 — Frontend: DLQ Detail View

Click "View" on any dead letter → slide-over panel or modal:

```
┌─────────────────────────────────────────────────────────────┐
│  Dead Letter Detail                              [✕ Close]  │
├─────────────────────────────────────────────────────────────┤
│  Event ID:    evt_01HQ3X...                                 │
│  Event Type:  order.posted                                  │
│  Consumer:    OrderPostingConsumer                           │
│  Tenant:      Acme Golf Club                                │
│  Status:      ● Failed                                      │
│  Attempts:    3 / 3 max                                     │
│  First Fail:  Feb 22, 2026 10:30 AM                        │
│  Last Fail:   Feb 22, 2026 12:45 PM                        │
│                                                              │
│  ── Error ──                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Error: GL account mapping not found for department     │ │
│  │ "Caddie Services" at location "Main Clubhouse"         │ │
│  │                                                        │ │
│  │ Stack:                                                 │ │
│  │   at GLPostingService.findAccount (gl-posting.ts:142)  │ │
│  │   at GLPostingService.postOrder (gl-posting.ts:89)     │ │
│  │   at OrderPostingConsumer.handle (consumer.ts:34)      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ── Event Payload ──                                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ {                                                      │ │
│  │   "order_id": "ord_01HQ3X...",                        │ │
│  │   "tenant_id": "tnt_01HQ...",                         │ │
│  │   "location_id": "loc_01HQ...",                       │ │
│  │   "business_date": "2026-02-22",                      │ │
│  │   "total": 4500,                                      │ │
│  │   "lines": [...]                                      │ │
│  │ }                                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ── Retry History ──                                        │
│  #3 Failed · Feb 22 12:45 PM · by Jane Doe                 │
│     Error: GL account mapping not found...                  │
│  #2 Failed · Feb 22 11:30 AM · by system (auto-retry)      │
│     Error: GL account mapping not found...                  │
│  #1 Failed · Feb 22 10:30 AM · by system (initial)         │
│     Error: GL account mapping not found...                  │
│                                                              │
│  [Retry]  [Discard (requires reason)]                       │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `DLQDashboardPage` — stats cards + filterable list
- `DLQStatsCards` — count by status, by tenant, by consumer
- `DLQListTable` — main table with checkbox selection for batch ops
- `DLQDetailPanel` — slide-over with full detail, payload viewer, retry history
- `DLQPayloadViewer` — syntax-highlighted JSON with collapsible sections
- `DLQRetryButton` — single retry with optional notes
- `DLQDiscardDialog` — requires reason text input
- `DLQBatchRetryDialog` — confirmation showing count, processes with progress bar
- `DLQBatchDiscardDialog` — requires reason, shows count

### 5.5 — Tests

**Backend:**
- DLQ list: returns paginated, respects all filters
- DLQ stats: returns correct aggregations
- Retry success: updates status to resolved, writes retry log + audit log
- Retry failure: increments attempt count, writes retry log
- Discard: requires reason, updates status, writes audit log
- Batch retry: processes all matching, returns summary
- Batch discard: validates all IDs exist, requires reason

**Frontend:**
- Dashboard stats cards show correct counts
- Filter bar filters the list correctly
- Detail panel displays payload with syntax highlighting
- Retry button shows loading state, handles success/failure
- Discard dialog requires reason before enabling confirm
- Batch operations: checkbox selection works, batch buttons enabled only when items selected

---

## SESSION 6: Cross-Tenant User Management

### Objective
Build the global user management interface for searching, viewing, and managing users across all tenants. This is used daily by support agents to help users with login issues, permission problems, and account lockouts.

### 6.1 — Backend: User Management API

No new tables needed. These are read/write operations against existing `users`, `user_security`, `user_roles`, `role_assignments`, and `api_keys` tables.

```
GET    /api/admin/users                            — Search users across tenants
  Filters: email, name, tenant_id, status (active/inactive), is_locked, has_mfa
  Sort: name, email, last_login_at, created_at

GET    /api/admin/users/:id                        — User detail
  Returns: user profile + tenant info + roles + permissions + security status +
           last_login_at + recent audit_log entries + active impersonation sessions

POST   /api/admin/users/:id/lock                   — Lock user account
  Body: { reason: string }
  Sets: user_security.locked_until = far future date
  Writes: audit log

POST   /api/admin/users/:id/unlock                 — Unlock user account
  Clears: user_security.locked_until, resets failed_login_count
  Writes: audit log

POST   /api/admin/users/:id/force-password-reset   — Force password reset
  Sets: users.password_reset_required = true
  Writes: audit log

POST   /api/admin/users/:id/reset-mfa              — Reset MFA
  Sets: user_security.mfa_enabled = false
  Writes: audit log

POST   /api/admin/users/:id/revoke-sessions        — Revoke all active sessions
  Invalidates all JWTs for this user (implementation depends on your session store)
  Writes: audit log

GET    /api/admin/tenants/:id/api-keys             — List API keys for tenant
POST   /api/admin/tenants/:id/api-keys/:keyId/revoke — Revoke API key
  Sets: api_keys.revoked_at = now()
  Writes: audit log
```

**User detail aggregation query:**
```sql
SELECT
  u.id, u.email, u.name, u.first_name, u.last_name, u.display_name,
  u.phone, u.status, u.last_login_at, u.created_at, u.tenant_id,
  u.password_reset_required,
  t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status,
  us.mfa_enabled, us.failed_login_count, us.locked_until,
  CASE WHEN us.locked_until IS NOT NULL AND us.locked_until > now()
    THEN true ELSE false END as is_locked,
  (
    SELECT json_agg(json_build_object('role_id', r.id, 'role_name', r.name))
    FROM user_roles ur JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = u.id
  ) as roles,
  (
    SELECT json_agg(json_build_object(
      'role_id', r.id, 'role_name', r.name,
      'location_id', ra.location_id, 'location_name', l.name
    ))
    FROM role_assignments ra
    JOIN roles r ON ra.role_id = r.id
    LEFT JOIN locations l ON ra.location_id = l.id
    WHERE ra.user_id = u.id
  ) as role_assignments
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
LEFT JOIN user_security us ON us.user_id = u.id
WHERE u.id = $1;
```

### 6.2 — Frontend: Global User Search

**Route:** `/admin/users`

```
┌─────────────────────────────────────────────────────────────┐
│  Users                                                       │
├─────────────────────────────────────────────────────────────┤
│  [Search by email, name...] [Tenant ▼] [Status ▼] [🔒 ▼]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  john@acmegolf.com                                          │
│  John Smith · Acme Golf Club · Admin                        │
│  Last login: 2 hours ago · ● Active · 🔓 Unlocked          │
│  ────────────────────────────────────────────────────────── │
│  maria@bellaristo.com                                       │
│  Maria Lopez · Bella Ristorante · Manager                   │
│  Last login: 3 days ago · ● Active · 🔐 MFA Enabled        │
│  ────────────────────────────────────────────────────────── │
│  bob@harbor.com                                             │
│  Bob Wilson · Harbor Marina · Staff                          │
│  Last login: Never · ● Active · ⚠️ Password Reset Pending  │
│  ────────────────────────────────────────────────────────── │
│  sarah@grandhotel.com                                       │
│  Sarah Chen · Grand Hotel · Admin                           │
│  Last login: 1 week ago · 🔴 LOCKED · 5 failed attempts    │
│                                                              │
│  ◄ 1 2 3 ... 12 ►                                          │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 — Frontend: User Detail Panel

Slide-over panel or full page:

```
┌─────────────────────────────────────────────────────────────┐
│  User Detail                                    [✕ Close]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Sarah Chen                              🔴 LOCKED          │
│  sarah@grandhotel.com · Grand Hotel                         │
│  Created: Jan 10, 2026 · Last login: Feb 16, 2026          │
│                                                              │
│  ── Security ──                                             │
│  MFA: Enabled                                               │
│  Failed Login Attempts: 5                                   │
│  Locked Until: Feb 23, 2026 (auto-lock from failures)      │
│  Password Reset Required: No                                │
│                                                              │
│  ── Roles ──                                                │
│  • Admin (Global)                                           │
│  • Front Desk Manager (Main Lobby)                          │
│  • POS Operator (Restaurant)                                │
│                                                              │
│  ── Actions ──                                              │
│  [🔓 Unlock Account]                                        │
│  [🔑 Force Password Reset]                                  │
│  [📱 Reset MFA]                                             │
│  [🚪 Revoke All Sessions]                                   │
│  [🔍 Impersonate This User]                                │
│                                                              │
│  ── Recent Activity ──                                      │
│  Feb 16: Failed login attempt (5th)                         │
│  Feb 16: Failed login attempt (4th)                         │
│  Feb 16: Account auto-locked                                │
│  Feb 15: Updated menu item "Grilled Salmon"                 │
│  Feb 14: Processed order #1234                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `UserSearchPage` — search bar + filters + paginated results
- `UserRow` — row component with key info at a glance
- `UserDetailPanel` — slide-over with full detail + actions
- `UserSecuritySection` — MFA status, lock status, failed attempts
- `UserRolesSection` — roles with location assignments
- `UserActionsBar` — action buttons (unlock, reset password, reset MFA, revoke sessions, impersonate)
- `UnlockUserDialog` — confirmation with reason
- `ResetPasswordDialog` — confirmation warning
- `ResetMFADialog` — confirmation warning
- `RevokeSessionsDialog` — confirmation warning
- `UserActivityLog` — recent entries from `audit_log` filtered by this user

Also embed a user list as a tab on the Tenant Detail page (`TenantUsersTab`):
- Shows only users for that tenant
- Same row component, click opens detail panel
- "Impersonate" shortcut on each row

### 6.4 — Frontend: API Key Management

Embedded in Tenant Detail page as section or sub-tab:

```
┌─────────────────────────────────────────────────────────────┐
│  API Keys                                                    │
├─────────────────────────────────────────────────────────────┤
│  op_sk_abc1...  │ "Production Key"  │ ● Active │ [Revoke]  │
│  op_sk_def2...  │ "Staging Key"     │ ● Active │ [Revoke]  │
│  op_sk_ghi3...  │ "Old Key"         │ ✕ Revoked│           │
└─────────────────────────────────────────────────────────────┘
```

### 6.5 — Tests

**Backend:**
- User search: returns results across tenants, respects filters
- User detail: returns aggregated data (roles, security, tenant)
- Lock user: sets locked_until, writes audit log
- Unlock user: clears lock, resets failed_login_count, writes audit log
- Force password reset: sets flag, writes audit log
- Reset MFA: clears MFA, writes audit log
- Revoke sessions: invalidates tokens, writes audit log
- API key revoke: sets revoked_at, writes audit log

**Frontend:**
- Search works across email and name
- Filter by tenant/status/locked works
- Detail panel renders all sections
- Action buttons show confirmation dialogs
- Confirmation dialogs require confirmation before executing
- After action, UI refreshes to show updated state
- API key list renders with correct status badges

---

## COMPLETION CHECKLIST — Phase 1B

After completing Sessions 4–6, you should have:

- [ ] `tenant_feature_flags` table with flag definitions
- [ ] Module templates seeded by industry
- [ ] Module provisioning APIs (enable, disable, apply template)
- [ ] Module prerequisite validation
- [ ] Feature flag toggle API
- [ ] Tenant detail → Modules tab with all module management
- [ ] Global capability matrix view
- [ ] DLQ indexes optimized for admin queries
- [ ] `dead_letter_retry_log` table
- [ ] DLQ CRUD + retry + discard + batch operations APIs
- [ ] DLQ dashboard with stats and filterable list
- [ ] DLQ detail view with payload inspector and retry history
- [ ] Cross-tenant user search API
- [ ] User detail with security status, roles, activity
- [ ] User management actions (lock, unlock, reset password, reset MFA, revoke sessions)
- [ ] API key management per tenant
- [ ] Tenant detail → Users tab
- [ ] Comprehensive test coverage for all above

**Phase 1 is now complete.** You have the full admin spine: tenant management, RBAC, impersonation, module provisioning, DLQ management, and user management. This handles the vast majority of daily support operations.
