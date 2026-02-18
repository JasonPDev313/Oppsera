# OppsEra

## What Is It?

Multi-tenant SaaS ERP for SMBs (retail, restaurant, golf, hybrid). Modular monolith — modules own their schema, communicate via events, extractable to microservices later. Target: ~4,000 tenants, ~5,000 locations.

## Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + pnpm 9 |
| Frontend | Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4 |
| Validation | Zod (runtime + TS inference) |
| Database | Postgres 16 with RLS |
| ORM | Drizzle (NOT Prisma) |
| DB driver | postgres (postgres.js, NOT pg) |
| Auth | Supabase Auth (V1), JWT-based |
| Icons | lucide-react |
| Testing | Vitest |
| API | REST, JSON, camelCase keys |
| Job System | Postgres-backed (SKIP LOCKED), no external queue dependency |
| Caching | Redis (Stage 2+), in-memory LRU (Stage 1) |
| Deployment | Vercel → Docker Compose → K8s (staged, see infra/MIGRATION_PLAN.md) |

## Modules

| Module | Key | Phase | Status |
|---|---|---|---|
| Platform Core (auth, RBAC, entitlements, events, audit) | platform_core | V1 | Done |
| Product Catalog (items, categories, modifiers, pricing, tax) | catalog | V1 | Done |
| Retail POS (orders, line items, discounts, tax calc) | orders | V1 | Done (backend + frontend) |
| Payments / Tenders | payments | V1 | Done (cash V1) |
| Inventory | inventory | V1 | Done (movements ledger + events) |
| Customer Management | customers | V1 | Done (CRM + Universal Profile) |
| Reporting / Exports | reporting | V1 | Planned |
| F&B POS (dual-mode, shares orders module) | pos_fnb | V1 | Done (frontend) |
| Restaurant KDS | kds | V2 | Planned |
| Golf Operations | golf_ops | V2 | Planned |

## Monorepo Structure

```
oppsera/
├── apps/web/                         # Next.js frontend + API routes
│   ├── src/app/(auth)/               # Auth pages (login, signup, onboard)
│   ├── src/app/(dashboard)/          # Main app with sidebar layout
│   │   ├── pos/layout.tsx            # Fullscreen POS overlay (z-50, barcode listener)
│   │   ├── pos/retail/page.tsx       # Retail POS shell
│   │   ├── pos/fnb/page.tsx          # F&B POS shell
│   │   ├── orders/page.tsx           # Order history list
│   │   └── orders/[orderId]/page.tsx # Order detail
│   ├── src/app/api/v1/               # API route handlers
│   ├── src/components/ui/            # Reusable UI components
│   ├── src/components/pos/           # POS components (ItemButton, Cart, dialogs, catalog-nav/)
│   ├── src/components/customer-profile-drawer/  # Universal Profile drawer (11 tabs)
│   ├── src/hooks/                    # React hooks (use-auth, use-catalog, use-pos, use-customers, etc.)
│   ├── src/lib/                      # Utilities (api-client)
│   └── src/types/                    # Frontend type definitions (catalog.ts, pos.ts, customers.ts)
├── packages/
│   ├── shared/                       # @oppsera/shared — types, Zod schemas, utils, constants
│   ├── core/                         # @oppsera/core — auth, RBAC, events, audit, entitlements
│   ├── db/                           # @oppsera/db — Drizzle client, schema, migrations, seed
│   └── modules/
│       ├── catalog/                  # @oppsera/module-catalog — IMPLEMENTED
│       ├── orders/                   # @oppsera/module-orders — IMPLEMENTED
│       ├── payments/                 # @oppsera/module-payments — IMPLEMENTED (cash V1)
│       ├── inventory/                # @oppsera/module-inventory — IMPLEMENTED (movements ledger + events)
│       ├── customers/                # @oppsera/module-customers — IMPLEMENTED (CRM + Universal Profile)
│       ├── reporting/                # @oppsera/module-reporting — scaffolded
│       ├── kds/                      # @oppsera/module-kds — scaffolded
│       ├── golf-ops/                 # @oppsera/module-golf-ops — scaffolded
│       └── marketing/                # @oppsera/module-marketing — scaffolded
├── tools/scripts/
├── CONVENTIONS.md                    # Development conventions (read this too)
├── turbo.json
└── docker-compose.yml
```

## Package Dependencies

```
@oppsera/shared        ← no internal deps (Zod, ulid)
@oppsera/db            ← shared (Drizzle, postgres.js)
@oppsera/core          ← shared, db (Supabase, jsonwebtoken)
@oppsera/module-*      ← shared, db, core ONLY (Drizzle, Zod) — NEVER another module
@oppsera/web           ← all packages (orchestration layer — only place that imports multiple modules)
```

**NOTE**: Cross-module deps were eliminated in the architecture decoupling pass. Shared helpers (`checkIdempotency`, `saveIdempotencyKey`, `fetchOrderForMutation`, `incrementVersion`, `calculateTaxes`, `CatalogReadApi`) now live in `@oppsera/core/helpers/`. Order and catalog modules provide thin re-exports for backward compat. One remaining violation: customers event consumer queries `orders` and `tenders` tables directly (fix: enrich event payloads).

## Key Architectural Patterns

### Middleware Chain
Every API route uses `withMiddleware(handler, options)`:
```
authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler
```
Options: `{ entitlement: 'catalog', permission: 'catalog.view' }`
Special mode: `{ authenticated: true, requireTenant: false }` for pre-tenant endpoints (onboarding).

### Command Pattern (Write Operations)
```typescript
async function createThing(ctx: RequestContext, input: ValidatedInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check INSIDE the transaction (prevents race conditions)
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createThing');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // validate references, insert row
    const [created] = await tx.insert(table).values({...}).returning();
    const event = buildEventFromContext(ctx, 'module.entity.created.v1', {...});

    // Save idempotency key INSIDE the same transaction
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createThing', created);
    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'module.entity.created', 'entity_type', result.id);
  return result;
}
```

### Query Pattern (Read Operations)
```typescript
async function listThings(input: ListInput): Promise<ListResult> {
  return withTenant(input.tenantId, async (tx) => {
    // build conditions, cursor pagination, limit+1 for hasMore
    const rows = await tx.select().from(table).where(and(...conditions))
      .orderBy(desc(table.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, cursor: hasMore ? items[items.length-1]!.id : null, hasMore };
  });
}
```

### Optimistic Locking (Mutable Aggregates)
```typescript
// For commands that mutate existing aggregates (orders, etc.)
const order = await fetchOrderForMutation(tx, tenantId, orderId, 'open', expectedVersion?);
// ... mutate ...
await incrementVersion(tx, order.id);
```

### API Response Shapes
```typescript
// Success (list): { data: [...], meta: { cursor, hasMore } }
// Success (single): { data: {...} }
// Success (create): { data: {...} } with status 201
// Error: { error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }
```

### Frontend Data Hooks
Custom hooks wrapping `apiFetch` with loading/error states. Pattern: `useFetch<T>(url)` returns `{ data, isLoading, error, mutate }`. Mutations use `useMutation<TInput, TResult>(fn)`.

### POS Dual-Mode Architecture
Two POS shells (Retail + F&B) share one commerce engine (orders module). Either sells any item type.

| Hook | Purpose |
|---|---|
| `usePOSConfig(locationId, mode)` | Terminal config from localStorage (V1) |
| `usePOS(config)` | Order lifecycle state machine (add/remove items, place, void, hold/recall) |
| `useCatalogForPOS(locationId)` | Full catalog + 4-layer hierarchy navigation + search + barcode + favorites |
| `useShift(locationId, terminalId)` | Shift open/close, paid-in/out, drawer (localStorage V1) |
| `useOrders(filters)` | Order list with cursor pagination |

Universal item tap handler routes by `typeGroup`:
- `fnb` → open modifier dialog
- `retail` with options → open option picker
- `retail` without options → direct add
- `service` → direct add
- `package` → open package confirm

### Money: Dollars vs Cents
- **Catalog** stores prices/costs as `NUMERIC(12,2)` (dollars, string in TS)
- **Orders/Payments** store all amounts as `INTEGER` (cents, number in TS)
- Convert at the boundary: `Math.round(parseFloat(price) * 100)`
- All order-layer arithmetic is integer-only — no floating point

## Multi-Tenancy

Every domain table has: `id` (ULID), `tenant_id`, optional `location_id`, `created_at`, `updated_at`.
Defense-in-depth: app-level filtering + `withTenant()` wrapper + Postgres RLS.

## RBAC

6 system roles: Owner (`*`), Manager, Supervisor, Cashier, Server, Staff.
Permission strings: `module.action` or `module.*` for wildcards. Cached 60s in Redis.
Role assignments can be tenant-wide or location-specific.

POS-specific permissions: `orders.create`, `orders.void`, `price.override`, `discounts.apply`, `charges.manage`, `cash.drawer`, `shift.manage`, `returns.create`, `tenders.create`, `tenders.view`.

## Event System

Naming: `{domain}.{entity}.{action}.v{N}` (e.g., `catalog.item.created.v1`)
Transactional outbox pattern. Consumers are idempotent. 3x retry with exponential backoff.

### Cross-Module Event Flow
```
catalog.item.created.v1  → inventory (auto-create inventory item)
order.placed.v1          → inventory (deduct stock, type-aware) + customers (AR charge if house account, update visit/spend stats)
order.voided.v1          → inventory (reverse stock) + tenders (reverse payments) + customers (AR void reversal)
tender.recorded.v1       → orders (mark paid when fully paid) + customers (AR payment + FIFO allocation if house account)
```

### Internal Read APIs (Sync Cross-Module)
For synchronous lookups during transactions (not eventual consistency):
```typescript
const catalogApi = getCatalogReadApi();
const posItem = await catalogApi.getItemForPOS(tenantId, itemId, locationId);
// Returns: { id, sku, barcode, name, itemType, unitPriceCents, taxInfo, metadata }
```
Internal APIs are read-only, use singleton getter/setter, and are the only exception to events-only cross-module rule.

## Deployment & Infrastructure

### Staged Deployment Path (Updated Feb 2026)
```
Stage 1 (10 locations):     Vercel Pro + Supabase Pro Micro (~$45/mo)
Stage 2 (100 locations):    + Supabase Medium compute + read replica + Redis (~$175/mo)
Stage 3 (1,000 locations):  + Supabase Large compute (~$505/mo) — still on Vercel
Stage 4 (5,000 locations):  AWS ECS + RDS + ElastiCache (~$1,195/mo) — containers win
```
Cost crossover at ~2,000-3,000 locations (NOT ~100 as previously estimated).
Real migration drivers: compliance, cold starts, log retention — not cost.
See `infra/MIGRATION_PLAN.md` and `infra/LIMITS_AND_MIGRATION.ts` for full analysis.

### Connection Pooling (Vercel + Supavisor)
```typescript
// postgres.js config for Vercel serverless
const pool = postgres(DATABASE_URL, {
  max: 2,              // low per-instance (many concurrent instances)
  prepare: false,       // REQUIRED for Supavisor transaction mode
  idle_timeout: 20,
  max_lifetime: 300,
});
```

### Postgres Tuning
```
statement_timeout = 30s
idle_in_transaction_session_timeout = 60s
lock_timeout = 5s
```
Per-table autovacuum for write-heavy tables (orders, inventory_movements, event_outbox):
`autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02`

### Background Jobs
Postgres-native job system using `SKIP LOCKED` (no pg-boss/BullMQ/Redis at Stage 1):
- Tables: `background_jobs`, `background_job_attempts`, `scheduled_jobs`
- JobWorker polls with `FOR UPDATE SKIP LOCKED` for lock-free concurrency
- Tenant fairness: `maxJobsPerTenantPerPoll` cap prevents noisy neighbors
- Lease + heartbeat mechanism for crash recovery
- On Vercel: Vercel Cron pings `/api/v1/internal/drain-jobs` every minute as safety net

### Tenant Tiers
```
small:      ≤5 locations, 100 req/min, 10 concurrent jobs
medium:     ≤20 locations, 500 req/min, 25 concurrent jobs
large:      ≤100 locations, 2000 req/min, 50 concurrent jobs
enterprise: unlimited, 5000 req/min, 100 concurrent jobs
```

### Observability
- **Sentry** for error tracking + performance tracing (Stage 1)
- **pg_stat_statements** enabled from day 1 — review weekly for top-20 slowest queries
- Structured JSON logging with `tenantId`, `requestId`, `duration` on every request
- Stock alerts: `inventory.low_stock.v1`, `inventory.negative.v1` events for monitoring

## Current State

Milestones 0-9 (Sessions 1-16.5) complete. See CONVENTIONS.md for detailed code patterns.

### What's Built
- **Platform Core**: auth, RBAC, entitlements, events/outbox, audit, withMiddleware
- **Catalog Module**: 12 tables, 16 commands, 8 queries, 18 API routes, tax calculation engine, internal read API (`getItemForPOS`)
  - Items: SKU + barcode (UPC) fields with unique constraints, JSONB metadata for type-specific config
  - Categories: 3-level hierarchy (Department → SubDepartment → Category), depth validated
  - Modifier groups: junction table with `isDefault` flag (canonical source of truth)
- **Orders Module**: 6 tables + existing `order_line_taxes`, 8 commands, 3 queries, 10 API routes
  - Enterprise: idempotency keys, optimistic locking, receipt snapshots, order number counters
  - Type-aware: F&B (fractional qty, modifiers), Retail (qty=1, option sets), Service, Package (component snapshots)
  - Financial: service charges, discounts, price overrides with audit trail, tax integration
- **Payments Module**: 3 tables, 2 commands (recordTender + reverseTender V2 stub), 3 queries, 5 API routes
  - Cash V1: exact/overpay/split, change calculation, denomination tracking
  - GL journal entries: proportional allocation (partial tenders) + remainder method (final tender), double-entry balanced
  - Tender reversals via `order.voided.v1` event consumer (auto-reverse all tenders + GL)
  - Append-only tenders with derived reversal status (no UPDATE on financial fields)
  - Idempotency with required `clientRequestId`, optimistic locking on order version
- **Catalog Frontend**: 6 pages, 10 UI components, data hooks, sidebar navigation
- **Tenant Onboarding**: business type selection, 5-step wizard, atomic provisioning, auth flow guards
- **POS Frontend**: Dual-mode (Retail + F&B), 17 components, 5 catalog-nav components, 7 hooks, fullscreen layout with barcode scanner
  - Retail POS: 60/40 split, search bar, 4-layer hierarchy, barcode scanning, hold/recall
  - F&B POS: large touch targets, "Ticket" label, "Send & Pay", repeat last item
  - Shared: ItemButton, Cart (type-aware), CartTotals, TenderDialog, ModifierDialog, OptionPickerDialog, PackageConfirmDialog, PriceOverrideDialog, ServiceChargeDialog, DiscountDialog
  - Catalog nav: DepartmentTabs, SubDepartmentTabs, CategoryRail, CatalogBreadcrumb, QuickMenuTab
  - Order history: list with filters + detail with receipt viewer + tenders section
- **Inventory Module**: 2 core tables + 8 provisioned V2 tables, 4 commands, 3 queries, 7 API routes
  - Append-only movements ledger: on-hand = SUM(quantity_delta), never a mutable column
  - Type-aware: F&B fractional qty, Retail integer, Package component-level deduction
  - 4 commands: receiveInventory, adjustInventory, transferInventory, recordShrink
  - 3 event consumers: order.placed (type-aware deduct), order.voided (reversal), catalog.item.created (auto-create)
  - Stock alerts: low_stock and negative events emitted when thresholds crossed
  - Transfer: paired movements (transfer_out + transfer_in) with shared batchId, always validates non-negative at source
  - UOM provisioned: baseUnit, purchaseUnit, purchaseToBaseRatio (V1 defaults to 'each')
  - Cost tracking: unitCost, extendedCost on movements; costingMethod, standardCost on items
  - Idempotency: UNIQUE index on (tenantId, referenceType, referenceId, inventoryItemId, movementType) + ON CONFLICT DO NOTHING
  - Frontend: inventory list page (search, filters, color-coded on-hand), detail page with movement history, receive/adjust/shrink dialogs
- **Shared**: item-type utilities (incl. green_fee/rental → retail mapping), money helpers, ULID, date utils, slug generation, catalog metadata types
- **Customer Management Module** (Session 16 + 16.5):
  - **36 tables** (15 Session 16 + 21 Session 16.5): customers (31 cols), customer_relationships, customer_identifiers, customer_activity_log, membership_plans, memberships, membership_billing_events, billing_accounts, billing_account_members, ar_transactions, ar_allocations, statements, late_fee_policies, customer_privileges, pricing_tiers, customer_contacts, customer_preferences, customer_documents, customer_communications, customer_service_flags, customer_consents, customer_external_ids, customer_auth_accounts, customer_wallet_accounts, customer_alerts, customer_scores, customer_metrics_daily, customer_metrics_lifetime, customer_merge_history, customer_households, customer_household_members, customer_visits, customer_incidents, customer_segments, customer_segment_memberships, customer_payment_methods
  - **38 commands**: 16 Session 16 (CRUD customers, memberships, billing/AR) + 22 Session 16.5 (contacts, preferences, documents, communications, service flags, consents, external IDs, wallets, alerts, households, visits, incidents, segments)
  - **23 queries**: 12 Session 16 (list/get customers, plans, memberships, billing, AR ledger, aging, statements, privileges, search) + 11 Session 16.5 (profile360, financial, preferences, activity, notes, documents, communications, compliance, segments, integrations, analytics)
  - **~38 API routes**: base CRUD, search, merge, profile sub-resources, billing, memberships, households, segments
  - **5 frontend pages**: customer list, customer detail, billing list, billing detail, memberships
  - **18 hooks**: 8 Session 16 (customers, plans, memberships, billing, AR, aging) + 11 Session 16.5 (profile, financial, preferences, activity, notes, documents, communications, compliance, segments, integrations, analytics)
  - **Customer Profile Drawer**: 15 components (11 tabs), portal-based slide-in panel (560px), React Context provider
  - Customer identity: person/organization types, merge capability, identifier cards/barcodes/wristbands, activity log (CRM timeline)
  - Membership system: plans with privileges (jsonb), status lifecycle (pending→active→paused→canceled→expired), billing account linkage
  - Billing/AR: credit limits, spending limits, sub-account authorization, FIFO payment allocation, aging buckets, collection status lifecycle
  - Universal Profile: contacts, preferences (by category), documents, communications, service flags, consents, wallets/loyalty, alerts, households, visits, incidents, segments, scores
  - Event consumers: order.placed (AR charge + visit/spend stats), order.voided (AR reversal), tender.recorded (AR payment + FIFO allocation)
  - GL integration: AR charge/payment/writeoff/late_fee journal entries
  - Sidebar navigation: Customers section with All Customers, Memberships, Billing sub-items

### Test Coverage
586 tests: 134 core + 68 catalog + 52 orders + 22 shared + 100 customers + 183 web (75 POS + 66 tenders + 42 inventory) + 27 db

### What's Built (Infrastructure)
- **Observability**: Structured JSON logging, request metrics, DB health monitoring (pg_stat_statements), job health, alert system (Slack webhooks, P0-P3 severity, dedup), on-call runbooks, migration trigger assessment
- **Admin API**: `/api/health` (public, minimal), `/api/admin/health` (full diagnostics), `/api/admin/metrics/system`, `/api/admin/metrics/tenants`, `/api/admin/migration-readiness`
- **Container Migration Plan**: Docker multi-stage builds, docker-compose, Terraform (AWS ECS Fargate + RDS + ElastiCache), CI/CD (GitHub Actions), deployment config abstraction, feature flags, full Vercel/Supabase limits audit with 2026 pricing, cost projections, migration trigger framework (16/21 pre-migration checklist items complete)
- **Security Hardening**: Security headers (CSP, HSTS, X-Frame-Options, etc.), in-memory sliding window rate limiter on all auth endpoints, auth event audit logging (login/signup/logout), env-var-driven DB pool + prepared statement config. Full audit at `infra/SECURITY_AUDIT.md`
- **Legacy Migration Pipeline**: 14 files in `tools/migration/` (~4,030 lines) — config, ID mapping, transformers, validators, pipeline, cutover/rollback, monitoring
- **Load Testing**: k6 scenarios for auth, catalog, orders, inventory, customers (in `load-tests/`)
- **Business Logic Tests**: 30 test files in `test/` covering all domain invariants

### What's Next
- V1 Dashboard (live widgets: Total Sales, Active Employees, Low Inventory, Notes)
- Settings → Dashboard tab (widget toggles, notes editor)
- Rename "Catalog" → "Inventory Items" across sidebar, pages, routes
- Reporting module (Session 17)
- Install `@sentry/nextjs` and uncomment Sentry init in `instrumentation.ts`
- Ship logs to external aggregator (Axiom/Datadog/Grafana Cloud)
- Remaining security items: CORS for production, email verification, account lockout, container image scanning (see `infra/SECURITY_AUDIT.md` checklist)

## Critical Gotchas (Quick Reference)

1. **`z.input<>` not `z.infer<>`** for function params when schema has `.default()` — see CONVENTIONS.md §19
2. **`export type` doesn't create local bindings** — add separate `import type` for same-file use — see §20
3. **Money: catalog=dollars (NUMERIC), orders=cents (INTEGER)** — convert with `Math.round(parseFloat(price) * 100)` — see §21
4. **postgres.js returns RowList** — use `Array.from(result as Iterable<T>)`, never `.rows`
5. **Append-only tables** — `inventory_movements`, `audit_log`, `payment_journal_entries` are never updated/deleted
6. **Receipt snapshots are immutable** — frozen at `placeOrder`, never regenerated
7. **POS commands need idempotency INSIDE the transaction** — `checkIdempotency(tx, ...)` and `saveIdempotencyKey(tx, ...)` both use the transaction handle, not bare `db`. This prevents TOCTOU race conditions between check and save.
8. **POS uses fullscreen overlay** — `fixed inset-0 z-50` covers dashboard sidebar entirely; exit via router.push('/')
9. **Item typeGroup drives POS behavior** — always use `getItemTypeGroup()` from `@oppsera/shared`, never raw `item.type`
10. **POS V1 state is localStorage** — config, shift, favorites are localStorage until backend APIs exist; design hooks to swap storage later
11. **Barcode scanner = keyboard wedge** — detect via keystroke timing (<50ms), dispatch `CustomEvent('barcode-scan')`; ignore when focus is in INPUT/TEXTAREA
12. **Catalog hierarchy is 4-layer in POS** — Department → SubDepartment → Category → Items; all derived from flat category list via parentId walking
13. **Tenders are append-only** — NEVER UPDATE financial fields (amount, amountGiven, changeGiven, tipAmount, status) on `tenders` table. "Reversed" is a derived state from `tender_reversals` join.
14. **Tender clientRequestId is REQUIRED** — unlike orders where it's optional, tenders mandate `clientRequestId` (not optional in schema)
15. **GL journal entries use dual allocation** — proportional method for partial tenders, remainder method for final tender. sum(debits) MUST equal sum(credits).
16. **TenderDialog z-index is 60** — above POS overlay (z-50). Uses `createPortal` to document.body, same pattern as other POS dialogs.
17. **Tip does NOT affect order.total** — tip is stored on the tender row only; it affects GL (debit side + Tips Payable credit) but not order financial summary
18. **Inventory on-hand is ALWAYS computed** — on-hand = SUM(quantity_delta) from inventory_movements. Never store it as a mutable column. Use `getOnHand()` helper.
19. **Inventory movements are append-only** — never UPDATE or DELETE from `inventory_movements`. Corrections are new rows (adjustment, void_reversal).
20. **Package items deduct COMPONENTS, not the package** — detect via `packageComponents?.length > 0` on order lines. Multiply component qty by line qty for the delta.
21. **Transfer always enforces non-negative at source** — regardless of `allowNegative` setting on the inventory item. Only manual adjustments respect `allowNegative`.
22. **Inventory idempotency uses ON CONFLICT DO NOTHING** — the UNIQUE index on (tenantId, referenceType, referenceId, inventoryItemId, movementType) WHERE referenceType IS NOT NULL prevents duplicate deductions from event replays.
23. **Always use parameterized SQL** — never string-interpolate user input into SQL. Use Drizzle `sql` template literals: `` sql`column = ${value}` `` not `` `column = '${value}'` ``. Template literals auto-parameterize.
24. **Token refresh is deduplicated** — `apiFetch` stores a single `refreshPromise` so concurrent 401s share one refresh call. Always clear tokens on final 401 failure.
25. **dotenv loading order matters** — for scripts reading `.env.local`, load it first: `dotenv.config({ path: '.env.local' })` then `dotenv.config()` as fallback. The first load wins for duplicate keys.
26. **AR transactions are append-only** — like inventory movements and GL entries. Never UPDATE/DELETE from `ar_transactions`. Corrections are new rows (credit_memo, writeoff).
27. **Billing credit limits use helper functions** — `checkCreditLimit(tx, accountId, amount)` validates available credit = creditLimit - outstandingBalance. Call inside the transaction.
28. **Customer merge is soft** — merged customer gets `displayName = '[MERGED] ...'` and `metadata.mergedInto = primaryId`. Queries exclude merged records by filtering `NOT displayName LIKE '[MERGED]%'` or checking metadata.
29. **ProfileDrawer is portal-based** — uses `createPortal` to `document.body` (same pattern as POS dialogs), NOT Radix/shadcn Dialog. 560px slide-in from right with `z-50`.
30. **ProfileDrawer state is React Context** — `ProfileDrawerProvider` wraps the dashboard layout; access via `useProfileDrawer().open(customerId, { tab, source })`.
31. **Customer profile queries are sub-resource scoped** — profile360 fetches overview, then each tab lazy-loads its own sub-resource endpoint (e.g., `/profile/financial`, `/profile/compliance`).
32. **Customer preferences are grouped by category** — categories: food_beverage, golf, retail, service, facility, general, dietary, communication, scheduling. Source: manual/inferred/imported with confidence percentage.
33. **Household tree uses Unicode branch chars** — `HouseholdTreeView` renders primary member with crown icon, clickable member names open their profile in the drawer.
34. **Customer `metadata` is `Record<string, unknown>`** — always coerce with `!!` for conditional rendering and `String()` for value props to avoid `unknown` type errors in strict TS.
35. **Drizzle `numeric` columns return strings** — `numeric(10,4)` columns (e.g., `order_lines.qty`) are returned as strings by postgres.js (e.g., `"1.0000"`). Always convert with `Number()` in query mappings before returning to frontend. String `"1.0000" !== 1` is `true`, causing display bugs.
36. **Query mappings must include ALL frontend-needed fields** — When mapping DB rows in `getXxx()` queries, never omit nullable columns. Omitted fields are `undefined` in JS, and `undefined !== null` is `true` (strict equality), causing rendering bugs (e.g., `formatMoney(undefined)` = `$NaN`). Always map with `?? null`.
37. **Percentage values: store as raw percentage, not basis points** — For discounts and service charges, store the percentage as-is (10 for 10%). Don't multiply by 100. Keeps storage consistent between charges and discounts, and simplifies display. For fixed dollar amounts, store as cents.
38. **Service charges apply AFTER discounts** — Percentage service charges use `(subtotal - discountTotal)` as base, not raw `subtotal`. Order of operations: discount first, then service charge on the discounted amount.
39. **Dark mode uses inverted gray scale** — In `globals.css`, dark mode swaps grays: `gray-900` = near-white, `gray-50` = dark. Never use `bg-gray-900 text-white` (invisible in dark mode). Use `bg-indigo-600 text-white` for primary buttons, `border-red-500/40 text-red-500 hover:bg-red-500/10` for destructive — opacity-based colors work in both modes. Use `bg-surface` for theme-aware backgrounds.
40. **Never add cross-module dependencies in package.json** — modules in `packages/modules/` must ONLY depend on `@oppsera/shared`, `@oppsera/db`, and `@oppsera/core`. Never add `module-orders`, `module-catalog`, etc. as a dependency of another module. Use events or internal read APIs instead.
41. **Never import another module's internal helpers** — if multiple modules need `checkIdempotency`, `fetchOrderForMutation`, etc., move them to `@oppsera/core`. Never import from `@oppsera/module-X/helpers/*` in `@oppsera/module-Y`.
42. **Never query another module's tables in event consumers** — event consumers receive all needed data in the event payload. Don't reach into other modules' tables. If more data is needed, enrich the event payload or use an internal read API.
43. **Every page must be mobile-responsive** — all dashboard pages must work on 320px+ screens. Use responsive breakpoints (`sm:`, `md:`, `lg:`). POS pages target tablets (768px+). See CONVENTIONS.md §46.
44. **`prepare: false` is REQUIRED for Supavisor** — postgres.js must set `prepare: false` when using Supabase's connection pooler (Supavisor) in transaction mode. Without this, prepared statements fail silently or error.
45. **Connection pool `max: 2` on Vercel** — Vercel spins many concurrent instances; each gets a tiny pool. Never set `max` higher than 2-3 in serverless. Total connections = instances × max.
46. **`withTenant()` uses SET LOCAL** — `set_config('app.current_tenant_id', tenantId, true)` is transaction-scoped (`true` = SET LOCAL). Safe with PgBouncer/Supavisor transaction mode — auto-clears on commit/rollback.
47. **Never cache stock levels** — inventory on-hand is always computed from `SUM(quantity_delta)`. Caching introduces stale reads and double-deduction risks. Always query live.
48. **Defer partitioning until 50M+ rows** — partition only when a single table exceeds 50M rows AND index scans show >100ms P95. Use date-based monthly partitioning, NOT tenant-based (too many partitions).
49. **Vercel Cron for outbox drain** — the outbox worker runs in-process via `instrumentation.ts`, but Vercel cold starts can leave gaps. Add a Vercel Cron job pinging `/api/v1/internal/drain-outbox` every minute as safety net.
50. **Event payloads must be self-contained** — consumers should NEVER query other modules' tables. If a consumer needs data not in the event, enrich the event payload at publish time. See §45 known violation for customers consumer.
51. **Background jobs use SKIP LOCKED** — `SELECT ... FOR UPDATE SKIP LOCKED` ensures multiple workers never claim the same job. No external queue dependency needed at Stage 1.
52. **Tenant fairness in job workers** — cap `maxJobsPerTenantPerPoll` to prevent a single tenant from monopolizing the job queue. Default: 5 jobs per tenant per poll cycle.
53. **Never K8s before Docker Compose proves insufficient** — K8s adds operational complexity. Only migrate when: >10 services, need custom-metric auto-scaling, team has K8s experience, monthly spend >$2K.
54. **DevAuthAdapter has production guard** — `get-adapter.ts` checks `process.env.NODE_ENV !== 'production'` in addition to `DEV_AUTH_BYPASS`. This prevents accidental auth bypass in production if env vars leak.
55. **Optional dependencies use runtime string concatenation** — for packages like `@sentry/nextjs` and `ioredis` that may not be installed, use `const pkg = '@sentry/' + 'nextjs'; require(pkg)` to prevent webpack from statically resolving and failing the build. Always wrap in try/catch.
56. **Public health endpoint returns minimal info** — `/api/health` only returns `{ status: "healthy" | "unhealthy" }`. Detailed diagnostics (DB latency, cache ratio, commit SHA) are at `/api/admin/health` behind auth. Never expose infrastructure details publicly.
57. **Event type regex allows multi-segment names** — `^[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$` supports event types like `catalog.item.tax_groups.updated.v1` (5+ segments). Don't assume exactly 4 segments.
58. **Vitest `clearAllMocks()` does NOT clear `mockReturnValueOnce` queues** — only `mockReset()` clears them. If tests configure more mock returns than consumed, the leftovers leak into the next test. Always use `mockReset()` for mocks with `mockReturnValueOnce` chains.
59. **Sentry config files are staged, not active** — `apps/web/sentry-config/` contains ready-to-use configs but `@sentry/nextjs` is NOT installed. To activate: `pnpm -F @oppsera/web add @sentry/nextjs`, move files back to project root, and uncomment imports in `instrumentation.ts`.
60. **`next.config.ts` — no `instrumentationHook` needed in Next.js 15** — Next.js 15 auto-discovers `src/instrumentation.ts` without `experimental.instrumentationHook`. Remove it if present (it causes a type error).
61. **All workspace module imports must be explicit in `package.json`** — even if pnpm hoists them. Add `"@oppsera/module-X": "workspace:*"` to every consuming package's `dependencies`. Required for Docker builds and strict pnpm configs.
62. **Vercel cost crossover is at ~2K-3K locations, not ~100** — Supabase Pro now includes read replicas and PITR add-ons (was Team-only). Team ($599/mo) is only needed for SOC2/SAML compliance. Vercel function limits are 800s timeout, 4GB memory, 30K concurrent (not 60s/1GB/1K). See `infra/LIMITS_AND_MIGRATION.ts`.
63. **Migration is 80% env-var-driven** — `deployment.ts` auto-detects Vercel vs container vs local, adjusts pool size automatically. Feature flags (`USE_READ_REPLICA`, `USE_CONTAINER_WORKERS`, `USE_REDIS_CACHE`) enable gradual rollout. DB migration = change `DATABASE_URL` only.
64. **Vercel runtime log retention is 1 day** — ship logs to external aggregator from day 1. This is a launch requirement, not a nice-to-have. Enterprise only extends to 3 days.
65. **Supabase compute tiers are independent of Pro vs Team** — Pro with Medium compute ($60/mo) gets 120 direct connections, 600 pooler connections, 100GB max DB. No need for Team ($599/mo) just for database features.
66. **Function invocation overages are the Vercel cost killer at scale** — $0.60/million invocations. At 4M/mo (Stage 4), that's $1,800/mo in overages alone. Cache read-heavy endpoints aggressively.
67. **All auth endpoints have rate limiting** — login/refresh: 20/15min, signup/magic-link: 5/15min. Uses in-memory sliding window (`packages/core/src/security/rate-limiter.ts`). Upgrade to Redis in Stage 2. Returns 429 with `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers.
68. **Security headers are in next.config.ts** — CSP (with dynamic dev/prod script-src), HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy. Never weaken CSP without a security review.
69. **Auth events are audit-logged** — `auth.login.success`, `auth.login.failed`, `auth.signup.success`, `auth.logout` via `auditLogSystem()`. Best-effort (wrapped in try/catch) — never blocks auth response.
70. **DB pool config is env-var-driven** — `DB_POOL_MAX` (default 5), `DB_ADMIN_POOL_MAX` (default 3), `DB_PREPARE_STATEMENTS` (default false). Set `DB_POOL_MAX=2` on Vercel, `DB_POOL_MAX=10` + `DB_PREPARE_STATEMENTS=true` on containers with direct Postgres.
71. **Permission cache TTL is 15 seconds** — reduced from 60s for faster permission revocation. When a user is demoted/terminated, their stale access window is at most 15s. Future: add immediate invalidation webhook.
72. **set_config scope must be transaction-scoped** — always use `set_config(key, value, true)` (third param = `true` for SET LOCAL). Session-scoped (`false`) leaks between pooled connections. `withTenant()` already does this correctly.

## Quick Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm lint             # Lint all packages
pnpm type-check       # TypeScript check all packages
pnpm db:migrate       # Run DB migrations
pnpm db:seed          # Seed development data
```
