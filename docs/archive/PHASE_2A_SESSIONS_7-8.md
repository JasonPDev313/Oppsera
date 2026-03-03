# OppsEra SuperAdmin Build — Phase 2A (Sessions 7–8)

## CONTEXT FOR CLAUDE

You are continuing the build of the **OppsEra Enterprise SuperAdmin Portal**. Phase 1 (Sessions 1–6) is complete. Here is what already exists.

### Tech Stack
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend**: Node.js / TypeScript modular monolith
- **Database**: PostgreSQL with RLS, ULID identifiers
- **Auth**: JWT-based, platform_admins table (separate from tenant users)
- **Architecture**: Modular monolith — apps/admin imports only from `shared`, `db`, `core`

### What Already Exists (from Phase 1, Sessions 1–6)

**Database (created in Phase 1):**
- Extended `tenants` table (industry, onboarding_status, health_grade, contacts, metadata, activated_at, suspended_at, total_locations, total_users, last_activity_at)
- `tenant_onboarding_checklists` — step tracking per tenant
- `superadmin_support_notes` — internal notes on tenants
- `onboarding_step_templates` — industry-specific step seeds
- `impersonation_sessions` — impersonation tracking with expiry
- `tenant_feature_flags` + `feature_flag_definitions` — granular feature toggles
- `dead_letter_retry_log` — retry attempt tracking for DLQ
- RBAC roles seeded: super_admin, platform_engineer, implementation_specialist, support_agent, finance_support, viewer
- Full permission matrix in `platform_admin_role_permissions`

**Backend (created in Phase 1):**
- Tenant CRUD + lifecycle APIs (create, activate, suspend, reactivate)
- Onboarding checklist + support notes APIs
- Permission middleware (`requirePermission({ module, action })`)
- Admin management APIs (list, invite, role assignment, deactivate)
- Impersonation APIs (start, end, history) with JWT minting + expiry job
- Module provisioning APIs (enable/disable, apply template, prerequisite validation)
- Feature flag toggle APIs
- DLQ APIs (list, stats, detail, retry, discard, batch operations)
- Cross-tenant user management APIs (search, lock, unlock, reset password, reset MFA, revoke sessions)
- API key management per tenant

**Frontend (created in Phase 1):**
- Admin portal shell (sidebar nav, layout, routing, breadcrumbs)
- Tenant list page with filters + pagination
- Tenant detail page with tabs (overview, modules, users, onboarding, notes)
- Admin management pages (list, invite, roles)
- Impersonation dialog + banner in tenant app + history log
- Capability matrix page (tenants × modules grid)
- DLQ dashboard + detail panel + batch operations
- User search + detail panel + security actions
- API key management section

### Existing Schema Tables You'll Query in Phase 2 (already exist in production)

```sql
-- Orders (EXISTS)
orders (id, tenant_id, location_id, order_number, order_type, status, subtotal, tax_total, total, tip_total, discount_total, void_reason, voided_by, business_date, created_at, closed_at, customer_id, server_user_id, ...)

-- Order lines (EXISTS)
order_lines (id, order_id, tenant_id, catalog_item_id, item_name, quantity, unit_price, line_total, void_reason, voided_by, ...)

-- Tenders / payments (EXISTS)
tenders (id, order_id, tenant_id, tender_type, amount, tip_amount, reference_number, auth_code, card_brand, last_four, status, ...)

-- Tender reversals (EXISTS)
tender_reversals (id, tender_id, tenant_id, reversal_type, amount, reason, reversed_by, ...)

-- GL Journal (EXISTS)
gl_journal_entries (id, tenant_id, location_id, entry_date, source_type, source_id, status, posted_at, ...)
gl_journal_lines (id, journal_entry_id, tenant_id, account_id, debit, credit, description, ...)
gl_unmapped_events (id, tenant_id, event_type, event_data, reason, ...)

-- Close batches (EXISTS)
fnb_close_batches (id, tenant_id, location_id, business_date, status, opened_at, closed_at, ...)
retail_close_batches (id, tenant_id, location_id, business_date, status, opened_at, closed_at, ...)

-- Chargebacks (EXISTS)
chargebacks (id, tenant_id, tender_id, amount, reason_code, status, received_at, due_date, ...)

-- Vouchers (EXISTS)
vouchers (id, tenant_id, code, voucher_type, original_amount, current_balance, status, ...)

-- System health (EXISTS)
system_health_snapshots (id, captured_at, connection_count, max_connections, cache_hit_pct, total_db_size_bytes, ...)
alert_log (id, level, title, details, tenant_id, context, sent_at, channel)
request_log (id, tenant_id, method, path, status_code, duration_ms, user_id, ...)
```

---

## SESSION 7: System Health Dashboard + Tenant Health Scoring

### Objective
Build the system-wide health dashboard and per-tenant health scoring system. This is the "mission control" screen that ops teams will have open on a monitor all day. It answers: "Is anything broken right now? Which tenants need attention?"

### 7.1 — Database Migration

#### Migration: Create tenant_health_snapshots

```sql
CREATE TABLE public.tenant_health_snapshots (
  id text NOT NULL DEFAULT gen_ulid(),
  tenant_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),

  -- Activity metrics
  orders_24h integer NOT NULL DEFAULT 0,
  active_users_24h integer NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  last_login_at timestamptz,

  -- Error metrics
  error_count_24h integer NOT NULL DEFAULT 0,
  error_count_1h integer NOT NULL DEFAULT 0,
  dlq_depth integer NOT NULL DEFAULT 0,
  dlq_unresolved_over_24h integer NOT NULL DEFAULT 0,

  -- System metrics
  background_job_failures_24h integer NOT NULL DEFAULT 0,
  integration_error_count_24h integer NOT NULL DEFAULT 0,
  avg_response_time_ms numeric(10,2),
  p95_response_time_ms numeric(10,2),

  -- GL / Financial health
  unposted_gl_entries integer NOT NULL DEFAULT 0,
  unmapped_gl_events integer NOT NULL DEFAULT 0,
  open_close_batches integer NOT NULL DEFAULT 0,

  -- Computed grade
  health_grade text NOT NULL DEFAULT 'A'
    CHECK (health_grade IN ('A', 'B', 'C', 'D', 'F')),
  health_score integer NOT NULL DEFAULT 100,
  grade_factors jsonb NOT NULL DEFAULT '[]',

  CONSTRAINT tenant_health_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_health_snapshots_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

-- Index for latest snapshot per tenant
CREATE INDEX idx_tenant_health_snapshots_latest
  ON tenant_health_snapshots(tenant_id, captured_at DESC);

-- Index for querying by grade
CREATE INDEX idx_tenant_health_snapshots_grade
  ON tenant_health_snapshots(health_grade, captured_at DESC);

-- Partition hint: if scale warrants it later, partition by captured_at month
-- For V1 with ~1,000 tenants at 15-min intervals, keep 7 days = ~672K rows, manageable without partitioning
```

#### Migration: Create system_metrics_snapshots

```sql
CREATE TABLE public.system_metrics_snapshots (
  id text NOT NULL DEFAULT gen_ulid(),
  captured_at timestamptz NOT NULL DEFAULT now(),

  -- Global activity
  total_orders_today integer NOT NULL DEFAULT 0,
  total_orders_1h integer NOT NULL DEFAULT 0,
  active_tenants_today integer NOT NULL DEFAULT 0,
  active_users_today integer NOT NULL DEFAULT 0,

  -- Error rates
  total_errors_1h integer NOT NULL DEFAULT 0,
  total_dlq_depth integer NOT NULL DEFAULT 0,
  total_dlq_unresolved integer NOT NULL DEFAULT 0,

  -- System resources (from existing system_health_snapshots)
  db_connection_count integer,
  db_max_connections integer,
  db_cache_hit_pct numeric(5,2),
  db_size_bytes bigint,

  -- Background jobs
  queued_jobs integer NOT NULL DEFAULT 0,
  failed_jobs_1h integer NOT NULL DEFAULT 0,
  stuck_consumers integer NOT NULL DEFAULT 0,

  -- Tenants by grade
  tenants_grade_a integer NOT NULL DEFAULT 0,
  tenants_grade_b integer NOT NULL DEFAULT 0,
  tenants_grade_c integer NOT NULL DEFAULT 0,
  tenants_grade_d integer NOT NULL DEFAULT 0,
  tenants_grade_f integer NOT NULL DEFAULT 0,

  CONSTRAINT system_metrics_snapshots_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_system_metrics_snapshots_captured
  ON system_metrics_snapshots(captured_at DESC);
```

### 7.2 — Backend: Health Scoring Job

Create a scheduled job that runs every 15 minutes:

```typescript
// Pseudo-code for health scoring algorithm
async function captureHealthSnapshots() {
  const tenants = await db.query(`
    SELECT id FROM tenants WHERE status = 'active'
  `);

  for (const tenant of tenants.rows) {
    const snapshot = await computeTenantHealth(tenant.id);
    await insertHealthSnapshot(snapshot);
    await updateTenantHealthGrade(tenant.id, snapshot.health_grade);
  }

  // Also capture system-wide metrics
  await captureSystemMetrics();
}

async function computeTenantHealth(tenantId: string) {
  // Collect raw metrics via parallel queries
  const [orders, users, errors, dlq, glIssues, jobs] = await Promise.all([
    countOrders24h(tenantId),
    countActiveUsers24h(tenantId),
    countErrors24h(tenantId),
    countDLQDepth(tenantId),
    countGLIssues(tenantId),
    countJobFailures24h(tenantId),
  ]);

  // Score: start at 100, deduct for issues
  let score = 100;
  const factors: { factor: string; impact: number; detail: string }[] = [];

  // DLQ depth (high impact)
  if (dlq.depth > 20) {
    const impact = -25;
    score += impact;
    factors.push({ factor: 'dlq_critical', impact, detail: `${dlq.depth} unresolved dead letters` });
  } else if (dlq.depth > 5) {
    const impact = -10;
    score += impact;
    factors.push({ factor: 'dlq_elevated', impact, detail: `${dlq.depth} unresolved dead letters` });
  }

  // Unresolved DLQ over 24h (very high impact)
  if (dlq.unresolvedOver24h > 0) {
    const impact = -15;
    score += impact;
    factors.push({ factor: 'dlq_stale', impact, detail: `${dlq.unresolvedOver24h} DLQ items older than 24h` });
  }

  // Error rate spike (compare to baseline)
  if (errors.count1h > 50) {
    const impact = -20;
    score += impact;
    factors.push({ factor: 'error_spike', impact, detail: `${errors.count1h} errors in last hour` });
  } else if (errors.count1h > 10) {
    const impact = -10;
    score += impact;
    factors.push({ factor: 'error_elevated', impact, detail: `${errors.count1h} errors in last hour` });
  }

  // GL issues
  if (glIssues.unmappedEvents > 0) {
    const impact = -10;
    score += impact;
    factors.push({ factor: 'gl_unmapped', impact, detail: `${glIssues.unmappedEvents} unmapped GL events` });
  }
  if (glIssues.unpostedEntries > 5) {
    const impact = -10;
    score += impact;
    factors.push({ factor: 'gl_unposted', impact, detail: `${glIssues.unpostedEntries} unposted GL entries` });
  }

  // Inactivity (for tenants that should be active)
  if (orders.last_order_at && isOlderThan(orders.last_order_at, '24h')) {
    const impact = -5;
    score += impact;
    factors.push({ factor: 'inactive', impact, detail: 'No orders in 24 hours' });
  }

  // Background job failures
  if (jobs.failures > 5) {
    const impact = -10;
    score += impact;
    factors.push({ factor: 'job_failures', impact, detail: `${jobs.failures} background job failures` });
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Map to grade
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  return {
    tenant_id: tenantId,
    orders_24h: orders.count24h,
    active_users_24h: users.count,
    last_order_at: orders.last_order_at,
    last_login_at: users.last_login_at,
    error_count_24h: errors.count24h,
    error_count_1h: errors.count1h,
    dlq_depth: dlq.depth,
    dlq_unresolved_over_24h: dlq.unresolvedOver24h,
    background_job_failures_24h: jobs.failures,
    unposted_gl_entries: glIssues.unpostedEntries,
    unmapped_gl_events: glIssues.unmappedEvents,
    open_close_batches: glIssues.openBatches,
    health_grade: grade,
    health_score: score,
    grade_factors: factors,
  };
}
```

**Health grade data queries (implement these):**

```sql
-- Orders in last 24h
SELECT COUNT(*) as count_24h,
       MAX(created_at) as last_order_at
FROM orders
WHERE tenant_id = $1 AND created_at > now() - interval '24 hours';

-- Active users in 24h
SELECT COUNT(DISTINCT user_id) as count,
       MAX(last_login_at) as last_login_at
FROM users
WHERE tenant_id = $1 AND last_login_at > now() - interval '24 hours';

-- Errors in 1h and 24h (from request_log or any error tracking)
SELECT
  COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour') as count_1h,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') as count_24h
FROM request_log
WHERE tenant_id = $1 AND status_code >= 500;

-- DLQ depth
SELECT
  COUNT(*) FILTER (WHERE status = 'failed') as depth,
  COUNT(*) FILTER (WHERE status = 'failed' AND first_failed_at < now() - interval '24 hours') as unresolved_over_24h
FROM event_dead_letters
WHERE tenant_id = $1;

-- GL issues
SELECT
  (SELECT COUNT(*) FROM gl_journal_entries WHERE tenant_id = $1 AND status = 'pending') as unposted_entries,
  (SELECT COUNT(*) FROM gl_unmapped_events WHERE tenant_id = $1) as unmapped_events,
  (SELECT COUNT(*) FROM fnb_close_batches WHERE tenant_id = $1 AND status = 'open' AND business_date < CURRENT_DATE) +
  (SELECT COUNT(*) FROM retail_close_batches WHERE tenant_id = $1 AND status = 'open' AND business_date < CURRENT_DATE) as open_batches;
```

### 7.3 — Backend: Health Dashboard API

```
GET  /api/admin/health/dashboard                — System-wide metrics snapshot
  Returns: {
    system: { latest system_metrics_snapshot },
    trend: { last 24 snapshots (6 hours at 15-min intervals) for sparkline },
    alerts: { last 20 from alert_log },
    tenantsByGrade: { A: N, B: N, C: N, D: N, F: N },
    topIssues: [{ tenant_id, tenant_name, grade, top_factor }]
  }

GET  /api/admin/health/tenants                  — All tenants with latest health snapshot
  Filters: health_grade, has_dlq_issues, has_gl_issues, inactive
  Sort: health_score, dlq_depth, error_count_1h, tenant_name

GET  /api/admin/health/tenants/:id/history      — Health history for single tenant
  Returns: last 7 days of snapshots (one per 15 min = ~672 records)
  Used for: trend charts on tenant detail

GET  /api/admin/health/alerts                   — Recent alerts
  Filters: level (critical, warning, info), tenant_id, date_range
  Source: alert_log table
```

### 7.4 — Frontend: System Health Dashboard

**Route:** `/admin/health`

```
┌──────────────────────────────────────────────────────────────────────┐
│  System Health                                   Last updated: 2m ago│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐           │
│  │   1,247   │ │    142    │ │    47     │ │    3      │           │
│  │Orders Today│ │Active Now │ │  DLQ Depth│ │ Alerts    │           │
│  │  ▁▃▅▇▆▅▃ │ │  ▂▄▆▇▅▃▂ │ │  ▅▆▇▆▄▃▁ │ │  🔴2 🟡1  │           │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘           │
│                                                                      │
│  ── Tenant Health Distribution ──                                   │
│  A ████████████████████████████████████████ 38                      │
│  B ██████████████████████ 22                                        │
│  C ███████ 7                                                        │
│  D ███ 3                                                            │
│  F █ 1                                                              │
│                                                                      │
│  ── Tenants Needing Attention ──                    [View All →]    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🔴 F │ Harbor Marina     │ DLQ: 23 │ Errors: 45/hr          │   │
│  │       │ Factors: dlq_critical (-25), error_spike (-20),      │   │
│  │       │          gl_unmapped (-10)                            │   │
│  ├───────┼──────────────────┼─────────┼──────────────────────────│   │
│  │ 🟠 D │ Grand Hotel      │ DLQ: 8  │ Errors: 12/hr           │   │
│  │       │ Factors: dlq_elevated (-10), error_elevated (-10),   │   │
│  │       │          dlq_stale (-15)                              │   │
│  ├───────┼──────────────────┼─────────┼──────────────────────────│   │
│  │ 🟠 D │ Valley Retail    │ DLQ: 2  │ Errors: 52/hr           │   │
│  │       │ Factors: error_spike (-20), gl_unposted (-10),       │   │
│  │       │          job_failures (-10)                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ── System Resources ──                                             │
│  DB Connections: 45 / 200 (22%)  █████░░░░░░░░░░░░░░░               │
│  Cache Hit Rate: 98.7%           ████████████████████░               │
│  DB Size: 12.4 GB                                                   │
│                                                                      │
│  ── Recent Alerts ──                                                │
│  🔴 CRITICAL  Harbor Marina: DLQ depth exceeds 20       2 min ago   │
│  🟡 WARNING   Valley Retail: Error rate spike (52/hr)   15 min ago  │
│  🟡 WARNING   Grand Hotel: DLQ items older than 24h     1 hr ago    │
│  🔵 INFO      System health snapshot captured           15 min ago  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Components:**
- `HealthDashboardPage` — main container with auto-refresh (every 60 seconds)
- `SystemMetricsBar` — 4 key metric cards with sparkline trend charts
- `TenantHealthDistribution` — horizontal bar chart showing count per grade
- `TenantsNeedingAttention` — sorted list of D/F grade tenants with factor breakdown
- `SystemResourcesPanel` — DB connections, cache hit rate, DB size progress bars
- `AlertFeed` — chronological list of recent alerts with severity icons
- `SparklineChart` — reusable tiny chart component (use recharts `<AreaChart>` with minimal chrome)
- `HealthGradePill` — colored pill: A=green, B=blue, C=yellow, D=orange, F=red

**Auto-refresh behavior:**
- Page polls `/api/admin/health/dashboard` every 60 seconds
- Sparklines show last 6 hours of data
- Alert feed shows last 20 alerts
- "Last updated: Xm ago" indicator in header

### 7.5 — Frontend: Tenant Health Detail (Enhancement to Tenant Detail)

Add to the existing Tenant Detail page's Overview tab:

```
┌──────────────────────────────────────────────────────────┐
│  Health: B (score: 78)                                    │
│                                                           │
│  ── Score Factors ──                                     │
│  ⬇ dlq_elevated (-10): 8 unresolved dead letters        │
│  ⬇ gl_unmapped (-10): 3 unmapped GL events              │
│  ⬇ inactive (-5): No orders in 24 hours                 │
│                                                           │
│  ── 7-Day Health Trend ──                                │
│  A ─────────╮                                            │
│  B          ╰──────────╮    ╭──── current                │
│  C                     ╰────╯                            │
│  D                                                       │
│  F                                                       │
│    Mon  Tue  Wed  Thu  Fri  Sat  Sun                     │
│                                                           │
│  ── Key Metrics ──                                       │
│  Orders (24h): 47          Errors (1h): 3                │
│  Active Users (24h): 12    DLQ Depth: 8                  │
│  Unposted GL: 0            Open Batches: 1               │
└──────────────────────────────────────────────────────────┘
```

**Components:**
- `TenantHealthCard` — score, grade, factors list
- `HealthTrendChart` — 7-day line chart of health_score (use recharts `<LineChart>`)
- `TenantMetricsGrid` — 2×3 grid of key metric cards

### 7.6 — Backend: Cleanup Job

```typescript
// Daily cleanup: remove health snapshots older than 30 days
async function cleanupOldSnapshots() {
  await db.query(`
    DELETE FROM tenant_health_snapshots
    WHERE captured_at < now() - interval '30 days'
  `);

  await db.query(`
    DELETE FROM system_metrics_snapshots
    WHERE captured_at < now() - interval '30 days'
  `);
}
```

### 7.7 — Tests

**Backend:**
- Health scoring: score=100 with no issues, correct deductions for each factor
- Health scoring: grade mapping (A≥90, B≥75, C≥60, D≥40, F<40)
- Health scoring: factors array correctly describes each deduction
- Health snapshot capture: creates records for all active tenants
- System metrics capture: correct aggregation across tenants
- Dashboard API: returns correct structure with trends
- Tenant health history: returns correct date range of snapshots
- Cleanup job: removes only records older than 30 days

**Frontend:**
- Dashboard renders all sections with loading states
- Sparklines render from trend data
- Tenants needing attention sorted by grade (worst first)
- Alert feed shows correct severity icons
- Auto-refresh updates data without full page reload
- Tenant health card on detail page shows factors
- Health trend chart renders 7-day history

---

## SESSION 8: Financial Support Views

### Objective
Build read-only financial investigation tools. Support agents and finance team members use these daily to answer questions like "Where's my payment?", "Why was this order voided?", "Why didn't this post to GL?", and "What's the status of this chargeback?" This is purely investigative — no mutations.

### 8.1 — Backend: Financial Investigation API

No new tables. These are read-only queries against existing financial tables.

```
GET  /api/admin/finance/orders                    — Search orders across tenants
  Filters: tenant_id, location_id, order_number, status, order_type,
           business_date_from, business_date_to, amount_min, amount_max,
           customer_id, server_user_id, has_voids, has_refunds
  Sort: created_at, total, order_number
  Pagination: page, limit

GET  /api/admin/finance/orders/:id                — Full order detail
  Returns: {
    order: { ...full order record },
    lines: [ ...order lines with void info ],
    tenders: [ ...tender records with card info ],
    reversals: [ ...tender reversals ],
    gl_entries: [ ...journal entries with line details ],
    audit_trail: [ ...audit_log entries for this order ],
    timeline: [
      { event: 'created', at: '...', by: '...' },
      { event: 'line_added', at: '...', item: '...' },
      { event: 'tendered', at: '...', type: 'credit_card', amount: 4500 },
      { event: 'closed', at: '...', by: '...' },
      { event: 'gl_posted', at: '...', journal_id: '...' },
    ]
  }

GET  /api/admin/finance/voids                     — Void log across tenants
  Filters: tenant_id, date_from, date_to, voided_by, amount_min
  Returns: orders and order lines that have been voided, with actor and reason
  Query:
    SELECT o.id, o.order_number, o.tenant_id, t.name as tenant_name,
           o.void_reason, o.voided_by, u.name as voided_by_name,
           o.total, o.business_date, o.created_at
    FROM orders o
    JOIN tenants t ON o.tenant_id = t.id
    LEFT JOIN users u ON o.voided_by = u.id
    WHERE o.status = 'voided'
    ORDER BY o.created_at DESC;

GET  /api/admin/finance/refunds                   — Refund log across tenants
  Filters: tenant_id, date_from, date_to, amount_min
  Returns: tender reversals of type 'refund'
  Query joins: tender_reversals → tenders → orders → tenants

GET  /api/admin/finance/gl-issues                 — GL posting issues
  Returns: {
    unmapped_events: [ ...from gl_unmapped_events ],
    unposted_entries: [ ...gl_journal_entries with status 'pending' ],
    failed_postings: [ ...gl_journal_entries with status 'failed' ],
  }
  Filters: tenant_id, date_from, date_to

GET  /api/admin/finance/gl-issues/:id             — Single GL issue detail
  Returns: full unmapped event or journal entry with context

GET  /api/admin/finance/chargebacks               — Chargeback tracker
  Filters: tenant_id, status, date_from, date_to
  Sort: due_date, amount, received_at

GET  /api/admin/finance/chargebacks/:id           — Chargeback detail
  Returns: chargeback + linked tender + linked order

GET  /api/admin/finance/close-batches             — Close batch status
  Filters: tenant_id, location_id, business_date, status (open/closed)
  Returns: fnb_close_batches and retail_close_batches merged

GET  /api/admin/finance/vouchers                  — Voucher lookup
  Filters: tenant_id, code, status, voucher_type
```

**Order detail aggregation query:**
```sql
-- Main order
SELECT o.*, t.name as tenant_name, l.name as location_name,
       c.display_name as customer_name, u.name as server_name
FROM orders o
LEFT JOIN tenants t ON o.tenant_id = t.id
LEFT JOIN locations l ON o.location_id = l.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN users u ON o.server_user_id = u.id
WHERE o.id = $1;

-- Order lines
SELECT ol.*, ci.name as catalog_item_name,
       CASE WHEN ol.voided_by IS NOT NULL THEN true ELSE false END as is_voided,
       vu.name as voided_by_name
FROM order_lines ol
LEFT JOIN catalog_items ci ON ol.catalog_item_id = ci.id
LEFT JOIN users vu ON ol.voided_by = vu.id
WHERE ol.order_id = $1
ORDER BY ol.created_at;

-- Tenders
SELECT t.*, tr.id as reversal_id, tr.reversal_type, tr.amount as reversal_amount, tr.reason as reversal_reason
FROM tenders t
LEFT JOIN tender_reversals tr ON tr.tender_id = t.id
WHERE t.order_id = $1
ORDER BY t.created_at;

-- GL journal entries linked to this order
SELECT je.*, json_agg(jl.*) as lines
FROM gl_journal_entries je
LEFT JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.source_type = 'order' AND je.source_id = $1
GROUP BY je.id
ORDER BY je.entry_date;

-- Audit trail for this order
SELECT al.action, al.actor_type, al.actor_user_id, u.name as actor_name,
       al.changes, al.created_at
FROM audit_log al
LEFT JOIN users u ON al.actor_user_id = u.id
WHERE al.entity_type = 'order' AND al.entity_id = $1
ORDER BY al.created_at;
```

### 8.2 — Frontend: Financial Support Hub

**Route:** `/admin/finance`

Sub-navigation tabs:

```
[Orders] [Voids & Refunds] [GL Issues] [Chargebacks] [Close Batches] [Vouchers]
```

### 8.3 — Frontend: Order Lookup

**Route:** `/admin/finance/orders`

```
┌──────────────────────────────────────────────────────────────────┐
│  Order Lookup                                                     │
├──────────────────────────────────────────────────────────────────┤
│  [Order # or search...] [Tenant ▼] [Date Range] [Status ▼]     │
│  [Amount Min] [Amount Max] [☐ Has Voids] [☐ Has Refunds]       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  #10234 │ Acme Golf │ Main Clubhouse │ $127.50 │ Closed         │
│         │ Feb 22, 2026 · Server: John Smith · 3 items            │
│  ─────────────────────────────────────────────────────────────── │
│  #10235 │ Acme Golf │ Pro Shop      │ $45.00  │ ⚠️ Voided      │
│         │ Feb 22, 2026 · Voided by: Jane Doe · Reason: Duplicate│
│  ─────────────────────────────────────────────────────────────── │
│  #8891  │ Bella     │ Main Dining   │ $234.00 │ Closed          │
│         │ Feb 21, 2026 · Server: Maria Lopez · 5 items · Refund │
│                                                                   │
│  ◄ 1 2 3 ... ►                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.4 — Frontend: Order Detail View

Click an order → full detail page or slide-over:

```
┌──────────────────────────────────────────────────────────────────┐
│  Order #10234                                       [✕ Close]    │
│  Acme Golf Club · Main Clubhouse · Feb 22, 2026                 │
│  Server: John Smith · Status: Closed                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ── Order Lines ──                                               │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Item                  │ Qty │ Unit Price │ Total         │    │
│  ├───────────────────────┼─────┼────────────┼───────────────┤    │
│  │ Green Fee (18 holes)  │  2  │   $45.00   │   $90.00     │    │
│  │ Cart Rental            │  1  │   $25.00   │   $25.00     │    │
│  │ Pro Shop - Glove       │  1  │   $12.50   │   $12.50     │    │
│  ├───────────────────────┼─────┼────────────┼───────────────┤    │
│  │ Subtotal              │     │            │  $127.50      │    │
│  │ Tax                   │     │            │   $10.84      │    │
│  │ Tip                   │     │            │   $20.00      │    │
│  │ TOTAL                 │     │            │  $158.34      │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ── Payments ──                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Visa ····4242  │ $158.34  │ Auth: ABC123 │ ● Captured   │    │
│  │ No reversals                                             │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ── GL Posting ──                                                │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Journal Entry JE-001234  │ Posted Feb 22 11:05 PM       │    │
│  │ Debit:  1200 - Cash/CC Clearing    $158.34              │    │
│  │ Credit: 4100 - Green Fees Revenue   $90.00              │    │
│  │ Credit: 4200 - Cart Revenue         $25.00              │    │
│  │ Credit: 4300 - Pro Shop Revenue     $12.50              │    │
│  │ Credit: 2100 - Sales Tax Payable    $10.84              │    │
│  │ Credit: 2200 - Tips Payable         $20.00              │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ── Order Timeline ──                                            │
│  11:02 AM  Order created by John Smith                           │
│  11:02 AM  Line added: Green Fee (18 holes) × 2                 │
│  11:03 AM  Line added: Cart Rental × 1                          │
│  11:05 AM  Line added: Pro Shop - Glove × 1                     │
│  11:06 AM  Payment: Visa ····4242 $158.34                       │
│  11:06 AM  Order closed                                          │
│  11:05 PM  GL posted: Journal Entry JE-001234                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.5 — Frontend: Voids & Refunds Log

**Route:** `/admin/finance/voids-refunds`

```
┌──────────────────────────────────────────────────────────────────┐
│  Voids & Refunds                                                  │
├──────────────────────────────────────────────────────────────────┤
│  [Voids] [Refunds] [All]   [Tenant ▼] [Date Range] [Amount ▼]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  🔴 VOID  │ Order #10235 │ $45.00 │ Acme Golf                   │
│           │ Voided by: Jane Doe · Feb 22, 2026                   │
│           │ Reason: "Customer entered wrong item, duplicate"     │
│           │ [View Order →]                                        │
│  ─────────────────────────────────────────────────────────────── │
│  🟠 REFUND│ Order #8891  │ $50.00 (partial) │ Bella Ristorante  │
│           │ Refunded by: Maria Lopez · Feb 21, 2026              │
│           │ Reason: "Customer complained about steak quality"    │
│           │ Original total: $234.00 · [View Order →]             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.6 — Frontend: GL Issues

**Route:** `/admin/finance/gl-issues`

```
┌──────────────────────────────────────────────────────────────────┐
│  GL Issues                                                        │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │      3       │ │      5       │ │      1       │             │
│  │  Unmapped    │ │  Unposted    │ │   Failed     │             │
│  │  Events      │ │  Entries     │ │   Postings   │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
│                                                                   │
│  [Tenant ▼] [Issue Type ▼] [Date Range]                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ⚠️ UNMAPPED │ Acme Golf · "Caddie Services" department          │
│              │ Event: order.posted · Feb 22, 2026                 │
│              │ No GL account mapping for department "Caddie"      │
│              │ [View Event Data →]                                 │
│  ────────────────────────────────────────────────────────────────│
│  ⏳ UNPOSTED │ Grand Hotel · Journal Entry JE-5678               │
│              │ Created Feb 21, 2026 · Status: pending             │
│              │ 4 lines, total debits: $1,234.00                   │
│              │ [View Journal Entry →]                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.7 — Frontend: Chargebacks

**Route:** `/admin/finance/chargebacks`

```
┌──────────────────────────────────────────────────────────────────┐
│  Chargebacks                                                      │
├──────────────────────────────────────────────────────────────────┤
│  [Tenant ▼] [Status ▼] [Date Range]                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  🔴 OPEN │ $150.00 │ Bella Ristorante │ Due: Mar 1, 2026        │
│          │ Reason Code: 4837 (No cardholder authorization)       │
│          │ Original: Visa ····8823 · Order #7721                 │
│          │ Received: Feb 15, 2026 · [View Details →]             │
│  ─────────────────────────────────────────────────────────────── │
│  ✅ WON  │ $89.00  │ Acme Golf       │ Resolved Feb 10, 2026    │
│          │ Reason Code: 4853 (Cardholder dispute)                │
│          │ Original: MC ····3344 · Order #9102                   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.8 — Frontend: Close Batches

**Route:** `/admin/finance/close-batches`

```
┌──────────────────────────────────────────────────────────────────┐
│  Close Batches                                                    │
├──────────────────────────────────────────────────────────────────┤
│  [Tenant ▼] [Location ▼] [Status: ☐ Open ☐ Closed] [Date]     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ⚠️ OPEN │ Acme Golf · Pro Shop · Feb 22, 2026                  │
│          │ Opened: 6:00 AM · Not yet closed · 14 hours open     │
│          │ Type: Retail                                           │
│  ─────────────────────────────────────────────────────────────── │
│  ✅ CLOSED│ Acme Golf · Main Clubhouse · Feb 22, 2026            │
│          │ Opened: 6:00 AM · Closed: 10:15 PM                   │
│          │ Type: F&B                                              │
│  ─────────────────────────────────────────────────────────────── │
│  ⚠️ OPEN │ Bella Ristorante · Main · Feb 21, 2026 (YESTERDAY)  │
│          │ Opened: 11:00 AM · Not closed · ⚠️ OVERDUE           │
│          │ Type: F&B                                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.9 — Components Summary

Build these components:

- `FinanceHubPage` — container with sub-nav tabs
- `OrderSearchPage` — search + filter + paginated order list
- `OrderRow` — order list row with key info, void/refund indicators
- `OrderDetailPanel` — full order detail with lines, tenders, GL, timeline
- `OrderLinesTable` — order lines with void indicators
- `TenderSection` — payment details with reversal info
- `GLPostingSection` — journal entry with debit/credit lines
- `OrderTimeline` — chronological event list for the order lifecycle
- `VoidsRefundsPage` — combined log with type toggle
- `VoidRefundRow` — row with actor, reason, amount, link to order
- `GLIssuesPage` — stats cards + issue list
- `GLIssueRow` — unmapped event or unposted entry detail
- `GLEventDetailPanel` — full payload view for unmapped events
- `ChargebacksPage` — chargeback list with status and due date
- `ChargebackDetailPanel` — chargeback + linked tender + order
- `CloseBatchesPage` — batch list with overdue highlighting
- `VoucherLookupPage` — voucher search by code with balance display

### 8.10 — Tests

**Backend:**
- Order search: returns paginated results, respects all filters
- Order search: `has_voids` filter returns only orders with voided lines or voided status
- Order detail: returns complete aggregation (lines, tenders, reversals, GL, audit trail)
- Order detail: timeline is in correct chronological order
- Voids API: returns voided orders with actor info
- Refunds API: returns tender reversals with order context
- GL issues: correctly separates unmapped events, unposted entries, failed postings
- Chargebacks: returns with linked tender and order info
- Close batches: merges F&B and retail batches, identifies overdue correctly
- Permission checks: finance_support role can access, viewer role can access (read-only)

**Frontend:**
- Order search page renders and filters work
- Order detail panel displays all sections correctly
- Void/refund rows show actor and reason
- GL issues page shows correct counts in stat cards
- Chargeback list highlights open items with due dates
- Close batches page highlights overdue batches in red
- All "View Order →" links navigate to order detail
- All amounts display with proper currency formatting (cents → dollars)

---

## COMPLETION CHECKLIST — Phase 2A

After completing Sessions 7–8, you should have:

- [ ] `tenant_health_snapshots` table capturing per-tenant health every 15 minutes
- [ ] `system_metrics_snapshots` table capturing system-wide metrics
- [ ] Health scoring algorithm with grade factors
- [ ] Scheduled job for health snapshot capture
- [ ] System health dashboard with metrics, trends, alerts, and tenant health grid
- [ ] Tenant health card on tenant detail page with 7-day trend
- [ ] Cleanup job for old snapshots
- [ ] Order lookup with comprehensive filters
- [ ] Order detail view with lines, tenders, GL posting, and timeline
- [ ] Void and refund investigation log
- [ ] GL issues dashboard (unmapped events, unposted entries, failed postings)
- [ ] Chargeback tracker
- [ ] Close batch status viewer with overdue detection
- [ ] Voucher lookup
- [ ] All financial views are read-only (no mutations)
- [ ] Comprehensive test coverage for all above

**You can now diagnose 95% of support issues without touching production databases.**
