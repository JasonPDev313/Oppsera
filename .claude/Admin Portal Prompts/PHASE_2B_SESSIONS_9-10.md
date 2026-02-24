# OppsEra SuperAdmin Build — Phase 2B (Sessions 9–10)

## CONTEXT FOR CLAUDE

You are continuing the build of the **OppsEra Enterprise SuperAdmin Portal**. Phases 1 and 2A (Sessions 1–8) are complete.

### Tech Stack
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend**: Node.js / TypeScript modular monolith
- **Database**: PostgreSQL with RLS, ULID identifiers
- **Auth**: JWT-based, platform_admins table
- **Architecture**: Modular monolith — apps/admin imports only from `shared`, `db`, `core`

### What Already Exists (from Sessions 1–8)

**Full Phase 1 (Sessions 1–6):**
- Extended `tenants` table with rich metadata
- `tenant_onboarding_checklists`, `superadmin_support_notes`, `onboarding_step_templates`
- `impersonation_sessions` with safety rules and expiry
- `tenant_feature_flags` + `feature_flag_definitions`
- `dead_letter_retry_log`
- RBAC: 6 roles, permission matrix, permission middleware
- Admin portal shell with sidebar navigation and routing
- Tenant list/detail with tabs (overview, modules, users, onboarding, notes)
- Admin management (list, invite, role assignment)
- Impersonation (start, end, banner, history log)
- Module provisioning (enable/disable, templates, feature flags, capability matrix)
- DLQ management (dashboard, detail, retry, discard, batch operations)
- Cross-tenant user management (search, lock/unlock, reset password/MFA, revoke sessions)
- API key management per tenant

**Phase 2A (Sessions 7–8):**
- `tenant_health_snapshots` + `system_metrics_snapshots`
- Health scoring job (every 15 min) with grade factors algorithm
- System health dashboard with metrics, sparklines, alerts, tenant health grid
- Tenant health card on detail page with 7-day trend
- Financial support hub: order lookup/detail, voids/refunds log, GL issues, chargebacks, close batches, voucher lookup
- All financial views read-only

### Existing Schema Tables Referenced in This Phase

```sql
-- Platform admin audit (EXISTS)
platform_admin_audit_log (id, actor_admin_id, action, entity_type, entity_id, tenant_id, before_snapshot, after_snapshot, reason, ip_address, metadata, created_at)

-- Tenant audit (EXISTS, partitioned by month)
audit_log (id, tenant_id, location_id, actor_user_id, actor_type, action, entity_type, entity_id, changes, metadata, created_at)

-- Impersonation sessions (EXISTS, created Session 3)
impersonation_sessions (id, admin_id, tenant_id, target_user_id, reason, status, started_at, ended_at, max_duration_minutes, expires_at, ip_address, user_agent, actions_performed)

-- Searchable entities (ALL EXIST)
tenants (id, name, slug, industry, status, primary_contact_email, ...)
users (id, email, name, first_name, last_name, display_name, tenant_id, status, ...)
customers (id, tenant_id, display_name, email, phone, search_tags, ...)
orders (id, tenant_id, order_number, search_tags, status, total, business_date, ...)
locations (id, tenant_id, name, location_type, is_active, ...)
terminals (id, tenant_id, location_id, name, terminal_type, status, ...)
```

---

## SESSION 9: Audit Log Viewer

### Objective
Build comprehensive audit log viewing for both platform admin actions and tenant-level activity. This is the compliance and accountability backbone — used to answer "who did what, when, and why?" It also serves as a forensic tool during incident investigation.

### 9.1 — Database: Add Indexes for Admin Query Patterns

```sql
-- Platform admin audit log indexes for common admin portal queries
CREATE INDEX IF NOT EXISTS idx_paal_actor_created
  ON platform_admin_audit_log(actor_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paal_entity
  ON platform_admin_audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paal_tenant
  ON platform_admin_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paal_action
  ON platform_admin_audit_log(action, created_at DESC);

-- Tenant audit log indexes (these go on each partition if partitioned)
-- If partitioning by month, these would be on the parent table definition
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_type
  ON audit_log(actor_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_entity
  ON audit_log(action, entity_type, created_at DESC);
```

### 9.2 — Backend: Audit Log API

```
GET  /api/admin/audit/platform                    — Platform admin audit log
  Filters:
    actor_admin_id  — filter by who performed the action
    action          — exact match (e.g., 'impersonation.start', 'tenant.suspend')
    action_prefix   — prefix match (e.g., 'impersonation.*', 'tenant.*')
    entity_type     — e.g., 'tenant', 'user', 'entitlement', 'impersonation_session'
    entity_id       — specific entity
    tenant_id       — actions related to a specific tenant
    date_from       — timestamp
    date_to         — timestamp
    has_reason      — boolean (filter for entries that have a reason field)
  Sort: created_at DESC (default), created_at ASC
  Pagination: page, limit (default 50, max 200)
  Returns: {
    items: [{
      id, actor_admin_id, actor_admin_name, actor_admin_email,
      action, entity_type, entity_id,
      tenant_id, tenant_name,
      before_snapshot, after_snapshot,
      reason, ip_address, metadata,
      created_at
    }],
    total, page, limit
  }

GET  /api/admin/audit/platform/actions            — List distinct action types
  Returns: ['tenant.create', 'tenant.suspend', 'impersonation.start', ...]
  Used for: filter dropdown population

GET  /api/admin/audit/tenant/:tenantId            — Tenant-level audit log
  Filters:
    actor_user_id   — who performed the action
    actor_type      — 'user', 'system', 'impersonation', 'api_key'
    action          — exact or prefix match
    entity_type     — 'order', 'catalog_item', 'user', 'location', etc.
    entity_id       — specific entity
    location_id     — actions at a specific location
    date_from, date_to
  Sort: created_at DESC
  Pagination: page, limit
  Returns: {
    items: [{
      id, actor_user_id, actor_name, actor_type,
      action, entity_type, entity_id,
      location_id, location_name,
      changes, metadata,
      created_at,
      is_impersonation,
      impersonator_admin_name  // if actor_type = 'impersonation'
    }],
    total, page, limit
  }

GET  /api/admin/audit/impersonation               — Dedicated impersonation audit
  Filters: admin_id, tenant_id, target_user_id, status, date_from, date_to
  Returns: {
    items: [{
      session: { ...impersonation_session fields },
      admin: { id, name, email },
      target_user: { id, name, email },
      tenant: { id, name },
      actions_during_session: [{
        ...audit_log entries where actor_type = 'impersonation'
        AND metadata->>'impersonation_session_id' = session.id
      }]
    }],
    total, page, limit
  }

POST /api/admin/audit/export                      — Export audit log to CSV
  Body: {
    source: 'platform' | 'tenant',
    tenant_id?: string,  // required if source = 'tenant'
    filters: { ...same filters as GET endpoints },
    date_from: string,   // required for export
    date_to: string,     // required for export, max 90-day range
  }
  Returns: { download_url: string, record_count: number }
  Implementation:
    1. Validate date range (max 90 days)
    2. Stream query results to CSV file
    3. Upload to temporary storage or serve directly
    4. Return download URL (valid for 1 hour)
  Permission: requires 'audit.export' permission
```

**Impersonation actions query:**
```sql
-- Get all tenant audit_log entries performed during an impersonation session
SELECT al.*, u.name as actor_name
FROM audit_log al
LEFT JOIN users u ON al.actor_user_id = u.id
WHERE al.actor_type = 'impersonation'
  AND al.metadata->>'impersonation_session_id' = $1
ORDER BY al.created_at;
```

### 9.3 — Frontend: Platform Admin Audit Log

**Route:** `/admin/audit`

Sub-navigation: `[Platform Actions] [Tenant Activity] [Impersonation Log] [Export]`

#### Platform Actions Tab

```
┌──────────────────────────────────────────────────────────────────┐
│  Platform Admin Audit Log                                         │
├──────────────────────────────────────────────────────────────────┤
│  [Admin ▼] [Action ▼] [Entity Type ▼] [Tenant ▼] [Date Range] │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Jane Doe · tenant.suspend                    Feb 22, 3:15 PM   │
│  Entity: Tenant "Harbor Marina"                                   │
│  Reason: "Client requested temporary suspension during           │
│           renovation. Reactivate March 15."                       │
│  Changes: status: active → suspended                             │
│  IP: 192.168.1.45                                                 │
│  ──────────────────────────────────────────────────────────────  │
│  Bob Chen · impersonation.start               Feb 22, 2:15 PM   │
│  Entity: User "Maria Lopez" in Bella Ristorante                 │
│  Reason: "Verifying menu configuration fix"                      │
│  IP: 192.168.1.52                                                 │
│  ──────────────────────────────────────────────────────────────  │
│  Jane Doe · entitlement.update                Feb 22, 1:00 PM   │
│  Entity: Entitlement "fnb" for Acme Golf                         │
│  Changes: access_mode: off → full                                │
│  Reason: "Client upgrading to include F&B module"                │
│  ──────────────────────────────────────────────────────────────  │
│  System · health.grade_change                  Feb 22, 12:45 PM  │
│  Entity: Tenant "Grand Hotel"                                     │
│  Changes: health_grade: A → C                                    │
│  Metadata: { factors: ["dlq_elevated", "error_elevated"] }       │
│                                                                   │
│  ◄ 1 2 3 ... 24 ►                                               │
└──────────────────────────────────────────────────────────────────┘
```

#### Snapshot Diff Viewer

When a log entry has `before_snapshot` and `after_snapshot`, clicking it expands a diff view:

```
┌────────────────────────────────────────────────┐
│  Changes                                        │
│  ┌──────────────┬──────────┬──────────┐        │
│  │ Field        │ Before   │ After    │        │
│  ├──────────────┼──────────┼──────────┤        │
│  │ status       │ active   │ suspended│        │
│  │ suspended_at │ null     │ 2026-... │        │
│  │ suspended_   │ null     │ "Client  │        │
│  │   reason     │          │ request" │        │
│  └──────────────┴──────────┴──────────┘        │
└────────────────────────────────────────────────┘
```

### 9.4 — Frontend: Tenant Activity Log

**Route:** `/admin/audit/tenant/:tenantId` (also embedded as "Audit Log" tab on Tenant Detail page)

```
┌──────────────────────────────────────────────────────────────────┐
│  Tenant Activity: Acme Golf Club                                  │
├──────────────────────────────────────────────────────────────────┤
│  [Actor ▼] [Actor Type ▼] [Action ▼] [Entity ▼] [Location ▼]  │
│  [Date Range]                                                     │
│  Quick Filters: [Financial ⚡] [Config Changes 🔧] [User Mgmt 👤]│
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  John Smith (user) · order.void             Feb 22, 11:30 AM    │
│  Entity: Order #10235 at Main Clubhouse                          │
│  Changes: { status: "open" → "voided", void_reason: "Duplicate" }│
│  ──────────────────────────────────────────────────────────────  │
│  Jane Doe (impersonation) · catalog.update  Feb 22, 10:45 AM    │
│  🔍 Impersonated by: jane@oppsera.com                           │
│  Entity: Catalog Item "Green Fee Weekend"                         │
│  Changes: { price: 5500 → 6000 }                                │
│  ──────────────────────────────────────────────────────────────  │
│  system · gl.post                           Feb 22, 12:01 AM    │
│  Entity: Journal Entry JE-001234                                  │
│  Metadata: { source: "batch_close", batch_id: "..." }           │
│                                                                   │
│  ◄ 1 2 3 ... ►                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Quick filter presets:**
- **Financial**: actions matching `order.void`, `order.refund`, `tender.reverse`, `gl.*`, `close_batch.*`
- **Config Changes**: actions matching `*.update`, `*.create`, `*.delete` on entity types like `catalog_item`, `tax_rate`, `location`, `terminal`, `role`
- **User Management**: entity_type = `user` or actions matching `user.*`

### 9.5 — Frontend: Impersonation Audit

**Route:** `/admin/audit/impersonation`

```
┌──────────────────────────────────────────────────────────────────┐
│  Impersonation Audit                                              │
├──────────────────────────────────────────────────────────────────┤
│  [Admin ▼] [Tenant ▼] [Status ▼] [Date Range]                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Jane Doe → John Smith (Acme Golf Club)                   │    │
│  │ Feb 22, 2026 · 10:30 AM – 10:47 AM (17 min)            │    │
│  │ Status: Ended · 4 actions performed                      │    │
│  │ Reason: "Investigating tee sheet loading issue"          │    │
│  │                                                          │    │
│  │ Actions during session:                                  │    │
│  │  10:32 AM  Viewed tee sheet for Feb 23                  │    │
│  │  10:35 AM  Viewed booking #4567                         │    │
│  │  10:38 AM  Updated tee sheet interval config            │    │
│  │  10:40 AM  Viewed tee sheet for Feb 23 (verify fix)     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Bob Chen → Maria Lopez (Bella Ristorante)                │    │
│  │ Feb 22, 2026 · 2:15 PM – 2:28 PM (13 min)              │    │
│  │ Status: Ended · 2 actions performed                      │    │
│  │ Reason: "Verifying menu configuration fix"               │    │
│  │                                                          │    │
│  │ Actions during session:                                  │    │
│  │  2:17 PM  Viewed catalog item "Grilled Salmon"          │    │
│  │  2:20 PM  Updated catalog item "Grilled Salmon" price   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 9.6 — Frontend: Export

**Route:** `/admin/audit/export`

```
┌──────────────────────────────────────────────────┐
│  Export Audit Log                                 │
│                                                   │
│  Source:  (●) Platform Actions  (○) Tenant       │
│                                                   │
│  Tenant:  [All Tenants ▼]  (if Tenant selected)  │
│                                                   │
│  Date Range:                                      │
│  From: [Feb 1, 2026]  To: [Feb 22, 2026]        │
│  ⓘ Maximum range: 90 days                        │
│                                                   │
│  Filters (optional):                             │
│  Admin:      [Any ▼]                              │
│  Action:     [Any ▼]                              │
│  Entity Type:[Any ▼]                              │
│                                                   │
│  [Export to CSV]                                  │
│                                                   │
│  ── Recent Exports ──                            │
│  Feb 20: Platform actions Jan 1–31 (1,245 rows)  │
│  Feb 18: Acme Golf audit Feb 1–18 (456 rows)    │
└──────────────────────────────────────────────────┘
```

### 9.7 — Components Summary

- `AuditHubPage` — container with sub-navigation tabs
- `PlatformAuditLogPage` — platform admin actions with filters
- `TenantAuditLogPage` — tenant activity with quick filter presets
- `ImpersonationAuditPage` — impersonation sessions with nested actions
- `AuditExportPage` — export form with date range validation
- `AuditLogEntry` — reusable row component with action icon, actor, entity, changes
- `SnapshotDiffViewer` — side-by-side before/after comparison table
- `AuditQuickFilters` — preset filter buttons (Financial, Config, User Mgmt)
- `ImpersonationSessionCard` — expandable card showing session + nested actions
- `AuditLogFilters` — reusable filter bar for all audit views
- `ChangesBadge` — compact display of changed fields count

Also integrate into existing pages:
- **Tenant Detail → Audit Log tab**: embed `TenantAuditLogPage` scoped to tenant
- **Admin Detail → Activity tab**: embed `PlatformAuditLogPage` filtered by admin

### 9.8 — Tests

**Backend:**
- Platform audit: returns paginated, respects all filters
- Platform audit: action_prefix filter matches correctly (e.g., 'impersonation.*')
- Tenant audit: scoped to correct tenant, respects partition boundaries
- Tenant audit: impersonation entries include impersonator_admin_name
- Impersonation audit: nests session actions correctly
- Impersonation audit: actions_during_session count matches session.actions_performed
- Export: validates date range (max 90 days)
- Export: generates valid CSV with all columns
- Export: requires audit.export permission
- Distinct actions endpoint: returns correct list from actual data

**Frontend:**
- Platform audit log renders entries with correct formatting
- Snapshot diff viewer shows before/after for changed fields
- Quick filter presets apply correct filter combination
- Impersonation audit shows expandable session cards with nested actions
- Export form validates date range, disables button for >90 days
- Pagination works across all audit views
- Filters persist when switching between tabs

---

## SESSION 10: Global Search + Command Palette

### Objective
Build the unified global search system and command palette (⌘K). This is the fastest way for an admin to navigate the portal — type a name, email, order number, or tenant and jump directly to the relevant detail page. V1 uses simple database queries (ILIKE), not Elasticsearch.

### 10.1 — Backend: Unified Search API

```
GET  /api/admin/search                            — Global search across all entities
  Query params:
    q         — search query string (min 2 characters)
    types     — optional comma-separated entity types to search
               (tenant, user, customer, order, location, terminal)
    tenant_id — optional, scope search to one tenant
    limit     — max results per type (default 5, max 20)

  Returns: {
    tenants: [{ id, name, slug, industry, status, match_field }],
    users: [{ id, name, email, tenant_id, tenant_name, status, match_field }],
    customers: [{ id, display_name, email, tenant_id, tenant_name, match_field }],
    orders: [{ id, order_number, tenant_id, tenant_name, total, status, business_date, match_field }],
    locations: [{ id, name, tenant_id, tenant_name, location_type, match_field }],
    terminals: [{ id, name, tenant_id, tenant_name, location_name, status, match_field }],
    total_results: number,
    query: string,
    search_time_ms: number,
  }
```

**Search implementation:**
```typescript
async function globalSearch(query: string, options: SearchOptions) {
  const q = query.trim();
  if (q.length < 2) return emptyResults();

  const likePattern = `%${q}%`;
  const limit = options.limit || 5;
  const tenantFilter = options.tenant_id ? 'AND t.id = $3' : '';

  // Run all searches in parallel
  const [tenants, users, customers, orders, locations, terminals] = await Promise.all([
    // Only search tenants if not scoped to a specific tenant
    !options.tenant_id ? searchTenants(q, likePattern, limit) : [],

    searchUsers(q, likePattern, limit, options.tenant_id),
    searchCustomers(q, likePattern, limit, options.tenant_id),
    searchOrders(q, likePattern, limit, options.tenant_id),
    searchLocations(q, likePattern, limit, options.tenant_id),
    searchTerminals(q, likePattern, limit, options.tenant_id),
  ]);

  return { tenants, users, customers, orders, locations, terminals };
}
```

**Individual search queries:**

```sql
-- Tenants
SELECT id, name, slug, industry, status,
  CASE
    WHEN name ILIKE $1 THEN 'name'
    WHEN slug ILIKE $1 THEN 'slug'
    WHEN primary_contact_email ILIKE $1 THEN 'contact_email'
  END as match_field
FROM tenants
WHERE (name ILIKE $1 OR slug ILIKE $1 OR primary_contact_email ILIKE $1)
ORDER BY
  CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,  -- Exact prefix first
  name
LIMIT $3;
-- $1 = '%query%', $2 = 'query%' (prefix match), $3 = limit

-- Users
SELECT u.id, u.name, u.email, u.tenant_id, t.name as tenant_name, u.status,
  CASE
    WHEN u.email ILIKE $1 THEN 'email'
    WHEN u.name ILIKE $1 THEN 'name'
    WHEN u.display_name ILIKE $1 THEN 'display_name'
  END as match_field
FROM users u
JOIN tenants t ON u.tenant_id = t.id
WHERE (u.email ILIKE $1 OR u.name ILIKE $1 OR u.display_name ILIKE $1)
ORDER BY
  CASE WHEN u.email ILIKE $2 THEN 0 ELSE 1 END,
  u.name
LIMIT $3;

-- Customers
SELECT c.id, c.display_name, c.email, c.tenant_id, t.name as tenant_name,
  CASE
    WHEN c.email ILIKE $1 THEN 'email'
    WHEN c.display_name ILIKE $1 THEN 'name'
    WHEN c.phone ILIKE $1 THEN 'phone'
    WHEN c.search_tags::text ILIKE $1 THEN 'tags'
  END as match_field
FROM customers c
JOIN tenants t ON c.tenant_id = t.id
WHERE (c.email ILIKE $1 OR c.display_name ILIKE $1 OR c.phone ILIKE $1 OR c.search_tags::text ILIKE $1)
LIMIT $3;

-- Orders (search by order_number or search_tags)
SELECT o.id, o.order_number, o.tenant_id, t.name as tenant_name,
       o.total, o.status, o.business_date,
  CASE
    WHEN o.order_number::text ILIKE $1 THEN 'order_number'
    WHEN o.search_tags::text ILIKE $1 THEN 'tags'
  END as match_field
FROM orders o
JOIN tenants t ON o.tenant_id = t.id
WHERE (o.order_number::text ILIKE $1 OR o.search_tags::text ILIKE $1)
ORDER BY o.created_at DESC
LIMIT $3;

-- Locations
SELECT l.id, l.name, l.tenant_id, t.name as tenant_name, l.location_type, l.is_active,
  'name' as match_field
FROM locations l
JOIN tenants t ON l.tenant_id = t.id
WHERE l.name ILIKE $1
LIMIT $3;

-- Terminals
SELECT tm.id, tm.name, tm.tenant_id, t.name as tenant_name,
       l.name as location_name, tm.status,
  'name' as match_field
FROM terminals tm
JOIN tenants t ON tm.tenant_id = t.id
LEFT JOIN locations l ON tm.location_id = l.id
WHERE tm.name ILIKE $1
LIMIT $3;
```

**Performance considerations for V1:**
- Each query uses ILIKE with leading wildcard — acceptable at <1,000 tenants scale
- Parallel execution keeps total response time under 200ms for typical queries
- For future scale: add `pg_trgm` GIN indexes or move to dedicated search (Elasticsearch, Typesense)

### 10.2 — Backend: Recent Searches + Quick Navigation

```
GET  /api/admin/search/recent                     — Get recent searches for current admin
POST /api/admin/search/recent                     — Save a search/navigation event
  Body: { query?: string, entity_type: string, entity_id: string, entity_label: string }

GET  /api/admin/search/quick-nav                  — Quick navigation targets
  Returns: {
    recent_tenants: [{ id, name, slug }],          // last 5 tenants this admin visited
    recent_users: [{ id, name, email, tenant_name }], // last 5 users
    pinned: [{ entity_type, entity_id, label }],   // admin's pinned items
  }
```

**Storage:** Use a simple `admin_recent_searches` table or store in `platform_admins.metadata` jsonb field:

```sql
CREATE TABLE public.admin_recent_searches (
  id text NOT NULL DEFAULT gen_ulid(),
  admin_id text NOT NULL,
  search_query text,
  entity_type text,
  entity_id text,
  entity_label text NOT NULL,
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_recent_searches_pkey PRIMARY KEY (id),
  CONSTRAINT admin_recent_searches_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES public.platform_admins(id)
);

CREATE INDEX idx_admin_recent_searches_admin
  ON admin_recent_searches(admin_id, searched_at DESC);

-- Keep only last 50 per admin (cleanup in application layer)
```

### 10.3 — Frontend: Command Palette (⌘K)

This is the primary navigation tool. It should feel as fast and responsive as VS Code's command palette or Spotlight.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍 Search tenants, users, orders...                ⌘K      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  (empty state — show recent + quick nav)                     │
│                                                               │
│  ── Recent ──                                                │
│  🏢 Acme Golf Club                                 tenant    │
│  👤 john@acmegolf.com                              user      │
│  📋 Order #10234                                   order     │
│                                                               │
│  ── Quick Actions ──                                         │
│  🏠 Go to Dashboard                                         │
│  🏢 Go to Tenants                                           │
│  💀 Go to Dead Letters                                      │
│  ❤️ Go to Health Dashboard                                  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

After typing a query:

```
┌──────────────────────────────────────────────────────────────┐
│  🔍 acme                                            ⌘K      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ── Tenants ──                                               │
│  🏢 Acme Golf Club · golf · active              → detail    │
│                                                               │
│  ── Users ──                                                 │
│  👤 John Smith · john@acmegolf.com · Acme Golf   → detail   │
│  👤 Sarah Acme · sarah@acmegolf.com · Acme Golf  → detail   │
│                                                               │
│  ── Customers ──                                             │
│  👥 Robert Acmes · robert@gmail.com · Acme Golf  → detail   │
│                                                               │
│  ── Locations ──                                             │
│  📍 Acme Main Clubhouse · Acme Golf Club          → detail   │
│  📍 Acme Pro Shop · Acme Golf Club                → detail   │
│                                                               │
│  ↵ to select · ↑↓ to navigate · esc to close               │
└──────────────────────────────────────────────────────────────┘
```

**Behavior:**
1. Open with ⌘K (or Ctrl+K) from anywhere in the admin portal
2. Empty state shows recent searches and quick navigation links
3. As user types, debounce 200ms then fire search request
4. Results grouped by entity type with icons
5. Arrow keys navigate through results
6. Enter navigates to the selected result's detail page
7. Escape closes the palette
8. Clicking a result navigates and closes
9. Search and result selection are logged to `admin_recent_searches`

**Components:**
- `CommandPalette` — modal overlay with search input + results
- `CommandPaletteProvider` — context provider that listens for ⌘K globally
- `SearchResultGroup` — section for each entity type
- `SearchResultItem` — single result row with icon, name, context, match highlight
- `RecentSearchesList` — recent items when palette is empty
- `QuickActionsList` — static navigation shortcuts
- `SearchHighlight` — utility to highlight matched text in results

### 10.4 — Frontend: Dedicated Search Page

For more complex searches, provide a full-page search experience:

**Route:** `/admin/search`

```
┌──────────────────────────────────────────────────────────────────┐
│  Search                                                           │
├──────────────────────────────────────────────────────────────────┤
│  [🔍 Search across all entities...                    ]          │
│                                                                   │
│  Scope: [All ▼]  [Tenant: Any ▼]                                │
│                                                                   │
│  ── Results for "harbor" ──                      47 results      │
│                                                                   │
│  Tenants (1)                                                     │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ 🏢 Harbor Marina · marina · ● Active                    │     │
│  │    Contact: mike@harbormarina.com                        │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Users (3)                                                       │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ 👤 Mike Harbor · mike@harbormarina.com · Harbor Marina   │     │
│  │ 👤 Lisa Harbor · lisa@harbormarina.com · Harbor Marina   │     │
│  │ 👤 Tom Harbeck · tom@harbeck.com · Valley Retail        │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Customers (12)                                       [Show all] │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ 👥 James Harborfield · Harbor Marina                     │     │
│  │ 👥 Nancy Harbison · Harbor Marina                        │     │
│  │ 👥 Dave Harbor · Acme Golf Club                          │     │
│  │ 👥 Rebecca Harbeck · Valley Retail                       │     │
│  │ 👥 ... and 8 more                                        │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Orders (31)                                          [Show all] │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ 📋 #5521 · Harbor Marina · $89.00 · Feb 22 · Closed    │     │
│  │ 📋 #5520 · Harbor Marina · $234.00 · Feb 22 · Closed   │     │
│  │ 📋 #5519 · Harbor Marina · $45.00 · Feb 21 · Voided    │     │
│  │ 📋 ... and 28 more                                      │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Components:**
- `SearchPage` — full-page search with scope filters
- `SearchResultsPanel` — grouped results with "Show all" expansion
- `EntitySearchResultCard` — different layouts for each entity type
- Uses same API as command palette but with higher limits

### 10.5 — Frontend: Integration with Existing Pages

Add search triggers throughout the portal:

1. **Sidebar**: "Search (⌘K)" item in navigation — opens command palette
2. **Tenant Detail → Users tab**: search input filters users within the tenant
3. **Finance → Order Lookup**: search input uses the orders search
4. **Admin Header**: small search icon that opens command palette
5. **All list pages**: connect filter search inputs to the search API when appropriate

### 10.6 — Tests

**Backend:**
- Search returns results across all entity types
- Search respects tenant_id scoping
- Search handles special characters safely (SQL injection prevention)
- Search returns match_field indicating which field matched
- Search respects limit per type
- Search returns empty results for queries under 2 characters
- Recent searches: stores correctly, returns in recency order, caps at 50 per admin
- Quick nav: returns correct recent tenants and users

**Frontend:**
- Command palette opens on ⌘K and Ctrl+K
- Command palette closes on Escape
- Search debounces at 200ms
- Results grouped by entity type with correct icons
- Arrow keys navigate through results
- Enter navigates to correct detail page
- Recent searches display when palette is empty
- Match text is highlighted in results
- Full search page renders with scope filters
- "Show all" expands truncated result groups
- Search input handles rapid typing without race conditions (latest query wins)

---

## COMPLETION CHECKLIST — Phase 2B

After completing Sessions 9–10, you should have:

- [ ] Optimized indexes for audit log query patterns
- [ ] Platform admin audit log viewer with all filters
- [ ] Snapshot diff viewer (before/after comparison)
- [ ] Tenant activity log viewer with quick filter presets
- [ ] Impersonation audit with nested actions per session
- [ ] Audit log CSV export with date range validation
- [ ] Audit log tab integrated into Tenant Detail page
- [ ] `admin_recent_searches` table
- [ ] Unified search API querying across 6 entity types
- [ ] Recent searches tracking
- [ ] Command palette (⌘K) with keyboard navigation
- [ ] Full-page search with scope filters
- [ ] Search integrated into sidebar and header
- [ ] Comprehensive test coverage for all above

**Phase 2 is complete.** The admin portal now has full observability: health monitoring, financial investigation, audit compliance, and fast cross-entity search. Support agents can diagnose any issue and prove exactly what happened.
