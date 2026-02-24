# OppsEra SuperAdmin Portal — Phase 3: Sessions 11–14

## Intelligence + Polish

> **How to use**: Copy-paste each session into Claude as a standalone prompt. Complete sessions in order (11 → 12 → 13 → 14). Each session produces working code with tests.
>
> **Important**: Adjust migration numbers based on your current latest migration. These use `XXXX` placeholders — replace with the next sequential number.

---

## Pre-Session Context Block

> **Paste this context block at the START of every session prompt.** It gives Claude the architecture awareness it needs.

````
CONTEXT: I am building the SuperAdmin portal for OppsEra, a multi-tenant SaaS ERP.

Tech Stack:
- Monorepo: Turborepo + pnpm 9
- Frontend: Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4
- Validation: Zod
- Database: Postgres 16 with RLS
- ORM: Drizzle (NOT Prisma)
- DB driver: postgres (postgres.js, NOT pg)
- Auth: Platform admins use JWT (HS256, 8h TTL) + HttpOnly cookie, bcrypt passwords
- Icons: lucide-react
- Testing: Vitest
- API: REST, JSON, camelCase keys
- IDs: ULIDs everywhere

Monorepo structure:
- apps/admin/ — SuperAdmin portal (Next.js 15 App Router)
- packages/db/ — Drizzle schema, migrations, client
- packages/core/ — auth, RBAC, events, audit, entitlements
- packages/shared/ — types, Zod schemas, utils
- packages/modules/* — domain modules (catalog, orders, payments, etc.)

Admin app structure:
- apps/admin/src/app/(admin)/ — pages (Next.js App Router)
- apps/admin/src/app/api/v1/ — API routes
- apps/admin/src/components/ — React components
- apps/admin/src/lib/ — server-side libs (queries, commands, audit)
- apps/admin/src/hooks/ — React hooks

Existing admin infrastructure:
- withAdminAuth(handler, minRole) — legacy auth middleware
- withAdminPermission(handler, { module, action }) — granular RBAC middleware
- auditAdminAction() — logs admin actions with before/after snapshots
- buildAdminCtx(session, tenantId) — creates synthetic RequestContext for calling core commands
- AdminSidebar component exists
- PermissionsProvider + PermissionGate components exist (from Session 2)
- can(module, action) hook for checking permissions in UI

Event system:
- publishWithOutbox(ctx, async (tx) => { ... }) — transactional outbox pattern
- Consumers track (event_id, consumer_name) in processed_events table
- event_dead_letters table for failed events
- Event payloads are self-contained (consumers never query other modules)

Dark mode pattern:
- Dark mode uses inverted gray scale in globals.css
- Use `bg-surface` for theme-aware backgrounds, NEVER `bg-white` or `bg-gray-900 text-white`
- Opacity-based colors: `hover:bg-gray-200/50`, `border-red-500/40`
- `bg-indigo-600 text-white` for primary buttons

Existing rate limiter:
- packages/core/src/security/rate-limiter.ts — in-memory sliding window
- Used on auth endpoints, returns 429 with X-RateLimit-Remaining and X-RateLimit-Reset headers

Test pattern: Vitest, vi.hoisted() mocks, vi.mock(), colocated __tests__/*.test.ts

WHAT HAS BEEN BUILT (Sessions 1–10):

Phase 1 (Core Spine):
- Session 1: Tenant enrichment (industry, onboarding_status, health_score on tenants), tenant_onboarding_checklists, superadmin_support_notes tables. Tenant list page with filters/search/pagination. Tenant detail page with tabs (Overview, Modules, Notes, Activity). Support notes CRUD. TenantStatusBadge, IndustryBadge, HealthScoreGauge, ConfirmationModal, FilterBar components.
- Session 2: RBAC reconciliation — 6 canonical roles (super_admin, platform_engineer, implementation_specialist, support_agent, finance_support, viewer) with seeded permissions. Admin list/detail/invite pages. PermissionsProvider, PermissionGate, useMyPermissions.
- Session 3: Impersonation system — impersonation_sessions table. Impersonate button on user detail, persistent banner, auto-expiry, immutable audit logging. Safety controls (can't impersonate admins, can't do destructive financial actions).
- Session 4: Module provisioning — tenant_feature_flags table. Capability matrix, module toggle UI, industry templates, feature flags panel.
- Session 5: DLQ management — DLQ dashboard with counts, filterable list, detail view with JSON payload inspection, retry/discard/resolve actions, bulk operations.
- Session 6: Cross-tenant user management — global user search, user detail (roles, security, activity), lock/unlock, force password reset, revoke sessions, API key management.

Phase 2 (Observability + Financial Support):
- Session 7: Health dashboard — tenant_health_snapshots table (populated by scheduled job every 15min). Global health grid, system-wide metrics, alert feed, background jobs status.
- Session 8: Financial support views — read-only order lookup, payment investigation (tender → order → GL chain), void/refund log, GL posting errors, chargeback tracker.
- Session 9: Audit log viewer — SuperAdmin audit log, tenant-scoped audit log, financial audit presets, impersonation audit tab, CSV export.
- Session 10: Global search — unified search endpoint (ILIKE), Cmd+K command palette, results grouped by entity type, recent searches.
````

---

## SESSION 11: Support Timeline View

**Paste the context block above, then paste this entire session below it.**

---

### Prompt

````
SESSION 11: Support Timeline View

This is Session 11 — the first session of Phase 3 (Intelligence + Polish). Build the unified timeline that gives support staff a "single pane of glass" view of everything that has happened to a tenant.

## 1. DATABASE MIGRATION

Create migration: packages/db/drizzle/migrations/XXXX_tenant_timeline_events.sql

(Replace XXXX with your next sequential migration number.)

```sql
CREATE TABLE tenant_timeline_events (
  id VARCHAR(26) PRIMARY KEY,
  tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id),
  event_type VARCHAR(60) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  source_module VARCHAR(60),
  source_entity_type VARCHAR(60),
  source_entity_id VARCHAR(26),
  actor_id VARCHAR(26),
  actor_type VARCHAR(30),
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query pattern: tenant timeline feed, newest first, filterable
CREATE INDEX idx_timeline_tenant_occurred ON tenant_timeline_events (tenant_id, occurred_at DESC);
CREATE INDEX idx_timeline_tenant_type ON tenant_timeline_events (tenant_id, event_type);
CREATE INDEX idx_timeline_tenant_severity ON tenant_timeline_events (tenant_id, severity);
CREATE INDEX idx_timeline_source ON tenant_timeline_events (source_entity_type, source_entity_id);
```

### Event Type Taxonomy

Define these as a shared constant (e.g., `apps/admin/src/lib/timeline-constants.ts`):

```typescript
export const TIMELINE_EVENT_TYPES = {
  // Tenant lifecycle
  TENANT_CREATED: 'tenant.created',
  TENANT_ACTIVATED: 'tenant.activated',
  TENANT_SUSPENDED: 'tenant.suspended',
  TENANT_REACTIVATED: 'tenant.reactivated',
  TENANT_UPDATED: 'tenant.updated',

  // Module / entitlements
  MODULE_ENABLED: 'module.enabled',
  MODULE_DISABLED: 'module.disabled',
  FEATURE_FLAG_CHANGED: 'feature_flag.changed',

  // User management
  USER_CREATED: 'user.created',
  USER_LOCKED: 'user.locked',
  USER_UNLOCKED: 'user.unlocked',
  USER_PASSWORD_RESET: 'user.password_reset',

  // Admin actions
  IMPERSONATION_STARTED: 'impersonation.started',
  IMPERSONATION_ENDED: 'impersonation.ended',
  SUPPORT_NOTE_ADDED: 'support_note.added',
  ADMIN_ACTION: 'admin.action',

  // Errors / DLQ
  DLQ_EVENT_CREATED: 'dlq.event_created',
  DLQ_EVENT_RESOLVED: 'dlq.event_resolved',
  ERROR_SPIKE: 'error.spike',

  // Financial events
  ORDER_VOIDED: 'order.voided',
  REFUND_ISSUED: 'refund.issued',
  CHARGEBACK_RECEIVED: 'chargeback.received',
  GL_POSTING_ERROR: 'gl.posting_error',
  CLOSE_BATCH_COMPLETED: 'close_batch.completed',

  // Health
  HEALTH_GRADE_CHANGED: 'health.grade_changed',

  // Onboarding
  ONBOARDING_STEP_COMPLETED: 'onboarding.step_completed',
  ONBOARDING_COMPLETED: 'onboarding.completed',
} as const;

export type TimelineEventType = typeof TIMELINE_EVENT_TYPES[keyof typeof TIMELINE_EVENT_TYPES];

export const TIMELINE_SEVERITIES = ['info', 'warning', 'error', 'critical', 'success'] as const;
export type TimelineSeverity = typeof TIMELINE_SEVERITIES[number];

// For UI grouping in filter dropdowns
export const TIMELINE_EVENT_CATEGORIES = {
  'Tenant Lifecycle': ['tenant.created', 'tenant.activated', 'tenant.suspended', 'tenant.reactivated', 'tenant.updated'],
  'Modules & Config': ['module.enabled', 'module.disabled', 'feature_flag.changed'],
  'Users': ['user.created', 'user.locked', 'user.unlocked', 'user.password_reset'],
  'Admin Actions': ['impersonation.started', 'impersonation.ended', 'support_note.added', 'admin.action'],
  'Errors & DLQ': ['dlq.event_created', 'dlq.event_resolved', 'error.spike'],
  'Financial': ['order.voided', 'refund.issued', 'chargeback.received', 'gl.posting_error', 'close_batch.completed'],
  'Health & Onboarding': ['health.grade_changed', 'onboarding.step_completed', 'onboarding.completed'],
} as const;
```

### Severity Mapping

```typescript
export const SEVERITY_CONFIG: Record<TimelineSeverity, { color: string; icon: string; bgClass: string; textClass: string }> = {
  info:     { color: '#6B7280', icon: 'Info',          bgClass: 'bg-gray-100/60',    textClass: 'text-gray-600' },
  success:  { color: '#059669', icon: 'CheckCircle2',  bgClass: 'bg-emerald-100/60', textClass: 'text-emerald-700' },
  warning:  { color: '#D97706', icon: 'AlertTriangle', bgClass: 'bg-amber-100/60',   textClass: 'text-amber-700' },
  error:    { color: '#DC2626', icon: 'XCircle',       bgClass: 'bg-red-100/60',     textClass: 'text-red-700' },
  critical: { color: '#991B1B', icon: 'AlertOctagon',  bgClass: 'bg-red-200/60',     textClass: 'text-red-900' },
};
```

## 2. DRIZZLE SCHEMA

Add to packages/db/src/schema/ (new file `timeline.ts` or add to `platform.ts`):

```typescript
export const tenantTimelineEvents = pgTable('tenant_timeline_events', {
  id: varchar('id', { length: 26 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 26 }).notNull().references(() => tenants.id),
  eventType: varchar('event_type', { length: 60 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  severity: varchar('severity', { length: 20 }).notNull().default('info'),
  sourceModule: varchar('source_module', { length: 60 }),
  sourceEntityType: varchar('source_entity_type', { length: 60 }),
  sourceEntityId: varchar('source_entity_id', { length: 26 }),
  actorId: varchar('actor_id', { length: 26 }),
  actorType: varchar('actor_type', { length: 30 }),
  metadata: jsonb('metadata').default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Export from the schema barrel file.

## 3. BACKEND — Timeline Event Writer

Create apps/admin/src/lib/timeline-writer.ts:

```typescript
interface WriteTimelineEventInput {
  tenantId: string;
  eventType: TimelineEventType;
  title: string;
  description?: string;
  severity: TimelineSeverity;
  sourceModule?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  actorId?: string;
  actorType?: 'admin' | 'system' | 'user' | 'impersonation';
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export async function writeTimelineEvent(input: WriteTimelineEventInput): Promise<void> { ... }
export async function writeTimelineEvents(inputs: WriteTimelineEventInput[]): Promise<void> { ... }
```

- Uses direct db.insert (not publishWithOutbox — timeline is a read model, not a domain event)
- Generates ULID for id
- Fires and forgets (catch and log errors, never throw — timeline writes should not break primary operations)

## 4. BACKEND — Retroactive Timeline Hydration

Create apps/admin/src/lib/timeline-hydrator.ts:

A utility that can be called once (or on-demand per tenant) to populate timeline events from existing data sources. This runs as a script or on-demand admin API call, NOT on every request.

Sources to hydrate from:
1. **platform_admin_audit_log** — admin actions (tenant updates, suspensions, module changes, impersonations)
2. **superadmin_support_notes** — support notes added
3. **event_dead_letters** — DLQ events for the tenant
4. **tenant_health_snapshots** — health grade changes (compare consecutive snapshots)
5. **entitlement_change_log** — module enable/disable events

```typescript
export async function hydrateTenantTimeline(tenantId: string): Promise<{ eventsCreated: number }> { ... }
export async function hydrateAllTenantTimelines(): Promise<{ tenantsProcessed: number; totalEvents: number }> { ... }
```

- Uses INSERT ... ON CONFLICT DO NOTHING keyed on (source_entity_type, source_entity_id) to prevent duplicate hydration
- Processes in batches of 100 to avoid memory issues
- Add a unique index to support this: `CREATE UNIQUE INDEX idx_timeline_source_unique ON tenant_timeline_events (source_entity_type, source_entity_id) WHERE source_entity_id IS NOT NULL;` (add to migration)

## 5. BACKEND — Inline Timeline Writes

Integrate timeline writes into existing admin actions. Update these files to call writeTimelineEvent() AFTER the primary operation succeeds:

1. **Tenant suspend/reactivate** (from Session 1 routes) → write TENANT_SUSPENDED / TENANT_REACTIVATED
2. **Tenant update** → write TENANT_UPDATED with changed fields in metadata
3. **Support note creation** → write SUPPORT_NOTE_ADDED
4. **Impersonation start/end** (from Session 3) → write IMPERSONATION_STARTED / IMPERSONATION_ENDED
5. **Module enable/disable** (from Session 4) → write MODULE_ENABLED / MODULE_DISABLED
6. **DLQ retry/discard/resolve** (from Session 5) → write DLQ_EVENT_RESOLVED
7. **User lock/unlock** (from Session 6) → write USER_LOCKED / USER_UNLOCKED
8. **Health grade changes** (from Session 7 health job) → write HEALTH_GRADE_CHANGED when grade differs from previous

NOTE: These writes are fire-and-forget calls AFTER the main operation. Never inside publishWithOutbox transactions. Never let timeline failures break the primary action. Pattern:

```typescript
// In the route handler, AFTER the primary operation:
void writeTimelineEvent({
  tenantId,
  eventType: TIMELINE_EVENT_TYPES.TENANT_SUSPENDED,
  title: `Tenant suspended`,
  description: `Suspended by ${adminName}. Reason: ${reason}`,
  severity: 'warning',
  sourceModule: 'platform',
  sourceEntityType: 'tenant',
  sourceEntityId: tenantId,
  actorId: session.adminId,
  actorType: 'admin',
  metadata: { reason },
});
```

## 6. BACKEND — API ROUTES

### GET /api/v1/tenants/[tenantId]/timeline
- Query params:
  - page (default 1), limit (default 50, max 200)
  - eventTypes — comma-separated filter: `tenant.suspended,dlq.event_created`
  - severity — comma-separated: `error,critical`
  - category — from TIMELINE_EVENT_CATEGORIES key: `Errors & DLQ`
  - dateFrom, dateTo — ISO date strings for range filter
  - search — ILIKE on title and description
- Returns paginated results: { events: TimelineEvent[], total: number, page: number, limit: number }
- Each event includes: id, eventType, title, description, severity, sourceModule, sourceEntityType, sourceEntityId, actorId, actorType, metadata, occurredAt
- Resolve actorId → actor name (join platform_admins if actorType='admin')
- Order by occurred_at DESC
- Protected by: withAdminPermission({ module: 'tenants', action: 'view' })

### POST /api/v1/tenants/[tenantId]/timeline/hydrate
- Triggers retroactive hydration for a single tenant
- Returns { eventsCreated: number }
- Protected by: withAdminPermission({ module: 'config', action: 'manage' })
- Rate limit: 1 call per tenant per 5 minutes

### GET /api/v1/tenants/[tenantId]/timeline/stats
- Returns aggregated stats for the timeline filter bar:
  - eventsByType: { [eventType]: count }
  - eventsBySeverity: { [severity]: count }
  - totalEvents: number
  - dateRange: { earliest: string, latest: string }
- Useful for showing count badges on filter chips
- Protected by: withAdminPermission({ module: 'tenants', action: 'view' })

## 7. SERVER-SIDE LIBS

Create apps/admin/src/lib/timeline-queries.ts:
- getTimelineEvents(tenantId, filters) — builds dynamic query with all filter params
- getTimelineStats(tenantId) — aggregate counts for filter UI
- getRecentTimelineEvents(tenantId, limit) — quick fetch for tenant detail overview tab

## 8. FRONTEND — HOOKS

Create apps/admin/src/hooks/use-timeline.ts:

```typescript
interface UseTimelineOptions {
  tenantId: string;
  page?: number;
  limit?: number;
  eventTypes?: string[];
  severities?: string[];
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export function useTimeline(options: UseTimelineOptions) {
  // Returns: { events, total, isLoading, error, mutate }
}

export function useTimelineStats(tenantId: string) {
  // Returns: { stats, isLoading }
}
```

## 9. FRONTEND — COMPONENTS

Create in apps/admin/src/components/timeline/:

### TimelineEventCard.tsx
- Left gutter: severity-colored dot + vertical connecting line (timeline rail)
- Content: icon (based on event type), title, description (truncatable), actor name + actor type badge, relative timestamp (e.g., "2 hours ago") with hover showing full datetime
- Expandable: click to show full metadata JSON (syntax highlighted, collapsible)
- Source link: if sourceEntityType + sourceEntityId present, render a link to the relevant admin page (e.g., "View Order", "View User", "View DLQ Event")
- Severity styling: use SEVERITY_CONFIG for background/text colors on the card

### TimelineFilterBar.tsx
- Search input (debounced 300ms)
- Category dropdown: multi-select from TIMELINE_EVENT_CATEGORIES keys, shows count badge per category from stats
- Severity filter: clickable chips for each severity level, toggleable, with count badges
- Date range picker: from/to date inputs
- Active filter count badge
- "Clear all filters" button
- Compact design — single row that wraps on smaller screens

### TimelineFeed.tsx
- Renders list of TimelineEventCard components
- Timeline rail: vertical line connecting events on the left
- Date separators: "Today", "Yesterday", "February 20, 2026", etc. — inserted between events when the date changes
- Infinite scroll or pagination controls at bottom
- Empty state: "No timeline events match your filters" with illustration
- Loading: skeleton cards (3-5 pulsing placeholder cards)

### TimelineStatsBar.tsx
- Horizontal bar above the feed showing: total events count, events by severity (colored count badges), date range
- Quick filter shortcuts: "Errors only", "Last 24h", "Last 7d"

## 10. FRONTEND — INTEGRATE INTO TENANT DETAIL

Update the tenant detail page (apps/admin/src/app/(admin)/tenants/[tenantId]/page.tsx):

**Replace the "Activity" tab placeholder** (from Session 1) with the full Timeline tab:
- Tab label: "Timeline" (with event count badge)
- Content: TimelineStatsBar + TimelineFilterBar + TimelineFeed
- Default view: last 7 days, all severities, all types

**Update the Overview tab** to include a "Recent Activity" section:
- Show the 5 most recent timeline events (using getRecentTimelineEvents)
- Compact card format (no expanded metadata)
- "View full timeline →" link that switches to the Timeline tab

## 11. TESTS

### API Route Tests (apps/admin/src/app/api/v1/tenants/[tenantId]/timeline/__tests__/):

**timeline-list.test.ts** (8+ tests):
- Returns paginated timeline events sorted by occurred_at DESC
- Filters by event type correctly
- Filters by severity correctly
- Filters by category (expands to event types)
- Filters by date range
- Search filters on title and description
- Returns 404 for non-existent tenant
- Resolves actor names for admin actors
- Handles empty results gracefully

**timeline-stats.test.ts** (4+ tests):
- Returns counts by event type
- Returns counts by severity
- Returns correct date range
- Returns zeros for tenant with no events

**timeline-hydrate.test.ts** (4+ tests):
- Creates events from audit log entries
- Skips duplicates on re-hydration (ON CONFLICT DO NOTHING)
- Returns correct eventsCreated count
- Respects rate limit (429 on rapid calls)

### Lib Tests (apps/admin/src/lib/__tests__/):

**timeline-writer.test.ts** (5+ tests):
- writeTimelineEvent inserts correctly
- writeTimelineEvents batch inserts
- Generates ULID for id
- Swallows errors gracefully (fire-and-forget)
- Includes all required fields

**timeline-queries.test.ts** (6+ tests):
- Builds WHERE clause with event type filter
- Builds WHERE clause with severity filter
- Builds WHERE clause with date range
- Builds WHERE clause with search ILIKE
- Correct pagination math
- getRecentTimelineEvents returns limited results

### Component Tests (optional but recommended):

**TimelineEventCard.test.tsx** (3+ tests):
- Renders title, description, actor name
- Applies correct severity styling
- Shows source link when entity ID present

## ACCEPTANCE CRITERIA
- [ ] Migration runs clean
- [ ] Timeline events table created with proper indexes
- [ ] writeTimelineEvent works as fire-and-forget (never breaks callers)
- [ ] Existing admin actions (suspend, impersonate, module toggle, etc.) now write timeline events
- [ ] Hydration script populates timeline from historical data
- [ ] Timeline API returns filtered, paginated results
- [ ] Tenant detail "Timeline" tab shows unified chronological feed
- [ ] Filter bar works: search, category, severity, date range
- [ ] Date separators appear between different days
- [ ] Metadata is expandable on each card
- [ ] Source links navigate to relevant admin pages
- [ ] Overview tab shows 5 most recent events
- [ ] All tests pass
- [ ] TypeScript strict — no `any` types
````

---

## SESSION 12: Tenant Onboarding Workflow

**Paste the context block, then paste this session.**

---

### Prompt

````
SESSION 12: Tenant Onboarding Workflow

This is Session 12. In Session 11, we built:
- tenant_timeline_events table with indexes
- Timeline writer (fire-and-forget), hydrator (retroactive), and inline writes from existing admin actions
- Timeline API with filtering (type, severity, category, date range, search), pagination, stats
- Timeline tab on tenant detail with feed, filter bar, date separators, expandable metadata
- Overview tab now shows 5 recent timeline events

Now build the tenant onboarding workflow — a structured checklist system that guides implementation specialists through provisioning new tenants.

## 1. DATABASE MIGRATION

Create migration: packages/db/drizzle/migrations/XXXX_onboarding_templates.sql

```sql
CREATE TABLE onboarding_templates (
  id VARCHAR(26) PRIMARY KEY,
  industry VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(26) REFERENCES platform_admins(id)
);

CREATE UNIQUE INDEX idx_onboarding_template_default ON onboarding_templates (industry) WHERE is_default = true;

-- Add columns to tenant_onboarding_checklists (from Session 1)
ALTER TABLE tenant_onboarding_checklists
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_auto_detectable BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_detect_query VARCHAR(255),
  ADD COLUMN IF NOT EXISTS blocker_notes TEXT,
  ADD COLUMN IF NOT EXISTS assigned_admin_id VARCHAR(26) REFERENCES platform_admins(id);
```

### Onboarding Steps Schema (JSONB in templates)

```typescript
interface OnboardingStepTemplate {
  key: string;           // e.g. 'create_location'
  title: string;         // e.g. 'Create First Location'
  description: string;   // What needs to be done
  order: number;         // Display order
  isRequired: boolean;   // Must complete to finish onboarding
  isAutoDetectable: boolean; // System can check completion automatically
  autoDetectQuery?: string;  // Which auto-detect check to run
  dependsOn?: string[];  // Step keys that must be completed first
  estimatedMinutes?: number; // Time estimate for the step
}
```

### Seed Default Templates

Insert default templates for each industry. These should be seeded in the migration or via a seed script.

**Golf Club Template** (steps in order):
1. `create_site` — "Create Site" — required, auto-detectable (check locations table for type='site')
2. `create_venue` — "Create Venue(s)" — required, auto-detectable (check locations for type='venue')
3. `create_profit_center` — "Create Profit Center" — required, auto-detectable (check profit_centers table)
4. `create_terminal` — "Create Terminal" — required, auto-detectable (check terminals table)
5. `add_first_user` — "Add First Staff User" — required, auto-detectable (check users table excluding admin)
6. `configure_roles` — "Configure Roles & Permissions" — required, NOT auto-detectable
7. `enable_pos` — "Enable POS Module" — required, auto-detectable (check entitlements for 'pos')
8. `enable_tee_sheet` — "Enable Tee Sheet Module" — required for golf, auto-detectable
9. `configure_chart_of_accounts` — "Set Up Chart of Accounts" — required, auto-detectable (check gl_accounts)
10. `add_catalog_items` — "Add Menu/Shop Items" — required, auto-detectable (check catalog_items)
11. `configure_payment_types` — "Configure Payment Types" — required, NOT auto-detectable
12. `test_first_order` — "Complete Test Order" — required, auto-detectable (check orders table)
13. `go_live_review` — "Go-Live Review" — required, NOT auto-detectable (manual sign-off)

**Restaurant Template**: Similar but replace tee_sheet with `enable_fnb` ("Enable F&B Module"), add `create_room_layout` ("Create Room Layout"), add `sync_tables` ("Sync Tables to Floor Plan").

**Retail Template**: Simpler — skip tee_sheet and fnb, add `configure_inventory` ("Enable Inventory Tracking").

**Hotel Template**: Add `enable_pms` ("Enable PMS Module"), skip tee_sheet.

## 2. DRIZZLE SCHEMA

Add onboardingTemplates table to schema:

```typescript
export const onboardingTemplates = pgTable('onboarding_templates', {
  id: varchar('id', { length: 26 }).primaryKey(),
  industry: varchar('industry', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  steps: jsonb('steps').notNull().default([]),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: varchar('created_by', { length: 26 }).references(() => platformAdmins.id),
});
```

Update tenantOnboardingChecklists with new columns (displayOrder, isAutoDetectable, autoDetectQuery, blockerNotes, assignedAdminId).

Export from schema barrel.

## 3. BACKEND — Auto-Detection Engine

Create apps/admin/src/lib/onboarding-auto-detect.ts:

This is the core intelligence. Each auto-detectable step has a corresponding check function that queries the tenant's data to determine if the step has been completed.

```typescript
type AutoDetectResult = { completed: boolean; detail?: string };

const AUTO_DETECT_CHECKS: Record<string, (tenantId: string) => Promise<AutoDetectResult>> = {
  'check_has_site': async (tenantId) => {
    const count = await db.execute(sql`SELECT COUNT(*) as c FROM locations WHERE tenant_id = ${tenantId} AND type = 'site'`);
    return { completed: count[0].c > 0, detail: `${count[0].c} site(s) found` };
  },
  'check_has_venue': async (tenantId) => { /* check locations type='venue' */ },
  'check_has_profit_center': async (tenantId) => { /* check profit_centers */ },
  'check_has_terminal': async (tenantId) => { /* check terminals */ },
  'check_has_staff_user': async (tenantId) => { /* check users count > 0, exclude platform admins */ },
  'check_has_entitlement': async (tenantId, moduleKey) => { /* check entitlements for module */ },
  'check_has_gl_accounts': async (tenantId) => { /* check gl_accounts count > 0 */ },
  'check_has_catalog_items': async (tenantId) => { /* check catalog_items count > 0 */ },
  'check_has_orders': async (tenantId) => { /* check orders count > 0 */ },
  'check_has_room_layout': async (tenantId) => { /* check room_layouts table */ },
  'check_has_fnb_tables': async (tenantId) => { /* check fnb_tables count > 0 */ },
};

export async function runAutoDetection(tenantId: string, checkKey: string): Promise<AutoDetectResult> { ... }
export async function runAllAutoDetections(tenantId: string, steps: OnboardingChecklistItem[]): Promise<Map<string, AutoDetectResult>> { ... }
```

- Each check is a simple count query — fast and safe (read-only)
- Returns both boolean and detail string for UI display
- runAllAutoDetections runs all checks in parallel (Promise.all) for speed

## 4. BACKEND — Onboarding Commands

Create apps/admin/src/lib/onboarding-commands.ts:

```typescript
// Apply a template to a tenant — creates checklist items from template steps
export async function applyOnboardingTemplate(
  tenantId: string,
  templateId: string,
  adminId: string
): Promise<{ stepsCreated: number }> { ... }

// Update a checklist step status
export async function updateChecklistStep(
  tenantId: string,
  stepKey: string,
  update: { status: 'pending' | 'in_progress' | 'completed' | 'skipped'; blockerNotes?: string; assignedAdminId?: string },
  adminId: string
): Promise<void> { ... }

// Run auto-detection and update steps that are now completed
export async function refreshAutoDetection(tenantId: string): Promise<{ stepsUpdated: number }> { ... }

// Check if all required steps are complete → transition tenant to active
export async function checkOnboardingCompletion(tenantId: string, adminId: string): Promise<{ isComplete: boolean; missingSteps: string[] }> { ... }
```

- applyOnboardingTemplate: inserts checklist rows from template JSON, respects UNIQUE(tenant_id, step_key), sets display_order and is_auto_detectable
- updateChecklistStep: validates step exists, sets completed_at/completed_by when status → completed, writes timeline event
- refreshAutoDetection: runs all auto-detect checks, updates steps that are now detected as complete
- checkOnboardingCompletion: checks all required steps, if all complete → updates tenant onboarding_status to 'completed' and status to 'active', writes timeline event

## 5. BACKEND — API ROUTES

### GET /api/v1/onboarding/dashboard
- Returns: tenants in onboarding with progress summary
- Data per tenant: id, name, industry, onboardingStatus, totalSteps, completedSteps, stalledSteps (in_progress for > 3 days), assignedAdmin, lastActivityAt
- Sortable by: progress (completedSteps/totalSteps), lastActivityAt, name
- Filterable by: industry, assignedAdmin, status (in_progress/stalled)
- Protected by: withAdminPermission({ module: 'tenants', action: 'view' })

### GET /api/v1/tenants/[tenantId]/onboarding
- Returns: full checklist for tenant with current status
- Each step: key, title, description, order, status, isRequired, isAutoDetectable, lastAutoDetectResult, completedAt, completedBy (resolved name), blockerNotes, assignedAdmin (resolved name), dependsOn, estimatedMinutes
- Also returns: templateId, templateName, overallProgress (completed/total), estimatedRemainingMinutes
- Protected by: withAdminPermission({ module: 'tenants', action: 'view' })

### POST /api/v1/tenants/[tenantId]/onboarding/apply-template
- Body: { templateId: string }
- Applies template to tenant, creates checklist items
- Returns: { stepsCreated: number }
- Audit log
- Protected by: withAdminPermission({ module: 'tenants', action: 'manage' })

### PATCH /api/v1/tenants/[tenantId]/onboarding/steps/[stepKey]
- Body: { status, blockerNotes?, assignedAdminId? }
- Updates step status
- If status → 'completed', sets completed_at and completed_by
- After update, runs checkOnboardingCompletion to see if all done
- Audit log + timeline event
- Protected by: withAdminPermission({ module: 'tenants', action: 'manage' })

### POST /api/v1/tenants/[tenantId]/onboarding/refresh
- Runs auto-detection for all auto-detectable steps
- Returns: { stepsUpdated: number, results: { [stepKey]: AutoDetectResult } }
- After refresh, runs checkOnboardingCompletion
- Protected by: withAdminPermission({ module: 'tenants', action: 'view' })

### GET /api/v1/onboarding/templates
- Returns all templates, grouped by industry
- Protected by: withAdminPermission({ module: 'config', action: 'view' })

### POST /api/v1/onboarding/templates
- Body: { industry, name, description?, steps: OnboardingStepTemplate[] }
- Creates custom template
- Audit log
- Protected by: withAdminPermission({ module: 'config', action: 'manage' })

## 6. FRONTEND — HOOKS

Create apps/admin/src/hooks/use-onboarding.ts:

```typescript
export function useOnboardingDashboard(filters?: OnboardingDashboardFilters) {
  // Returns: { tenants, isLoading, error }
}

export function useTenantOnboarding(tenantId: string) {
  // Returns: { checklist, progress, isLoading, error, mutate }
}

export function useOnboardingTemplates() {
  // Returns: { templates, isLoading }
}

export function useOnboardingActions(tenantId: string) {
  // Returns: { applyTemplate, updateStep, refreshAutoDetection }
  // Each returns a mutation function with optimistic updates
}
```

## 7. FRONTEND — PAGES

### Onboarding Dashboard: apps/admin/src/app/(admin)/onboarding/page.tsx

- Header: "Onboarding" + count of tenants in onboarding
- Stats row at top: total in onboarding, stalled (> 3 days on a step), completed this month, avg days to complete
- Filter bar: industry dropdown, assigned admin dropdown, status (all/in_progress/stalled)
- Table/card list of tenants in onboarding:
  - Tenant name (link to tenant detail)
  - Industry badge
  - Progress bar: filled segments = completed steps, empty = remaining, red segments = blocked
  - Completed/Total steps count
  - Assigned admin avatar/name
  - Last activity timestamp
  - "Stalled" badge if any step has been in_progress > 3 days
- Sort by: progress %, last activity, name
- Click row → tenant detail page Onboarding tab

### Tenant Onboarding Tab (update tenant detail page)

Replace the onboarding checklist widget in the Overview tab with a full Onboarding tab:

- Tab label: "Onboarding" + progress fraction (e.g., "7/13")
- If no checklist exists yet: show "Apply Template" CTA with template selector dropdown (filtered by tenant industry, with fallback to all)
- If checklist exists:
  - Progress bar at top: visual completion with percentage
  - Estimated time remaining
  - "Refresh Auto-Detection" button (calls refresh endpoint, shows spinner, updates results)
  - Checklist items in order, each as an expandable card:
    - Left: status icon (circle=pending, spinner=in_progress, check=completed, skip=skipped)
    - Title + description
    - Status badge (colored)
    - Auto-detect indicator: if auto-detectable, show "Auto-detected ✓" or "Not yet detected" with refresh icon
    - If in_progress or pending: action buttons — "Mark Complete", "Skip", "Mark In Progress"
    - Dependency indicator: if dependsOn steps are not complete, show "Waiting for: [step names]" and disable completion
    - Blocker notes: inline editable textarea, save on blur
    - Assigned admin: dropdown to assign/reassign implementation specialist
    - Completed info: "Completed by [Name] on [Date]" when done
  - "Complete Onboarding" button at bottom: enabled only when all required steps done. Shows missing steps if not ready. On click: transitions tenant to active, writes timeline event, shows success toast.

## 8. FRONTEND — COMPONENTS

Create in apps/admin/src/components/onboarding/:

### OnboardingProgressBar.tsx
- Segmented progress bar where each segment = one step
- Colors: green=completed, blue=in_progress, gray=pending, orange=blocked/stalled, lighter gray=skipped
- Hover on segment shows step name tooltip
- Shows percentage text

### OnboardingStepCard.tsx
- Expandable card for a single checklist step
- Collapsed: status icon, title, assigned admin avatar, auto-detect badge
- Expanded: full description, blocker notes textarea, action buttons, dependency info, completion info
- Disabled state when dependencies not met (dimmed, tooltip explaining what's needed)

### OnboardingTemplateSelector.tsx
- Dropdown/modal for selecting which template to apply
- Groups templates by industry
- Shows step count and estimated total time per template
- "Apply" button with confirmation

### OnboardingStalledAlert.tsx
- Warning banner shown at top of onboarding tab when any step has been in_progress > 3 days
- Lists stalled steps with how many days stalled
- "Need help? Reassign to another specialist" link

## 9. SIDEBAR

Add "Onboarding" nav item to AdminSidebar (with ClipboardCheck icon from lucide-react), linking to /onboarding. Wrap in PermissionGate for tenants.view.

## 10. TESTS

### API Route Tests:

**onboarding-dashboard.test.ts** (5+ tests):
- Returns tenants in onboarding with progress
- Filters by industry
- Filters by stalled status (step in_progress > 3 days)
- Sorts by progress percentage
- Returns empty list when no tenants in onboarding

**tenant-onboarding.test.ts** (8+ tests):
- Returns full checklist with status for each step
- Apply template creates checklist items
- Apply template respects UNIQUE constraint (no duplicates)
- Update step to completed sets completed_at and completed_by
- Update step validates step exists (404 for bad key)
- Refresh auto-detection updates detected steps
- checkOnboardingCompletion transitions tenant when all required done
- checkOnboardingCompletion returns missing steps when incomplete
- Skip step marks as skipped without affecting required completion check (unless the step itself is required and not skipped)

**onboarding-templates.test.ts** (3+ tests):
- Returns templates grouped by industry
- Creates custom template
- Default template constraint (only one default per industry)

### Lib Tests:

**onboarding-auto-detect.test.ts** (5+ tests):
- check_has_site returns true when site exists
- check_has_site returns false when no site
- runAllAutoDetections runs checks in parallel
- Returns detail strings
- Handles DB errors gracefully

**onboarding-commands.test.ts** (5+ tests):
- applyOnboardingTemplate inserts steps from template
- updateChecklistStep validates transitions
- refreshAutoDetection updates detected steps
- checkOnboardingCompletion detects complete state
- checkOnboardingCompletion detects incomplete state with missing list

## ACCEPTANCE CRITERIA
- [ ] Migration runs clean
- [ ] Default templates seeded for golf, restaurant, retail, hotel
- [ ] Apply template to tenant creates correct checklist items
- [ ] Auto-detection correctly checks tenant data for step completion
- [ ] Manual step updates work with audit logging + timeline events
- [ ] Onboarding dashboard shows all tenants in onboarding with progress
- [ ] Stalled detection works (steps in_progress > 3 days)
- [ ] Dependency checking prevents completing steps before prerequisites
- [ ] "Complete Onboarding" transitions tenant status to active
- [ ] Onboarding tab in tenant detail is fully functional
- [ ] All tests pass
- [ ] TypeScript strict — no `any` types
````

---

## SESSION 13: Alerting + Notification System

**Paste the context block, then paste this session.**

---

### Prompt

````
SESSION 13: Alerting + Notification System

This is Session 13. In Session 12, we built:
- onboarding_templates table with seeded templates per industry
- Auto-detection engine that checks tenant data for step completion
- Onboarding commands: apply template, update step, refresh detection, check completion
- Onboarding dashboard page with progress tracking, stalled detection
- Onboarding tab on tenant detail with full checklist UI, dependency checking, blocker notes
- Auto-transition to active on onboarding completion

Now build the alerting and notification system — proactive alerts that surface problems before customers report them, plus an in-app notification system for admin staff.

## 1. DATABASE MIGRATION

Create migration: packages/db/drizzle/migrations/XXXX_admin_notifications.sql

```sql
-- Alert rule definitions (what conditions trigger alerts)
CREATE TABLE admin_alert_rules (
  id VARCHAR(26) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  rule_type VARCHAR(60) NOT NULL,
  condition_config JSONB NOT NULL DEFAULT '{}',
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  is_enabled BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(26) REFERENCES platform_admins(id)
);

-- Notification preferences per admin
CREATE TABLE admin_notification_preferences (
  id VARCHAR(26) PRIMARY KEY,
  admin_id VARCHAR(26) NOT NULL REFERENCES platform_admins(id),
  channel VARCHAR(30) NOT NULL DEFAULT 'in_app',
  event_types JSONB NOT NULL DEFAULT '[]',
  severity_filter JSONB NOT NULL DEFAULT '["warning", "error", "critical"]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(admin_id, channel)
);

-- Individual notifications delivered to admins
CREATE TABLE admin_notifications (
  id VARCHAR(26) PRIMARY KEY,
  admin_id VARCHAR(26) NOT NULL REFERENCES platform_admins(id),
  alert_rule_id VARCHAR(26) REFERENCES admin_alert_rules(id),
  tenant_id VARCHAR(26) REFERENCES tenants(id),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  link_url VARCHAR(500),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_admin_unread ON admin_notifications (admin_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_admin_created ON admin_notifications (admin_id, created_at DESC);
CREATE INDEX idx_alert_rules_enabled ON admin_alert_rules (is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_notification_prefs_admin ON admin_notification_preferences (admin_id);
```

## 2. DRIZZLE SCHEMA

Add these three tables to packages/db/src/schema/ (new file `notifications.ts` or add to `platform.ts`):

- adminAlertRules
- adminNotificationPreferences
- adminNotifications

Export from schema barrel.

## 3. BACKEND — Alert Rules Engine

Create apps/admin/src/lib/alert-engine.ts:

### Rule Types and Conditions

```typescript
export const ALERT_RULE_TYPES = {
  DLQ_DEPTH_THRESHOLD: 'dlq_depth_threshold',
  TENANT_ERROR_RATE: 'tenant_error_rate',
  NO_ORDERS_ACTIVE_TENANT: 'no_orders_active_tenant',
  HEALTH_GRADE_DROP: 'health_grade_drop',
  ONBOARDING_STALLED: 'onboarding_stalled',
  CLOSE_BATCH_FAILED: 'close_batch_failed',
  GL_POSTING_ERRORS: 'gl_posting_errors',
} as const;

interface AlertConditionConfig {
  // DLQ_DEPTH_THRESHOLD
  dlqDepthThreshold?: number;  // e.g. 10

  // TENANT_ERROR_RATE
  errorRateThreshold?: number; // errors per hour, e.g. 50
  errorRateWindowMinutes?: number; // e.g. 60

  // NO_ORDERS_ACTIVE_TENANT
  noOrdersHours?: number; // e.g. 24

  // HEALTH_GRADE_DROP
  minGradeDrop?: number; // e.g. 2 (from A to C = drop of 2)

  // ONBOARDING_STALLED
  stalledDays?: number; // e.g. 3

  // CLOSE_BATCH_FAILED / GL_POSTING_ERRORS
  // No extra config needed — any occurrence triggers
}
```

### Alert Check Functions

```typescript
interface AlertCheckResult {
  triggered: boolean;
  affectedTenants: { tenantId: string; tenantName: string; detail: string }[];
}

const ALERT_CHECKS: Record<string, (config: AlertConditionConfig) => Promise<AlertCheckResult>> = {
  dlq_depth_threshold: async (config) => {
    // Query: SELECT tenant_id, COUNT(*) as depth FROM event_dead_letters WHERE status = 'pending' GROUP BY tenant_id HAVING COUNT(*) >= config.dlqDepthThreshold
    // Return affected tenants
  },
  tenant_error_rate: async (config) => {
    // Query: count errors in request_log or system_health_snapshots for the window
  },
  no_orders_active_tenant: async (config) => {
    // Query: active tenants where last_order_at is NULL or older than config.noOrdersHours
    // Cross-reference with tenant_health_snapshots.last_order_at
  },
  health_grade_drop: async (config) => {
    // Compare latest two tenant_health_snapshots per tenant
    // Return tenants where grade dropped by >= config.minGradeDrop
  },
  onboarding_stalled: async (config) => {
    // Query: tenants with onboarding_status = 'in_progress' and any checklist step
    // status = 'in_progress' with updated_at older than config.stalledDays
  },
  close_batch_failed: async () => {
    // Query: recent close batches with status = 'failed' in last 24h
  },
  gl_posting_errors: async () => {
    // Query: recent gl_unmapped_events or unposted batches in last 24h
  },
};
```

### Alert Runner

```typescript
export async function runAlertChecks(): Promise<{ alertsTriggered: number; notificationsCreated: number }> {
  // 1. Fetch all enabled alert rules
  // 2. For each rule, check cooldown (skip if last_triggered_at + cooldown_minutes > now)
  // 3. Run the check function
  // 4. If triggered:
  //    a. Update last_triggered_at on the rule
  //    b. For each affected tenant, create notifications for eligible admins
  //    c. Write timeline events for affected tenants
  //    d. Optionally fire Slack webhook (if configured)
  // 5. Return summary
}
```

- Designed to run as a scheduled job (e.g., every 5 minutes via the Postgres-backed job system)
- Cooldown prevents alert fatigue (same rule won't fire again within cooldown period)
- Notification routing: check admin_notification_preferences to determine which admins get which alerts

### Notification Routing

```typescript
export async function routeAlertToAdmins(
  ruleId: string,
  tenantId: string,
  severity: string,
  title: string,
  body: string,
  linkUrl: string,
  metadata?: Record<string, unknown>
): Promise<{ notificationsCreated: number }> {
  // 1. Fetch all admin_notification_preferences where channel = 'in_app' and is_active = true
  // 2. Filter by severity (admin's severity_filter must include this severity)
  // 3. Filter by event_types (if admin has specific event type filters, check rule_type matches)
  // 4. Create admin_notifications for each matching admin
  // 5. Return count
}
```

## 4. BACKEND — Slack Webhook (Optional Delivery Channel)

Create apps/admin/src/lib/slack-webhook.ts:

```typescript
export async function sendSlackAlert(webhookUrl: string, payload: {
  title: string;
  body: string;
  severity: string;
  tenantName: string;
  linkUrl: string;
}): Promise<void> {
  // POST to webhookUrl with Slack Block Kit formatted message
  // Severity → color: critical=red, error=orange, warning=yellow
  // Include link button to admin portal
  // Fire and forget — catch errors and log, never throw
}
```

- Webhook URL stored in environment variable: `SLACK_ALERT_WEBHOOK_URL`
- Only sends if env var is set
- Uses Slack Block Kit for rich formatting

## 5. BACKEND — Seed Default Alert Rules

Create seed script or include in migration:

```sql
INSERT INTO admin_alert_rules (id, name, description, rule_type, condition_config, severity, cooldown_minutes) VALUES
  (generate_ulid(), 'DLQ Depth Warning', 'Alert when any tenant has more than 10 pending dead letters', 'dlq_depth_threshold', '{"dlqDepthThreshold": 10}', 'warning', 60),
  (generate_ulid(), 'DLQ Depth Critical', 'Alert when any tenant has more than 50 pending dead letters', 'dlq_depth_threshold', '{"dlqDepthThreshold": 50}', 'critical', 30),
  (generate_ulid(), 'No Orders (24h)', 'Alert when an active tenant has no orders in 24 hours', 'no_orders_active_tenant', '{"noOrdersHours": 24}', 'warning', 360),
  (generate_ulid(), 'Health Grade Drop', 'Alert when tenant health grade drops by 2+ levels', 'health_grade_drop', '{"minGradeDrop": 2}', 'error', 120),
  (generate_ulid(), 'Onboarding Stalled', 'Alert when onboarding step is stuck for 3+ days', 'onboarding_stalled', '{"stalledDays": 3}', 'warning', 1440),
  (generate_ulid(), 'Close Batch Failed', 'Alert on any failed close batch', 'close_batch_failed', '{}', 'error', 60),
  (generate_ulid(), 'GL Posting Errors', 'Alert on GL unmapped events', 'gl_posting_errors', '{}', 'warning', 120);
```

## 6. BACKEND — API ROUTES

### Notifications

**GET /api/v1/notifications**
- Query params: page, limit, isRead (true/false/all), severity
- Returns current admin's notifications, newest first
- Each: id, title, body, severity, isRead, readAt, linkUrl, tenantId, tenantName, createdAt
- Resolve tenantId → tenantName via join
- Protected by: authenticated admin (no specific permission needed — admins see own notifications)

**GET /api/v1/notifications/unread-count**
- Returns: { count: number }
- Lightweight endpoint for the notification bell badge
- Protected by: authenticated admin

**PATCH /api/v1/notifications/[notificationId]/read**
- Marks notification as read, sets read_at
- Protected by: authenticated admin (only own notifications)

**POST /api/v1/notifications/mark-all-read**
- Marks all unread notifications for current admin as read
- Protected by: authenticated admin

**DELETE /api/v1/notifications/[notificationId]**
- Deletes (hard delete) a notification
- Protected by: authenticated admin (only own notifications)

### Notification Preferences

**GET /api/v1/notifications/preferences**
- Returns current admin's notification preferences
- Protected by: authenticated admin

**PUT /api/v1/notifications/preferences**
- Body: { channel: 'in_app', severityFilter: string[], eventTypes?: string[], isActive: boolean }
- Upsert notification preferences for current admin
- Protected by: authenticated admin

### Alert Rules (platform_engineer+ only)

**GET /api/v1/alerts/rules**
- Returns all alert rules with status (enabled/disabled, last triggered, cooldown remaining)
- Protected by: withAdminPermission({ module: 'config', action: 'view' })

**PATCH /api/v1/alerts/rules/[ruleId]**
- Update: isEnabled, conditionConfig, severity, cooldownMinutes
- Audit log
- Protected by: withAdminPermission({ module: 'config', action: 'manage' })

**POST /api/v1/alerts/rules**
- Create custom alert rule
- Body: { name, description, ruleType, conditionConfig, severity, cooldownMinutes }
- Audit log
- Protected by: withAdminPermission({ module: 'config', action: 'manage' })

**POST /api/v1/alerts/run**
- Manually trigger alert check cycle (for testing/debugging)
- Returns: { alertsTriggered, notificationsCreated, details[] }
- Protected by: withAdminPermission({ module: 'config', action: 'manage' })
- Rate limit: 1 call per 2 minutes

## 7. FRONTEND — HOOKS

Create apps/admin/src/hooks/use-notifications.ts:

```typescript
export function useNotifications(filters?: { isRead?: boolean; severity?: string }) {
  // Returns: { notifications, total, isLoading, error, mutate }
}

export function useUnreadCount() {
  // Returns: { count, isLoading }
  // Polls every 30 seconds for real-time-ish badge updates
}

export function useNotificationActions() {
  // Returns: { markRead, markAllRead, deleteNotification }
}

export function useNotificationPreferences() {
  // Returns: { preferences, isLoading, updatePreferences }
}
```

Create apps/admin/src/hooks/use-alert-rules.ts:

```typescript
export function useAlertRules() {
  // Returns: { rules, isLoading, updateRule, createRule, runAlertCheck }
}
```

## 8. FRONTEND — NOTIFICATION BELL + PANEL

### NotificationBell.tsx (apps/admin/src/components/notifications/NotificationBell.tsx)
- Bell icon (lucide-react Bell) in the admin header/topbar
- Unread count badge: red circle with count (or "9+" if > 9)
- Pulses briefly when new notification arrives (compare count changes)
- Click opens NotificationPanel as a dropdown/flyout

### NotificationPanel.tsx
- Flyout dropdown (positioned from bell, max-height with scroll)
- Header: "Notifications" + "Mark all read" link
- Tabs or filter chips: All | Unread | By Severity
- Notification items in list:
  - Severity color bar on left edge
  - Title (bold if unread)
  - Body (truncated to 2 lines)
  - Tenant name badge (if tenant-specific)
  - Relative timestamp
  - Click → navigates to linkUrl and marks as read
  - Swipe-to-dismiss or X button to delete
- Empty state: "No notifications" with bell illustration
- Footer: "View all notifications →" link to full notifications page

### Full Notifications Page: apps/admin/src/app/(admin)/notifications/page.tsx
- Full-page version of notification panel
- Table/list with all notifications
- Filters: read/unread, severity, date range
- Bulk actions: mark selected as read, delete selected
- Notification preferences section (or link to settings):
  - Severity filter: checkboxes for which severities to receive
  - Toggle in-app notifications on/off

## 9. FRONTEND — ALERT RULES MANAGEMENT

### Alert Rules Page: apps/admin/src/app/(admin)/settings/alerts/page.tsx
- Wrap in PermissionGate for config.manage
- Header: "Alert Rules" + "Create Rule" button + "Run Check Now" button
- Table of alert rules:
  - Name
  - Rule type (human-readable label)
  - Severity badge
  - Enabled toggle (inline switch)
  - Condition summary (e.g., "DLQ depth ≥ 10")
  - Cooldown (e.g., "60 min")
  - Last triggered (relative timestamp or "Never")
  - Edit button → opens edit modal

### AlertRuleEditModal.tsx
- Form fields: name, description, ruleType (select from ALERT_RULE_TYPES), severity (select), cooldownMinutes, isEnabled toggle
- Dynamic condition config fields based on selected ruleType:
  - dlq_depth_threshold → number input for threshold
  - no_orders_active_tenant → number input for hours
  - health_grade_drop → number input for min grade drop
  - onboarding_stalled → number input for days
  - close_batch_failed / gl_posting_errors → no extra config
- Save/Cancel buttons

## 10. INTEGRATE NOTIFICATION BELL INTO LAYOUT

Update the admin layout (apps/admin/src/app/(admin)/layout.tsx or header component):
- Add NotificationBell to the top-right of the header bar, next to the user avatar/menu
- NotificationBell should use useUnreadCount for the badge

Add "Settings" section to AdminSidebar with "Alert Rules" sub-item (Settings icon from lucide-react). Wrap in PermissionGate for config.view.

## 11. BACKEND — Scheduled Job Registration

Create apps/admin/src/lib/alert-scheduler.ts:

```typescript
// Register the alert check as a recurring job
// Using the existing Postgres-backed job system (SKIP LOCKED pattern)
export async function registerAlertCheckJob(): Promise<void> {
  // Insert or update a job record that runs runAlertChecks() every 5 minutes
  // The job system's worker will pick this up
}
```

If the admin app doesn't yet have a job worker, create a minimal one:
- apps/admin/src/lib/job-worker.ts
- Polls a `admin_jobs` table (or reuse existing job infrastructure) every 60 seconds
- Runs registered jobs when due
- Uses SKIP LOCKED to prevent concurrent execution

NOTE: If integrating with the existing Postgres-backed job system from the core package is simpler, do that instead. The key requirement is that `runAlertChecks()` executes every 5 minutes automatically.

## 12. TESTS

### API Route Tests:

**notifications.test.ts** (8+ tests):
- GET returns current admin's notifications only (not other admins')
- Filters by isRead
- Filters by severity
- Pagination works
- GET unread-count returns correct count
- PATCH marks as read with read_at timestamp
- POST mark-all-read updates all unread
- DELETE removes notification

**notification-preferences.test.ts** (4+ tests):
- GET returns current admin's preferences
- PUT upserts preferences (creates if missing, updates if exists)
- Validates severity filter values
- Validates channel values

**alert-rules.test.ts** (5+ tests):
- GET returns all rules with status
- PATCH updates rule config
- PATCH toggles enabled/disabled
- POST creates new rule
- POST run triggers checks and returns results
- Run respects rate limit

### Lib Tests:

**alert-engine.test.ts** (8+ tests):
- DLQ depth check triggers when threshold exceeded
- DLQ depth check does not trigger below threshold
- No-orders check triggers for inactive tenant
- No-orders check does not trigger for tenant with recent orders
- Health grade drop check detects 2-level drop
- Cooldown prevents re-triggering within window
- routeAlertToAdmins creates notifications for eligible admins
- routeAlertToAdmins respects severity filter in preferences
- runAlertChecks processes all enabled rules

**slack-webhook.test.ts** (3+ tests):
- Formats Slack Block Kit payload correctly
- Skips when SLACK_ALERT_WEBHOOK_URL not set
- Swallows errors gracefully (fire-and-forget)

## ACCEPTANCE CRITERIA
- [ ] Migration runs clean (3 new tables + seed data)
- [ ] Alert engine checks run correctly for each rule type
- [ ] Cooldown prevents alert fatigue
- [ ] Notifications routed to correct admins based on preferences
- [ ] Notification bell shows unread count with polling
- [ ] Notification panel opens, shows notifications, marks as read on click
- [ ] Mark all read works
- [ ] Full notifications page with filters and bulk actions
- [ ] Alert rules page: view, edit, enable/disable, create, manual run
- [ ] Notification preferences: severity filter, active toggle
- [ ] Slack webhook sends formatted alerts when configured
- [ ] Scheduled job runs alert checks every 5 minutes
- [ ] Timeline events written when alerts fire
- [ ] All tests pass
- [ ] TypeScript strict — no `any` types
````

---

## SESSION 14: Admin Portal Polish + Operational Readiness

**Paste the context block, then paste this session.**

---

### Prompt

````
SESSION 14: Admin Portal Polish + Operational Readiness

This is Session 14 — the final session. In Sessions 11-13, we built:
- Session 11: Timeline view — tenant_timeline_events table, writer, hydrator, filterable feed, integrated into tenant detail
- Session 12: Onboarding workflow — templates, auto-detection engine, checklist UI, dashboard, auto-transition to active
- Session 13: Alerting — alert rules engine, admin_notifications system, notification bell + panel, Slack webhook, scheduled alert checks

Now build the dashboard home screen, keyboard shortcuts, dark mode support, error boundaries, loading skeletons, rate limiting, and operational tooling to make the admin portal production-ready.

## 1. DASHBOARD HOME SCREEN

### Page: apps/admin/src/app/(admin)/page.tsx (or /dashboard/page.tsx)

This is the landing page after login — the operational command center.

**Layout: 4-section grid**

### Section 1: Key Metrics Row (top)
- 4-6 metric cards in a horizontal row:
  - **Active Tenants**: count of tenants with status='active'
  - **Orders Today**: sum of orders created_at today across all tenants (from orders table or health snapshots)
  - **DLQ Depth**: total pending dead letters count
  - **Open Alerts**: count of unread notifications for current admin
  - **Tenants in Onboarding**: count with onboarding_status='in_progress'
  - **System Health**: percentage of tenants with health_grade A or B
- Each card: large number, label, trend indicator (↑↓ vs yesterday if available, or just static)
- Click any card → navigates to relevant page (tenants list, DLQ page, notifications, onboarding dashboard)

### Section 2: Alerts + Notifications Feed (left column, ~60% width)
- "Recent Alerts" panel showing latest 10 notifications for current admin
- Compact format: severity dot, title, tenant name, relative time
- Click → navigates to linkUrl
- "View all →" footer link

### Section 3: My Assigned Tenants (right column, ~40% width)
- List of tenants where the current admin is assigned as implementation_specialist (from tenant_onboarding_checklists.assigned_admin_id)
- Shows: tenant name, industry badge, onboarding progress bar, last activity
- Empty state: "No tenants assigned to you"
- If current admin is super_admin/platform_engineer, show "Recent Tenants" instead (last 5 tenants the admin viewed/acted on, from platform_admin_audit_log)

### Section 4: Quick Actions Bar (bottom)
- Horizontal bar with quick action buttons:
  - "Search" (opens Cmd+K palette from Session 10)
  - "View DLQ" → /dlq
  - "System Health" → /health
  - "Run Alert Check" → fires manual alert check (if user has config.manage)
  - "Onboarding" → /onboarding

### API Route: GET /api/v1/dashboard/stats
- Returns all metrics for Section 1 in a single call (efficient, not N+1)
- Uses subqueries or CTEs for each metric
- Cached for 60 seconds (in-memory LRU — metrics don't need real-time precision)
- Protected by: authenticated admin

### API Route: GET /api/v1/dashboard/assigned-tenants
- Returns tenants assigned to current admin (or recent tenants for super_admins)
- Protected by: authenticated admin

## 2. KEYBOARD SHORTCUTS

Create apps/admin/src/hooks/use-keyboard-shortcuts.ts:

```typescript
interface ShortcutConfig {
  key: string;        // e.g. 'k', 'Escape', '/'
  metaKey?: boolean;  // Cmd on Mac, Ctrl on Windows
  ctrlKey?: boolean;
  shiftKey?: boolean;
  handler: () => void;
  description: string;
  scope?: 'global' | 'page'; // global = works anywhere, page = works on specific pages
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void { ... }
export function useGlobalShortcuts(): void { ... } // registers the global shortcuts below
```

### Global Shortcuts (active everywhere):
| Shortcut | Action | Description |
|---|---|---|
| `Cmd+K` | Open command palette | Quick search (from Session 10) |
| `Cmd+/` | Open shortcuts help | Shows shortcut reference sheet |
| `G then H` | Go to Home/Dashboard | Vim-style navigation |
| `G then T` | Go to Tenants | |
| `G then U` | Go to Users | |
| `G then D` | Go to DLQ | |
| `G then O` | Go to Onboarding | |
| `G then A` | Go to Audit Log | |
| `G then S` | Go to Settings | |
| `Escape` | Close modal/panel | Close any open modal, panel, or command palette |

### Sequence Key Handler
For `G then X` shortcuts, implement a sequence detection:
- On `G` keypress, start a 500ms timer
- If a valid second key arrives within 500ms, execute the navigation
- If timer expires or invalid key, cancel

### ShortcutHelpModal.tsx
- Modal showing all available shortcuts in a formatted table
- Grouped by: Navigation, Actions, Panels
- Triggered by `Cmd+/` or a "?" button in the footer

### Integration
- Call `useGlobalShortcuts()` in the admin layout component
- Shortcuts should NOT fire when focus is in input/textarea/contenteditable elements

## 3. DARK MODE

The OppsEra web app already uses an inverted gray scale pattern for dark mode (globals.css). Ensure the admin app follows the same pattern.

### Setup
1. Verify apps/admin/src/app/globals.css has the same inverted gray scale as apps/web
2. If not, add it:

```css
/* Dark mode: inverted gray scale */
@media (prefers-color-scheme: dark) {
  :root {
    /* Swap gray scale */
    --color-surface: #1a1a2e;
    --color-surface-secondary: #16213e;
    --color-text-primary: #e0e0e0;
    --color-text-secondary: #a0a0a0;
    --color-border: #2a2a4a;
  }
}

.bg-surface { background-color: var(--color-surface); }
```

3. Add a manual dark mode toggle (in addition to system preference):

Create apps/admin/src/hooks/use-theme.ts:
```typescript
type Theme = 'light' | 'dark' | 'system';
export function useTheme() {
  // Returns: { theme, setTheme, resolvedTheme }
  // Persists choice to localStorage
  // 'system' follows prefers-color-scheme
  // Adds 'dark' class to <html> element when dark mode active
}
```

### ThemeToggle.tsx
- 3-way toggle or dropdown: Light (Sun icon), Dark (Moon icon), System (Monitor icon)
- Place in the admin header bar, next to notification bell
- Smooth transition between themes (transition-colors on body)

### Audit All Components
Review all components built in Sessions 1-13 and ensure they use theme-aware patterns:
- Replace any `bg-white` with `bg-surface`
- Replace any `text-black` or `text-gray-900` with `text-gray-900 dark:text-gray-100` OR use CSS variables
- Replace any `border-gray-200` with `border-gray-200 dark:border-gray-700` or CSS variable
- Ensure all badges, cards, modals, dropdowns, and tables work in both modes
- Opacity-based colors (like `bg-red-500/10`) already work in both modes

List the specific files that need updates and make the changes. This is a sweep across the entire admin app — be thorough.

## 4. ERROR BOUNDARIES

### GlobalErrorBoundary.tsx
- Wraps the entire admin layout
- Catches unhandled React errors
- Shows: "Something went wrong" message, error details (in dev mode), "Reload page" button, "Go to Dashboard" link
- Logs error to console (and optionally to an error reporting service)

### PageErrorBoundary.tsx
- Wraps individual page content (not the layout/sidebar)
- Shows: "This page encountered an error" with retry button
- Does NOT crash the sidebar or navigation

### ErrorFallback.tsx (reusable)
- Props: { error, resetFn, title?, message? }
- Styled card with error icon, title, message, action button
- Works in both light and dark mode

### Integration
- Wrap admin layout children with `<GlobalErrorBoundary>`
- Wrap each page component with `<PageErrorBoundary>`

## 5. EMPTY STATES

Create apps/admin/src/components/EmptyState.tsx:

```typescript
interface EmptyStateProps {
  icon: LucideIcon;    // Icon component
  title: string;       // "No tenants found"
  description?: string; // "Try adjusting your filters"
  action?: {
    label: string;     // "Clear filters"
    onClick: () => void;
  };
}
```

- Centered content with muted icon, title, description, optional action button
- Consistent design across all list pages

Audit all list pages/tables and ensure they use EmptyState when data is empty:
- Tenant list (no results)
- Admin list (no results)
- DLQ list (empty — great! show success message)
- User search (no results)
- Timeline (no events match filters)
- Onboarding dashboard (no tenants in onboarding — show success)
- Notifications (no notifications — show "All caught up!")
- Audit log (no entries match filters)
- Financial views (no orders/chargebacks match)

## 6. LOADING SKELETONS

Create apps/admin/src/components/skeletons/:

### TableSkeleton.tsx
- Props: { rows?: number, columns?: number }
- Renders pulsing gray rows matching table structure
- Animated shimmer effect

### CardSkeleton.tsx
- Props: { count?: number, layout?: 'grid' | 'list' }
- Renders pulsing card placeholders

### DetailPageSkeleton.tsx
- Header card skeleton + tabs skeleton + content area skeleton
- Matches tenant detail page layout

### DashboardSkeleton.tsx
- Metric cards row + two-column layout skeleton
- Matches dashboard layout

### TimelineSkeleton.tsx
- Timeline rail + event card placeholders
- 3-5 pulsing cards with left gutter dots

### Integration
- Replace every `isLoading ? <div>Loading...</div>` pattern with the appropriate skeleton
- Skeleton should match the shape of the real content as closely as possible

## 7. BULK OPERATIONS CONFIRMATION

Create apps/admin/src/components/BulkOperationModal.tsx:

For DLQ bulk retry, bulk notification dismiss, etc.:

```typescript
interface BulkOperationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  itemCount: number;
  severity?: 'normal' | 'warning' | 'danger';
  confirmLabel?: string;
  requireConfirmText?: string; // If set, user must type this text to confirm (for dangerous ops)
}
```

- Shows: title, description, "This will affect X items" count
- For danger severity: red styling, requires typing confirmation text (e.g., "RETRY ALL")
- Loading state on confirm button while operation runs
- Success/error toast after completion

### Integration
Audit existing bulk operations and wire them through BulkOperationModal:
- DLQ bulk retry (from Session 5)
- DLQ bulk discard
- Notifications mark all read (Session 13)
- Any future bulk operations

## 8. RESPONSIVE LAYOUT

The admin portal is desktop-first but should not break on tablet.

### Breakpoints
- Desktop (default): full layout with sidebar
- Tablet (< 1024px): collapsible sidebar, slightly condensed tables
- Mobile (< 768px): sidebar becomes overlay/drawer, single-column layout

### AdminLayout Updates
- Sidebar: collapsible on tablet/mobile with hamburger menu button
- Main content: uses `max-w-screen-2xl mx-auto` for very wide screens
- Tables: horizontal scroll wrapper on small screens
- Dashboard: stack columns vertically on tablet
- Modals: full-screen on mobile, centered on desktop

## 9. BACKEND — RATE LIMITING ON SENSITIVE ENDPOINTS

Using the existing rate limiter from packages/core/src/security/rate-limiter.ts:

Apply rate limiting to these admin endpoints:

| Endpoint | Limit | Window |
|---|---|---|
| POST /api/v1/tenants/[id]/suspend | 5 | 15 min |
| POST /api/v1/tenants/[id]/reactivate | 5 | 15 min |
| POST /api/v1/admins/invite | 10 | 15 min |
| POST /api/v1/impersonation/start | 10 | 15 min |
| POST /api/v1/alerts/run | 1 | 2 min |
| POST /api/v1/tenants/[id]/timeline/hydrate | 1 per tenant | 5 min |
| DELETE /api/v1/tenants/[id]/notes/[noteId] | 20 | 15 min |

Create a reusable middleware wrapper:

```typescript
export function withRateLimit(
  handler: AdminRouteHandler,
  config: { limit: number; windowMinutes: number; keyPrefix: string }
): AdminRouteHandler {
  return async (req, context) => {
    const adminId = context.session.adminId;
    const key = `${config.keyPrefix}:${adminId}`;
    const result = checkRateLimit(key, config.limit, config.windowMinutes * 60 * 1000);
    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: result.retryAfterMs / 1000 },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) } }
      );
    }
    return handler(req, context);
  };
}
```

## 10. BACKEND — REQUEST LOGGING

Create apps/admin/src/lib/admin-request-logger.ts:

Middleware that logs every admin API request:

```typescript
export function withRequestLogging(handler: AdminRouteHandler): AdminRouteHandler {
  return async (req, context) => {
    const start = Date.now();
    const response = await handler(req, context);
    const duration = Date.now() - start;

    // Fire-and-forget log to platform_admin_audit_log or a separate request_log
    void logAdminRequest({
      adminId: context.session?.adminId,
      method: req.method,
      path: new URL(req.url).pathname,
      statusCode: response.status,
      durationMs: duration,
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return response;
  };
}
```

- Logs method, path, admin ID, status code, duration, IP, user agent
- Fire-and-forget (never blocks the response)
- Can log to `request_log` table or `platform_admin_audit_log` with action='api_request'

## 11. BACKEND — HEALTH CHECK ENDPOINT

### GET /api/v1/admin/health (public — no auth required)

Returns:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-02-23T20:00:00Z",
  "checks": {
    "database": { "status": "healthy", "latencyMs": 5 },
    "jobWorker": { "status": "healthy", "lastRunAt": "2026-02-23T19:55:00Z" }
  }
}
```

- Database check: simple `SELECT 1` query with timeout
- Job worker check: verify last alert check ran within expected interval
- Returns 200 if all healthy, 503 if any check fails
- No auth required — designed for uptime monitoring services

## 12. SEED SCRIPT FOR DEMO/STAGING

Create tools/scripts/seed-admin-portal.ts:

A comprehensive seed script that populates the admin portal with realistic demo data:

```typescript
// Run with: npx tsx tools/scripts/seed-admin-portal.ts

async function seedAdminPortal() {
  // 1. Create 3 demo platform admins (if not exists):
  //    - "Alex Chen" (super_admin)
  //    - "Jordan Smith" (implementation_specialist)
  //    - "Casey Brown" (support_agent)

  // 2. Create 5 demo tenants across industries:
  //    - "Sunset Golf & Grill" (golf, active, health_score: 92)
  //    - "Bella Cucina" (restaurant, active, health_score: 78)
  //    - "Metro Style Boutique" (retail, in_progress onboarding, health_score: 45)
  //    - "Harbor View Hotel" (hotel, active, health_score: 88)
  //    - "Test Tenant Suspended" (general, suspended, health_score: 20)

  // 3. Apply onboarding templates to the in_progress tenant
  //    - Complete some steps, leave others pending

  // 4. Create 10-20 support notes across tenants

  // 5. Create 50+ timeline events across tenants (mix of types and severities)

  // 6. Create some admin_notifications for the demo admins

  // 7. Create 5-10 DLQ entries for the low-health tenants

  // 8. Seed tenant_health_snapshots for the demo tenants (last 7 days)

  // 9. Set up notification preferences for demo admins
}
```

- Uses ULID generation for all IDs
- Idempotent (uses INSERT ... ON CONFLICT DO NOTHING where possible)
- Logs progress to console
- Can be run multiple times safely

## 13. TESTS

### Dashboard Tests:

**dashboard-stats.test.ts** (4+ tests):
- Returns all metrics in single response
- Counts active tenants correctly
- Counts DLQ depth correctly
- Returns assigned tenants for current admin

### Utility Tests:

**keyboard-shortcuts.test.ts** (4+ tests):
- Registers and fires shortcut handlers
- Does not fire when input is focused
- Sequence keys (G then T) work within timeout
- Sequence cancelled after timeout

**use-theme.test.ts** (3+ tests):
- Defaults to system theme
- Persists theme choice
- Applies dark class to html element

**rate-limit-middleware.test.ts** (3+ tests):
- Allows requests within limit
- Returns 429 when limit exceeded
- Returns correct Retry-After header

**health-check.test.ts** (3+ tests):
- Returns healthy when DB responds
- Returns 503 when DB fails
- Includes latency measurement

### Component Tests:

**EmptyState.test.tsx** (2+ tests):
- Renders title and description
- Renders action button when provided

**BulkOperationModal.test.tsx** (3+ tests):
- Shows item count
- Requires confirmation text for danger severity
- Calls onConfirm and closes on success

## ACCEPTANCE CRITERIA
- [ ] Dashboard home page shows key metrics, alerts feed, assigned tenants, quick actions
- [ ] Dashboard metrics load in a single API call (not N+1)
- [ ] Keyboard shortcuts work: Cmd+K (search), Cmd+/ (help), G→T/U/D/O/A/S (navigation)
- [ ] Shortcuts don't fire when typing in inputs
- [ ] Shortcut help modal shows all available shortcuts
- [ ] Dark mode toggle works (light/dark/system)
- [ ] All components render correctly in dark mode (no invisible text, no white backgrounds)
- [ ] GlobalErrorBoundary catches unhandled errors without crashing layout
- [ ] PageErrorBoundary catches page-level errors with retry
- [ ] Every list page has EmptyState when no data
- [ ] Every list page has loading skeletons (not "Loading..." text)
- [ ] BulkOperationModal used for all destructive bulk actions
- [ ] Responsive: sidebar collapses on tablet, tables scroll horizontally
- [ ] Rate limiting applied to sensitive endpoints with correct limits
- [ ] Request logging captures all admin API calls
- [ ] Health check endpoint returns 200/503 correctly
- [ ] Seed script creates realistic demo data across all features
- [ ] All tests pass
- [ ] TypeScript strict — no `any` types

## 🎉 ADMIN PORTAL V1 COMPLETE

After this session, you should have a fully functional SuperAdmin portal with:
- Tenant management (list, detail, suspend, reactivate, notes, onboarding)
- Admin RBAC (6 roles, granular permissions, invite flow)
- Impersonation (with safety controls and audit)
- Module provisioning (entitlements, feature flags, industry templates)
- DLQ management (view, retry, discard, bulk ops)
- User management (global search, lock/unlock, password reset, session revoke)
- System health dashboard (per-tenant health grades, system metrics)
- Financial support views (read-only order/payment/GL investigation)
- Audit log viewer (admin + tenant scoped, CSV export)
- Global search (Cmd+K command palette)
- Support timeline (unified chronological feed per tenant)
- Onboarding workflow (templates, auto-detection, progress tracking)
- Alert system (rule-based, with in-app + Slack notifications)
- Dashboard home (key metrics, alerts, assigned tenants)
- Keyboard shortcuts, dark mode, error boundaries, loading skeletons
- Rate limiting, request logging, health check, seed data

Total: 14 sessions, 3 phases, production-ready.
````

---

## Appendix: Session Dependency Map

```
Phase 1 (Core Spine):
  Session 1: Tenant Model ──→ Session 2: RBAC ──→ Session 3: Impersonation
                          └──→ Session 4: Modules
                          └──→ Session 5: DLQ
                          └──→ Session 6: User Management

Phase 2 (Observability):
  Session 7: Health Dashboard (depends on Phase 1)
  Session 8: Financial Views (depends on Phase 1)
  Session 9: Audit Log (depends on Sessions 1-6)
  Session 10: Global Search (depends on Sessions 1-6)

Phase 3 (Intelligence + Polish):
  Session 11: Timeline (depends on Sessions 1-10)
  Session 12: Onboarding (depends on Sessions 1, 11)
  Session 13: Alerting (depends on Sessions 5, 7, 11, 12)
  Session 14: Polish (depends on all previous)
```
