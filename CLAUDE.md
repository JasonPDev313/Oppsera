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
| Payments / Tenders + Gateway | payments | V1 | Done (cash V1 + CardPointe gateway + ACH + surcharges) |
| Inventory | inventory | V1 | Done (movements + receiving + vendor management) |
| Customer Management | customers | V1 | Done (CRM + Universal Profile) |
| Reporting / Exports | reporting | V1 | Done (complete: backend + frontend + custom builder + dashboards) |
| F&B POS (dual-mode, shares orders module) | pos_fnb | V1 | Done (frontend + backend module) |
| Restaurant KDS | kds | V2 | Planned |
| Golf Reporting | golf_reporting | V1 | Done (read models + consumers + frontend) |
| Room Layouts | room_layouts | V1 | Done (editor + templates + versioning) |
| Accounting Core (GL, COA, posting, reports, statements) | accounting | V1 | Done |
| Accounts Payable (bills, payments, vendors, aging) | ap | V1 | Done |
| Accounts Receivable v0 (invoices, receipts, aging) | ar | V1 | Done |
| Golf Operations | golf_ops | V2 | Planned |
| AI Insights (Semantic Layer) | semantic | V1 | Done (dual-mode pipeline + SQL generation + RAG + eval training platform) |
| Property Management (PMS) | pms | V1 | Done (reservations, calendar, folios, housekeeping, yield mgmt, channels, loyalty) |
| ERP Workflow Engine | erp | V1 | Done (tier-based workflow defaults, close orchestrator, cron) |
| SuperAdmin Portal | admin_portal | V1 | Done (spec: 14 sessions, 120 API routes — implementation pending) |

## Monorepo Structure

```
oppsera/
├── apps/
│   ├── web/                          # Next.js frontend + API routes
│   │   ├── src/app/(auth)/           # Auth pages (login, signup, onboard)
│   │   ├── src/app/(dashboard)/      # Main app with sidebar layout
│   │   │   ├── pos/                  # Dual-mode POS (retail + F&B)
│   │   │   ├── orders/               # Order history + detail
│   │   │   └── insights/             # AI Insights chat + history + lenses
│   │   ├── src/app/api/v1/           # API route handlers (incl. /semantic/)
│   │   ├── src/components/           # UI, POS, semantic, insights components
│   │   ├── src/hooks/                # React hooks (incl. use-semantic-chat, use-feedback)
│   │   ├── src/lib/                  # Utilities (api-client)
│   │   └── src/types/                # Frontend type definitions
│   └── admin/                        # Platform admin panel (eval QA, tenant mgmt, user mgmt)
│       ├── src/app/(admin)/train-ai/ # AI training: examples, turns, batch review, experiments, playground, regression, safety, cost
│       ├── src/app/(admin)/tenants/  # Tenant management (list, detail, org hierarchy, entitlements)
│       ├── src/app/(admin)/users/    # User management (staff invite/suspend, customer search)
│       ├── src/app/api/v1/eval/      # Admin eval API routes
│       ├── src/app/api/v1/admin/     # Admin staff + customer API routes
│       ├── src/app/api/v1/tenants/   # Admin tenant CRUD + hierarchy API routes
│       ├── src/app/api/auth/         # Admin auth (JWT + bcrypt, separate from tenant auth)
│       ├── src/components/           # AdminSidebar, EvalTurnCard, tenants/, PlanViewer, etc.
│       ├── src/lib/                  # admin-audit, admin-context, admin-permissions, staff/customer queries
│       └── src/hooks/                # use-admin-auth, use-eval, use-tenants, use-staff, use-customers-admin
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
│       ├── reporting/                # @oppsera/module-reporting — IMPLEMENTED (queries + consumers + CSV)
│       ├── golf-reporting/           # @oppsera/module-golf-reporting — IMPLEMENTED (golf analytics)
│       ├── semantic/                 # @oppsera/module-semantic — IMPLEMENTED (AI insights + dual-mode pipeline)
│       ├── pms/                      # @oppsera/module-pms — IMPLEMENTED (property management)
│       ├── kds/                      # @oppsera/module-kds — scaffolded
│       ├── golf-ops/                 # @oppsera/module-golf-ops — scaffolded
│       ├── accounting/               # @oppsera/module-accounting — IMPLEMENTED (GL, COA, posting, statements)
│       ├── ap/                       # @oppsera/module-ap — IMPLEMENTED (bills, payments, vendors, aging)
│       ├── ar/                       # @oppsera/module-ar — IMPLEMENTED (invoices, receipts, aging)
│       ├── fnb/                      # @oppsera/module-fnb — IMPLEMENTED (F&B POS domain: 103 commands, 63 queries, 1011 tests)
│       └── marketing/               # @oppsera/module-marketing — scaffolded
├── tools/scripts/
├── scripts/                          # Utility scripts (switch-env.sh)
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

**NOTE**: Cross-module deps were eliminated in the architecture decoupling pass. Shared helpers (`checkIdempotency`, `saveIdempotencyKey`, `fetchOrderForMutation`, `incrementVersion`, `calculateTaxes`, `CatalogReadApi`) now live in `@oppsera/core/helpers/`. Pure domain math with no external deps (`computePackageAllocations`) lives in `@oppsera/shared/src/utils/`. Order and catalog modules provide thin re-exports for backward compat. Event payloads are self-contained: `order.placed.v1` includes `customerId` and `lines[]`, `order.voided.v1` includes `locationId`/`businessDate`/`total`, `tender.recorded.v1` includes `customerId`, `lines[]` (with `subDepartmentId`, `taxGroupId`, `packageComponents`), and `paymentMethod` alias.

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
Two POS shells (Retail + F&B) share one commerce engine (orders module). Either sells any item type. Both are mounted simultaneously in `pos/layout.tsx` and toggled via CSS for instant switching (no route transition). Each receives an `isActive` prop to gate barcode scanning and dismiss portal dialogs when inactive.

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
- **GL / AP / AR** store amounts as `NUMERIC(12,2)` (dollars, string in TS)
- **Receiving / Landed Cost** stores as `NUMERIC(12,4)` (dollars, 4-decimal precision)
- Convert at catalog→orders boundary: `Math.round(parseFloat(price) * 100)`
- Convert at POS→GL boundary: `(amountCents / 100).toFixed(2)`
- All order-layer arithmetic is integer-only — no floating point
- All GL/AP/AR arithmetic uses `Number()` conversion + `.toFixed(2)` at update time

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
tender.recorded.v1       → orders (mark paid when fully paid) + customers (AR payment + FIFO allocation if house account) + accounting (GL posting with subdepartment-resolved revenue)
```

### Internal Read APIs (Sync Cross-Module)
For synchronous lookups during transactions (not eventual consistency):
```typescript
const catalogApi = getCatalogReadApi();
const posItem = await catalogApi.getItemForPOS(tenantId, itemId, locationId);
// Returns: { id, sku, barcode, name, itemType, unitPriceCents, taxInfo, metadata, categoryId, subDepartmentId }
```

For accounting reconciliation queries (orders, tenders, settlements, tips, inventory, F&B):
```typescript
const api = getReconciliationReadApi();
const [ordersSummary, tendersSummary] = await Promise.all([
  api.getOrdersSummary(tenantId, startDate, endDate, locationId),
  api.getTendersSummary(tenantId, startDate, endDate, locationId),
]);
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

Milestones 0-9 (Sessions 1-16.5) complete. F&B POS backend module (Sessions 1-16) complete. See CONVENTIONS.md for detailed code patterns.

### What's Built
- **Platform Core**: auth, RBAC, entitlements, events/outbox, audit, withMiddleware
- **Catalog Module**: 13 tables, 18 commands, 9 queries, 19 API routes, tax calculation engine, internal read API (`getItemForPOS`)
  - Items: SKU + barcode (UPC) fields with unique constraints, JSONB metadata for type-specific config
  - Categories: 3-level hierarchy (Department → SubDepartment → Category), depth validated
  - Modifier groups: junction table with `isDefault` flag (canonical source of truth)
  - **Archive semantics** (Session 25): `archivedAt`/`archivedBy`/`archivedReason` replace boolean `isActive`. Migration 0060 adds columns, 0061 drops `is_active`. Commands: `archiveItem`, `unarchiveItem`. Queries filter `archivedAt IS NULL` for active items.
  - **Item Change Log** (Session 25): Append-only `catalog_item_change_logs` table (migration 0063). Field-level diffs via `computeItemDiff()`, auto-logged on create/update/archive/restore via `logItemChange(tx, params)`. Service: `packages/modules/catalog/src/services/item-change-log.ts`. Query: `getItemChangeLog` with cursor pagination, date/action/user filters, user name + category/taxCategory display name resolution. API: `GET /api/v1/catalog/items/[id]/change-log`. Frontend: `ItemChangeLogModal` (portal-based, collapsible entries, field-level old→new display). RLS: SELECT + INSERT only (append-only enforcement).
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
- **Catalog Frontend**: 6 pages, 12 UI components, data hooks, sidebar navigation (page header renamed "Inventory Items")
- **Tenant Onboarding**: business type selection, 5-step wizard, atomic provisioning, auth flow guards
- **POS Frontend**: Dual-mode (Retail + F&B), 17 components, 5 catalog-nav components, 7 hooks, fullscreen layout with barcode scanner, dual-mount instant switching
  - Both POS modes mount in `pos/layout.tsx` and toggle via CSS — no route transition delay
  - Content extracted to `retail-pos-content.tsx` / `fnb-pos-content.tsx` with `isActive` prop
  - Retail POS: 60/40 split, search bar, 4-layer hierarchy, barcode scanning, hold/recall
  - F&B POS: large touch targets, "Ticket" label, "Send & Pay", repeat last item
  - Shared: ItemButton, Cart (type-aware), CartTotals, TenderDialog, ModifierDialog, OptionPickerDialog, PackageConfirmDialog, PriceOverrideDialog, ServiceChargeDialog, DiscountDialog
  - Catalog nav: DepartmentTabs, SubDepartmentTabs, CategoryRail, CatalogBreadcrumb, QuickMenuTab
  - Order history: list with filters + detail with receipt viewer + tenders section
- **Inventory Module**: 2 core tables + 7 receiving/vendor tables + 3 PO tables, 18 commands, 11 queries, 18 API routes
  - Append-only movements ledger: on-hand = SUM(quantity_delta), never a mutable column
  - Type-aware: F&B fractional qty, Retail integer, Package component-level deduction
  - 4 base commands: receiveInventory, adjustInventory, transferInventory, recordShrink
  - 3 event consumers: order.placed (type-aware deduct), order.voided (reversal), catalog.item.created (auto-create)
  - Stock alerts: low_stock and negative events emitted when thresholds crossed
  - Transfer: paired movements (transfer_out + transfer_in) with shared batchId, always validates non-negative at source
  - UOM support: `uoms` table + `itemUomConversions` for pack-to-base conversion (e.g., 1 CS = 24 EA)
  - Cost tracking: unitCost, extendedCost on movements; costingMethod, standardCost, currentCost on items
  - Idempotency: UNIQUE index on (tenantId, referenceType, referenceId, inventoryItemId, movementType) + ON CONFLICT DO NOTHING
  - Frontend: stock UI unified into catalog item detail page via `StockSection` component; standalone Stock Levels pages deleted
  - `StockSection`: location selector, stats cards (On Hand, Reorder Point, Par Level, Costing Method), stock details grid, Receive/Adjust/Shrink action buttons, movement history table with pagination
  - Extracted dialog components: `receive-dialog.tsx`, `adjust-dialog.tsx`, `shrink-dialog.tsx` (portal-based, reusable)
  - `useInventoryForCatalogItem` hook: resolves catalogItemId + locationId → inventory data (returns null when no record)
  - `getInventoryItemByCatalogItem` query: backend resolver for catalog→inventory lookup
  - API: `GET /api/v1/inventory/by-catalog-item?catalogItemId=xxx&locationId=yyy`
  - Catalog Items list page (`/catalog`) shows On Hand + Reorder Pt columns (enriched from inventory API)
  - **Receiving Subsystem** (Sessions 23-24):
    - 7 new tables: `vendors`, `uoms`, `itemUomConversions`, `itemVendors`, `itemIdentifiers`, `receivingReceipts`, `receivingReceiptLines`
    - Added `currentCost` NUMERIC(12,4) column to `inventoryItems` for live weighted avg / last cost
    - 4 pure services: shipping allocation (by_cost/by_qty/by_weight/none with remainder distribution), UOM conversion, costing (weighted avg + last cost), receipt calculator
    - 8 receiving commands: createDraftReceipt, updateDraftReceipt, addReceiptLine, updateReceiptLine, removeReceiptLine, postReceipt, voidReceipt, createVendor, updateVendor
    - 4 queries: getReceipt (with cost preview), listReceipts (cursor pagination, status/vendor/location filters), searchItemsForReceiving (barcode→SKU→name fallback), getReorderSuggestions (below-reorder-point items)
    - 11 API routes under `/api/v1/inventory/receiving/` + `/api/v1/inventory/vendors/`
    - Receipt lifecycle: DRAFT → POSTED → VOIDED (status-based, no hard deletes)
    - postReceipt: single transaction — recomputes all lines, creates inventory movements, updates `currentCost` per costingMethod, emits `inventory.receipt.posted.v1`
    - voidReceipt: inserts offsetting movements (type=void_reversal, qty=-baseQty), reverses weighted avg cost
    - Shipping allocation: precise remainder distribution ensures sum exactly equals shippingCost
    - Receipt number format: `RCV-YYYYMMDD-XXXXXX` (6 chars from ULID)
    - Validation schemas: `packages/modules/inventory/src/validation/receiving.ts`
    - Schema: `packages/db/src/schema/receiving.ts`, Migration: `0056_receiving.sql`
    - 49 tests across 4 test files (shipping allocation, costing, UOM conversion, receiving UI)
  - **Receiving Frontend** (Session 25):
    - Receipt list page: `/inventory/receiving` with status/vendor/date filters, cursor pagination
    - Receipt detail/edit page: `/inventory/receiving/[id]` with editable grid, live totals bar
    - `ReceivingGrid` component: inline-editable cells for qty, unitCost, UOM selection
    - `EditableCell` component: click-to-edit with blur/Enter commit, Escape cancel
    - `ReceiptHeader` component: vendor selector, receipt date, invoice number, shipping cost, freight mode
    - `use-receiving-editor` hook: manages draft receipt state, auto-save with debounce, line CRUD
    - `receiving-calc.ts`: pure calculation library (line totals, shipping allocation, receipt summary) — no side effects, easily testable
    - `ReceiptTotalsBar` component: sticky footer with subtotal, shipping, tax, grand total
    - `ItemSearchInput` component: barcode→SKU→name fallback search for adding receipt lines
    - Freight modes: ALLOCATE (distributes shipping across lines) vs EXPENSE (books shipping as separate expense)
  - **Vendor Management** (Session 24):
    - Additive migration 0058: `nameNormalized`, `website`, `defaultPaymentTerms` on vendors; `isActive`, `lastCost`, `lastReceivedAt`, `minOrderQty`, `packSize`, `notes` on itemVendors
    - Rule VM-1: Soft-delete only — vendors deactivated via `isActive=false`, never hard-deleted
    - Rule VM-2: Duplicate name prevention via `LOWER(TRIM(name))` → `name_normalized` with UNIQUE constraint `(tenant_id, name_normalized)`
    - Rule VM-3: Vendor catalog items (`item_vendors`) are soft-deletable via `isActive`
    - Rule VM-4: When receipt posted, auto-update `item_vendors.last_cost` + `last_received_at`; auto-create row if vendor+item pair doesn't exist
    - 5 vendor management commands: deactivateVendor, reactivateVendor, addVendorCatalogItem, updateVendorCatalogItem, deactivateVendorCatalogItem
    - 3 queries: getVendor (with aggregate stats: activeItems, totalReceipts, totalSpend, lastReceiptDate), listVendors (with itemCount/lastReceiptDate enrichment, searchVendors lightweight lookup), getVendorCatalog (paginated + getItemVendors reverse lookup)
    - Integration hooks: `getVendorItemDefaults()` (auto-fill receipt lines), `updateVendorItemCostAfterReceipt()` (inside postReceipt transaction)
    - Name normalization service: `normalizeVendorName()` — `name.trim().toLowerCase()`
    - 6 Zod schemas: vendorSchema, updateVendorManagementSchema, addVendorCatalogItemSchema, updateVendorCatalogItemSchema, vendorListFilterSchema
    - Preferred vendor enforcement: only one preferred per item, within transaction (toggle clears others first)
    - Vendor API routes: `/api/v1/inventory/vendors/` (GET list, POST create), `/api/v1/inventory/vendors/[id]` (GET detail, PATCH update)
  - **Purchase Orders Schema** (Session 24 — Phase 1 only):
    - 3 new tables in `packages/db/src/schema/purchasing.ts`: `purchaseOrders`, `purchaseOrderLines`, `purchaseOrderRevisions`
    - PO lifecycle: DRAFT → SUBMITTED → SENT → PARTIALLY_RECEIVED → CLOSED → CANCELED
    - Optimistic locking via `version` column (Rule PO-1)
    - Revision snapshots: JSONB snapshot stored on edit of submitted/sent POs (Rule PO-3)
    - PO lines track `qtyReceived` running total, updated when receipt posted
    - Added `purchaseOrderId` FK to `receivingReceipts` (plain text column, FK via migration to avoid circular import)
    - Migration: `0057_purchase_orders.sql` with RLS (12 policies)
- **Shared**: item-type utilities (incl. green_fee/rental → retail mapping), money helpers, ULID, date utils, slug generation, catalog metadata types
- **Reporting Module** (Session 17 schema + Session 18 consumers + Session 19 queries/routes):
  - **4 read model tables**: `rm_daily_sales`, `rm_item_sales`, `rm_inventory_on_hand`, `rm_customer_activity`
  - CQRS read models with `rm_` prefix — pre-aggregated projections updated by event consumers
  - Unique composite indexes for upsert-by-natural-key pattern (e.g., tenant+location+date)
  - `NUMERIC(19,4)` for monetary aggregates (not cents — these are reporting summaries)
  - `processed_events` enhanced with `tenant_id` column for consumer idempotency
  - RLS: FORCE ROW LEVEL SECURITY + 4 policies per table (16 total)
  - **4 event consumers**: `handleOrderPlaced` (order.placed.v1), `handleOrderVoided` (order.voided.v1), `handleTenderRecorded` (tender.recorded.v1), `handleInventoryMovement` (inventory.movement.created.v1)
  - All consumers use atomic idempotency: INSERT into `processed_events` + upsert read model in same transaction
  - Business date utility: `computeBusinessDate(occurredAt, timezone, dayCloseTime?)` — IANA timezone + day-close-time offset
  - **4 query services**: `getDailySales` (single/multi-location aggregation), `getItemSales` (top-N with sort), `getInventorySummary` (below-threshold filter), `getDashboardMetrics` (today's KPIs)
  - **CSV export**: `toCsv(columns, rows)` — RFC 4180 escaping, UTF-8 BOM for Excel
  - **6 API routes**: `/api/v1/reports/{daily-sales, item-sales, inventory-summary, dashboard}` + 2 CSV export endpoints
  - Permissions: `reports.view` for data queries, `reports.export` for CSV downloads
  - Schema: `packages/db/src/schema/reporting.ts`, Migration: `0049_reporting_read_models.sql`
  - Consumers: `packages/modules/reporting/src/consumers/`
  - Queries: `packages/modules/reporting/src/queries/`
  - Routes: `apps/web/src/app/api/v1/reports/`
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
- **Reporting Module** (Sessions 17-21):
  - **Backend**: 4 read model tables (`rm_daily_sales`, `rm_item_sales`, `rm_inventory_on_hand`, `rm_customer_activity`), 4 event consumers, business date utility, 4 query services, CSV export utility (RFC 4180 + UTF-8 BOM), 6 API routes (4 JSON + 2 CSV export)
  - **Frontend**: Reports page (`/reports`) with 3-tab layout (Sales, Items, Inventory), 4 KPI metric cards with 60s auto-refresh, Recharts line/bar charts, DataTable integration, CSV export buttons, DateRangePicker with quick-select, location selector
  - **Components**: 5 report components (DateRangePicker, MetricCards, SalesTab, ItemsTab, InventoryTab), 4 data hooks (useReportsDashboard, useDailySales, useItemSales, useInventorySummary), formatReportMoney + buildExportUrl helpers
  - **Custom Report Builder** (Session 21 — Semantic Layer):
    - 3 new tables: `reporting_field_catalog` (system), `report_definitions`, `dashboard_definitions`
    - Field catalog: 31 fields across 4 datasets (daily_sales, item_sales, inventory, customers)
    - Query compiler: `compileReport()` — validates fields against catalog, builds parameterized SQL, enforces guardrails (tenant isolation, date range required for time-series, max 365d range, max 10K rows, max 20 cols/15 filters)
    - 4 commands: `saveReport`, `deleteReport` (soft), `saveDashboard`, `deleteDashboard` (soft)
    - 5 new queries: `getFieldCatalog`, `getReport`, `listReports`, `runReport`, `getDashboard`, `listDashboards`
  - **Custom Report Builder Frontend** (Session 22):
    - Report builder UI: field picker (dimensions/measures), filter builder (typed operators), chart preview (line/bar/table/metric via Recharts), client-side validation mirroring server guardrails
    - Saved reports list with CRUD, cursor pagination, CSV export, permission-gated actions
    - Dashboard builder with @dnd-kit drag-and-drop, 12-column CSS Grid, preset tile sizes (S/M/L), auto-refresh
    - Dashboard viewer (read-only), saved dashboards list
    - 7 Next.js pages: `/reports/custom`, `/reports/custom/new`, `/reports/custom/[id]`, `/dashboards`, `/dashboards/new`, `/dashboards/[id]`, `/dashboards/[id]/edit`
    - 3 hooks: `useFieldCatalog`, `useCustomReports` (CRUD + run + export), `useDashboards` (CRUD)
    - Backend tile cache: in-memory TTL Map, tenant-isolated cache keys
    - V2-ready `report_snapshots` table (migration 0051, schema only)
    - Sidebar: Reports now expandable with Overview, Custom Reports, Dashboards sub-items
    - 13 API routes: field catalog, custom report CRUD+run+export, dashboard CRUD
  - Permissions: `reports.view`, `reports.export`, `reports.custom.view`, `reports.custom.manage`
- **Golf Reporting Module** (Session 24):
  - Separate module: `packages/modules/golf-reporting/`
  - **Schema**: `packages/db/src/schema/golf-reporting.ts` — golf-specific read model tables + lifecycle tables
  - **Migrations**: `0052_golf_reporting_read_models.sql`, `0053_golf_lifecycle_tables.sql`, `0054_golf_field_catalog.sql`
  - **11 event consumers**: tee-time lifecycle events, channel daily aggregation, folio events, pace tracking
  - **5 query services**: golf dashboard metrics, revenue analytics, utilization rates, daypart analysis, customer golf analytics
  - **3 KPI modules**: channel performance, pace of play, tee-sheet utilization
  - **Seeds**: default golf dashboards for common reporting views
  - **Frontend**: 5 golf report components (channels, customers, metric-cards, pace-ops, revenue, utilization tabs)
  - **Hooks**: `useGolfReports`, `useReportFilters`, `useNavigationGuard`
  - **Types**: `apps/web/src/types/golf-reports.ts`
  - **API routes**: full golf reports suite under `/api/v1/reports/golf/`
  - **4 test files** covering consumers and query services
- **Room Layouts Module** (Sessions 1-14):
  - **Backend**: `packages/modules/room-layouts/` — 3 DB tables (`floor_plan_rooms`, `floor_plan_versions`, `floor_plan_templates_v2`) with RLS (12 policies), 11 commands (createRoom, updateRoom, archiveRoom, unarchiveRoom, saveDraft, publishVersion, revertToVersion, duplicateRoom, createTemplate, updateTemplate, deleteTemplate) + applyTemplate, 7 queries (listRooms, getRoom, getRoomForEditor, getVersionHistory, getVersion, listTemplates, getTemplate), slug generation with conflict handling, 8 event types emitted (no consumers — standalone module)
  - **Schema**: `packages/db/src/schema/room-layouts.ts`, Migration: `0070_room_layouts.sql`
  - **Shared types**: `packages/shared/src/types/room-layouts.ts` — CanvasObject, CanvasSnapshot, LayerInfo, ObjectType (14 types), TableProperties, StationProperties, ServiceZoneProperties, TextLabelProperties, etc.
  - **Frontend Editor** (Konva.js + react-konva): Full drag-and-drop floor plan editor with 3-layer canvas architecture (grid, objects, UI), Zustand + immer state management, 14 object types (table, chair, wall, door, window, stage, bar, buffet, dance_floor, divider, text_label, decoration, service_zone, station), snap-to-grid, multi-select with Shift+click and marquee selection, Transformer for resize/rotate, context menu, z-index manipulation, copy/paste/duplicate (Ctrl+C/V/D), undo/redo with 50-entry history cap
  - **Canvas Objects**: TableNode (shape-aware: round/square/rectangle/oval with seat count + table number), WallNode, DoorNode, TextNode, ServiceZoneNode (dashed border with label), StationNode (color-coded circle markers: POS/Wait/Bus/Host/Bar), GenericNode (fallback)
  - **Panels**: PalettePanel (drag-to-add with 5 groups: Tables, Seating, Walls & Doors, Zones & Service, Stations), InspectorPanel (dynamic property editing per object type), LayersPanel (CRUD, visibility/lock toggles, drag reorder), AlignTools (6 align + 2 distribute options for multi-select)
  - **Templates**: SaveAsTemplateDialog (name, description, category, widthFt, heightFt), TemplateGallery (portal dialog with search + category filter, SVG thumbnails), ApplyTemplateDialog (two-step: select → confirm), template CRUD API, createRoomFromTemplateApi (two-step: create room → apply template)
  - **Version History**: VersionHistory sidebar (list versions with numbers, publish notes, restore), PublishDialog (publish with optional note — always saves draft before publishing regardless of isDirty)
  - **Room Modes**: ModeManagerDialog (CRUD modes, set default, copy from existing), mode selector in toolbar
  - **Export**: PNG export (Konva `stage.toDataURL()` with 2x pixel ratio), JSON snapshot export
  - **Validation**: Room validation (name 1-100, dimensions 5-500ft, grid 0.25-10ft, scale 5-100px/ft), object validation (valid types, bounds check, seat requirements), publish validation (min 1 object, table numbers, capacity > 0, overlap detection)
  - **Error Boundary**: CanvasErrorBoundary wraps Konva Stage — on crash shows "Canvas Error" with "Reload Editor" button, preserves snapshot in Zustand
  - **Floor Plan Viewer**: Read-only Konva component with auto-fit scaling for embedding in other views
  - **Code-split**: `page.tsx` = thin `next/dynamic` wrapper, heavy content in `editor-content.tsx` / `room-layouts-content.tsx`
  - **Dark mode**: All room layout components use `bg-surface` for theme-aware backgrounds, opacity-based hover states (`hover:bg-gray-200/50`), no `dark:` prefixed classes (relies on inverted gray scale from globals.css). Includes: all dialogs (create/edit/duplicate/publish/mode-manager/save-template/apply-template/template-gallery), search box, actions dropdown, context menu, inspector panel inputs, color picker, layers panel, version history sidebar, revert confirmation, status bar, align tools
  - **Integration**: `room_layouts` in MODULE_REGISTRY, entitlement-gated sidebar under Settings, permission seeds (Owner/Manager: view+manage, Supervisor: view+manage, Cashier/Server/Staff: view), onboarding provisioning for restaurant/golf/hybrid business types
  - **Hooks**: `useRoomLayouts`, `useRoom`, `useRoomEditor`, `useRoomTemplates`, `useRoomLayoutAutosave` (3s debounce)
  - **API routes**: 17 routes under `/api/v1/room-layouts/` (rooms CRUD, draft, publish, revert, duplicate, editor, versions, templates CRUD, apply template)
  - **199 tests** across 11 test files (store: 65, validation: 61, canvas utils: 41, templates: 10, helpers: 11, export: 11)
- **Speed Improvements** (Session 24):
  - **POS catalog optimization**: new `getCatalogForPOS` single-query loader in `packages/modules/catalog/src/queries/get-catalog-for-pos.ts` — replaces multiple API calls with one optimized query
  - **New API route**: `POST /api/v1/catalog/pos` — POS-optimized catalog endpoint
  - **POS hooks refactored**: `useCatalogForPOS` (+170 lines) and `useRegisterTabs` (+191 lines) rewritten for performance
  - **Customer search indexes**: migration `0055_customer_search_indexes.sql` — new DB indexes for customer search performance
  - **Customer search query**: `packages/modules/customers/src/queries/search-customers.ts` — optimized query execution
  - **Order fetch optimization**: `packages/modules/orders/src/queries/get-order.ts` — streamlined order loading
  - **Middleware performance**: `packages/core/src/auth/with-middleware.ts` — perf tweaks to auth middleware chain
  - **Layout slimmed**: dashboard layout reduced by 32 lines, settings page simplified by 80 lines
  - **Receiving search indexes**: migration `0062_receiving_search_indexes.sql` — trigram GIN indexes on `catalog_items(name, sku)`, `item_identifiers(value)`, `vendors(name)` for fast ILIKE search
  - **RLS policy fix**: migration `0059_fix_rls_role_policies.sql` — corrected role restriction on RLS policies
- **Speed Improvements** (Session 25):
  - **Code-split all heavy pages**: every page >100 lines under `(dashboard)/` uses thin `page.tsx` wrapper with `next/dynamic` + `ssr: false` — route transitions commit instantly with loading skeleton, heavy JS loads async. 16 pages split: catalog, orders, settings, taxes, memberships, vendors, reports, golf-reports, customer-detail, item-detail, billing-detail, order-detail, item-edit, vendor-detail, receipt-detail, plus both POS shells
  - **Loading skeletons**: custom per-page skeletons for catalog, orders, settings, dashboard; reusable `PageSkeleton` component (`apps/web/src/components/ui/page-skeleton.tsx`) for detail pages
  - **POS instant mode switching**: both Retail and F&B POS mount in the shared layout (`pos/layout.tsx`) and toggle via CSS (`invisible pointer-events-none`). No route transition — switching is immediate. Lazy-mount on first visit, keep mounted forever. `isActive` prop gates barcode listener + closes portal dialogs on deactivation
  - **Combined catalog+inventory API**: `listItems` accepts `includeInventory` flag to batch-fetch inventory data (on-hand, reorder point) in same query — eliminates separate `/api/v1/inventory` call on catalog page. API: `GET /api/v1/catalog/items?includeInventory=true`
  - **Category fetch deduplication**: module-level `_catCache` with in-flight promise dedup + 30s TTL — 3 identical category API calls (departments, sub-departments, categories) share 1 request
  - **Covering indexes**: migration `0065_list_page_indexes.sql` — `idx_tenders_tenant_status_order` for order list tender aggregation; `idx_inventory_movements_onhand` with `INCLUDE (quantity_delta)` for index-only on-hand SUM scans
  - **Dashboard stale-while-revalidate**: uses `/api/v1/reports/dashboard` (pre-aggregated CQRS read models) for KPIs instead of fetching 100 raw orders. SessionStorage cache with business-date invalidation. Cached data renders instantly, background refresh keeps it fresh
  - **Dashboard data reduction**: orders `limit=100` → `limit=5`, inventory `limit=50` → `limit=5` (only 5 of each displayed)
  - **Sidebar z-index fix**: desktop sidebar `relative z-40` keeps it above POS overlay backdrops (z-30); main content `relative z-0` creates stacking context isolation so POS overlays stay scoped
  - **Portal dialog cleanup on POS switch**: `useEffect` closes all portaled dialog states when `isActive` becomes false, preventing leaked dialogs across POS modes

- **Speed & Stability Improvements** (Session 26):
  - **Dashboard instant navigation**: replaced raw `useEffect` + `apiFetch` with React Query (`@tanstack/react-query`) in dashboard — auto AbortSignal cancellation on unmount prevents slow API calls from blocking browser connection pool during navigation. `QueryProvider` wraps dashboard layout; `staleTime: 60_000` for cache
  - **Dashboard code-split**: extracted 478-line `page.tsx` to `dashboard-content.tsx` + thin `next/dynamic` wrapper, matching the code-split pattern used by all other heavy pages
  - **`apiFetch` AbortError handling**: added `DOMException`/`AbortError` guard before network error logging — navigating away no longer spams console with "Failed to fetch" errors
  - **POS customer persistence fix**: removed race-condition auto-clear `else if` branch from sync-back effect in `use-register-tabs.ts` — orderId clearing now happens ONLY via explicit `clearActiveTab()` after payment/void/hold. Added `isSwitching` guards on both cached and server loading paths to prevent orderId wipe during rehydration
  - **`clearActiveTab` clears label too**: after payment/void/hold, both `orderId` AND `label` (customer name) are reset — prevents stale customer names lingering on tabs
  - **POS tender placeOrder 409 recovery**: `placeOrder()` now recovers from "already placed" 409 by fetching the placed order instead of clearing POS state — prevents race between preemptive placeOrder and user clicking Pay
  - **TenderDialog graceful placeOrder failure**: `handleSubmit` catches placeOrder errors and re-fetches order status — if order IS placed on server, continues to tender instead of showing confusing "Payment conflict" toast
  - **Query performance indexes**: migrations `0066_query_performance_indexes.sql` + `0067_query_audit_indexes.sql`
  - **Tax calc improvements**: zero-price early return, `TaxMode` type alias, JSDoc updates; `@oppsera/module-catalog/src/tax-calc.ts` replaced with re-export from `@oppsera/core`
  - **New tax test scenarios**: 9+ test cases in `test/business-logic/unit/calculations/tax.test.ts` covering inclusive/exclusive, compound, rounding, cart totals

- **Accounting Core Module** (Sessions 28-29, 32, 34):
  - **14 schema tables**: gl_accounts, gl_classifications, gl_journal_entries, gl_journal_lines, gl_journal_number_counters, gl_account_templates, gl_classification_templates, accounting_settings, gl_unmapped_events, accounting_close_periods, financial_statement_layouts, financial_statement_layout_templates, bank_reconciliations, bank_reconciliation_items
  - **4 mapping tables**: sub_department_gl_defaults, payment_type_gl_defaults, tax_group_gl_defaults, bank_accounts
  - **2 recurring tables**: recurring_journal_templates, recurring_journal_template_lines
  - **Migrations**: 0071-0075 (GL core, mappings, bank accounts, close periods), 0077 (financial statements), 0084 (order_lines GL columns: sub_department_id, tax_group_id), 0099-0107 (legacy GL gate, tips/svc charge settings, GL dimensions, COA templates, line-item returns, F&B GL mappings, voucher GL audit, membership GL, chargebacks), 0119-0122 (multi-currency + recurring journals, reconciliation waterfall, bank reconciliation)
  - **22 commands**: postJournalEntry, postDraftEntry, voidJournalEntry, updateAccountingSettings, lockAccountingPeriod, createGlAccount, updateGlAccount, createGlClassification, updateGlClassification, saveSubDepartmentDefaults, savePaymentTypeDefaults, saveTaxGroupDefaults, saveBankAccount, bootstrapTenantAccounting, updateClosePeriod, closeAccountingPeriod, saveStatementLayout, generateRetainedEarnings, startBankReconciliation, clearReconciliationItems, addBankAdjustment, completeBankReconciliation
  - **26 queries**: getAccountBalances, getJournalEntry, listJournalEntries, listGlAccounts, getTrialBalance, getGlDetailReport, getGlSummary, listUnmappedEvents, reconcileSubledger, listBankAccounts, getMappingCoverage, getCloseChecklist, listClosePeriods, getProfitAndLoss, getBalanceSheet, getSalesTaxLiability, getCashFlowSimplified, getPeriodComparison, getFinancialHealthSummary, listStatementLayouts, getSubDepartmentMappings, getItemsBySubDepartment, getReconciliationWaterfall, listBankReconciliations, getBankReconciliation, getAuditCoverage
  - **9 adapters**: pos-posting-adapter, void-posting-adapter, return-posting-adapter, fnb-posting-adapter, voucher-posting-adapter, membership-posting-adapter, chargeback-posting-adapter, folio-posting-adapter, legacy-bridge-adapter
  - **Helpers**: bootstrapTenantCoa, resolveMapping, generateJournalNumber, validateJournal, resolveNormalBalance, getAccountingSettings, catalogGlResolution (resolveRevenueAccountForSubDepartment, expandPackageForGL)
  - **~43 API routes** under `/api/v1/accounting/`
  - **278 tests** across 21 test files
  - Posting engine: double-entry validation, period locking, control account restrictions, idempotent posting via sourceReferenceId
  - COA bootstrap: template-based (golf/retail/restaurant/hybrid defaults), creates classifications → accounts → settings atomically
  - Financial statements: P&L (date range, comparative, location-filterable), Balance Sheet (as-of with retained earnings), Cash Flow (simplified), Period Comparison, Financial Health Summary
  - Sales tax liability report from GL
  - Close workflow: period status tracking, live checklist (drafts, unmapped, trial balance, AP/AR reconciliation, legacy GL warning, tips/svc charge config, sub-dept mapping completeness)
  - POS adapter: tender → GL posting with subdepartment-resolved revenue, package component splitting, never blocks tenders, logs unmapped events
  - **Catalog→GL pipeline**: `order_lines.sub_department_id` + `tax_group_id` populated at addLineItem time, `tender.recorded.v1` event enriched with `lines[]` (subDepartmentId, taxGroupId, taxAmountCents, packageComponents), POS adapter splits package revenue across component subdepartments via `allocatedRevenueCents`
  - **Accounting Alignment Remediation** (Sessions 37-48):
    - **Session 37**: Legacy GL gate (`enableLegacyGlPosting` setting), proportional allocation for split tenders, remainder method for final tender
    - **Session 38**: Complete GL categories — discounts, tips (→ Tips Payable), service charges (→ Service Charge Revenue), processing fees (→ fee expense), returns foundation. New settings: `defaultTipsPayableAccountId`, `defaultServiceChargeRevenueAccountId`
    - **Session 39**: Void GL reversal (`void-posting-adapter.ts`), legacy void gating behind `enableLegacyGlPosting`
    - **Session 40**: GL journal line dimensions — `profitCenterId`, `subDepartmentId`, `terminalId`, `channel` on `gl_journal_lines`
    - **Session 41**: Close checklist enhancements (legacy GL warning, tips/svc charge config, sub-dept mapping completeness, POS legacy reconciliation)
    - **Session 42**: COA templates updated (Tips Payable 2160, Service Charge Revenue 4500), `bootstrapTenantCoa` wires new accounts, backfill script for existing tenants
    - **Session 43**: Line-item refunds (`createReturn` command, `return-posting-adapter.ts`, `recordRefund` command, inventory reversal)
    - **Session 44**: F&B GL wiring (`fnb-posting-adapter.ts` consumes `fnb.gl.posting_created.v1`, `fnb_gl_account_mappings` table, category→account resolution)
    - **Session 45**: Voucher deferred revenue (purchase: Dr Cash Cr Liability, redeem: Dr Liability Cr Revenue, expire: Dr Liability Cr Breakage Income)
    - **Session 46**: Membership GL (Dr AR Cr Deferred Revenue), `billingAccountId` on orders, AR bridge consumer
    - **Session 47**: Chargeback support (`chargebacks` table, `recordChargeback`/`resolveChargeback` commands, GL posting: received/won/lost lifecycle)
    - **Session 48**: Posting matrix validation tests (26 tests validating debits=credits across all adapters), integration test scaffolding
    - **9 new migrations**: 0099-0107 (legacy GL gate, tips/svc charge settings, GL dimensions, COA templates, line-item returns, F&B GL mappings, voucher GL audit, membership GL, chargebacks)
    - **7 new commands**: purchaseVoucher, redeemVoucher, expireVouchers, recordChargeback, resolveChargeback, createReturn, recordRefund
    - **7 new adapters**: void, return, fnb, voucher (3 handlers), membership, chargeback (2 handlers)
    - All adapters follow never-throw pattern — GL failures never block business operations
- **Member Portal App** (`apps/member-portal/`) — Session 2026-02-22:
  - **Standalone Next.js 15 app** for member self-service (billing, contracts, spending, statements)
  - **Multi-tenant discovery**: `[tenantSlug]/` dynamic routes, `find-club/` page for tenant lookup
  - **Portal auth**: `POST /api/auth/login` (email + tenant slug → portal token), `withPortalAuth()` middleware, JWT signing via `createPortalToken()`
  - **Portal pages**: `(portal)/` group — dashboard, account, spending analysis, statements
  - **Portal API routes**: account summary, autopay config, billing statements, spending analysis, initiation/contracts
  - **Hooks**: `usePortalAuth()`, `usePortalData()`
  - **Components**: `PortalHeader`, `PortalNav`
- **Customer Sub-Resource API Expansion** (Session 2026-02-22):
  - **50+ new API routes** under `/customers/[id]/`: activity-feed, addresses CRUD, aging, applicable-discount-rules, audit, contacts-360, emails CRUD, emergency-contacts, files, financial account detail + adjust + autopay + credit-limit + hold, header, ledger, member-number, messages, notes, overview, phones CRUD, privileges-extended, relationships-extended + CRUD, stored-value + redeem + reload + void + transfer, discount-rules CRUD + toggle
  - **Member portal API** (6 routes): `/member-portal/account`, `/member-portal/autopay`, `/member-portal/initiation`, `/member-portal/minimums`, `/member-portal/statements`, `/member-portal/summary`
  - **Membership management API** (20+ routes): accounts CRUD, authorized-users, autopay, billing-items, classes, collections, freeze/holds, initiation contracts + bill + cancel + extra-principal + payoff
- **Guest Pay (QR Code Pay at Table)** (Session 2026-02-23):
  - **Schema**: `guest_pay_sessions` table (token, status lifecycle, tip settings) — migration 0137
  - **Guest-facing page**: `/(guest)/pay/[token]/` — standalone payment page with member auth, tip selection, round-up donations
  - **Commands**: `createGuestPaySession`, `selectGuestPayTip`, `simulateGuestPayment` (V1), `chargeGuestMemberAccount`, `expireGuestPaySessions`, `invalidateGuestPaySession`, `updateGuestPayTipSettings`
  - **Queries**: `getGuestPaySession`, `getGuestPaySessionByToken`, `getActiveGuestPayForTab`, `listGuestPaySessionsForTab`, `getGuestPayTipSettings`
  - **Session lifecycle**: active → paid | expired | invalidated | superseded
  - **Tokens**: 256-bit base64url (unguessable), tip settings snapshot as JSONB
- **COA Governance** (Session 2026-02-23):
  - **Account merge**: `mergeGlAccounts` command + `MergeAccountDialog` UI — merges balances, reassigns journal lines, audit trail
  - **Account renumbering**: `renumberGlAccount` — change account number while preserving history
  - **CSV COA import**: `importCoaFromCsv` — CSV → validation → account creation → GL mapping auto-wire
  - **COA health dashboard**: `getCoaHealth` query + API route — hierarchy validation, orphan detection, classification consistency
  - **Account change log**: `account-change-log.ts` service — append-only audit trail per account
  - **1,500+ new accounting tests**: account merge (143), bootstrap templates (226), COA validation (367), CSV import (299), hierarchy (135), posting matrix (191), state placeholder (201)
- **F&B Payment Tier 3** (Session 2026-02-23):
  - **Gift card balance lookup** API + UI
  - **House account member lookup + charge** — member search, billing account selection, charge authorization
  - **Loyalty program redemption** routes (stubs)
  - **NFC payment initiation** stubs
  - **Fractional split tender** support
  - **Enhanced FnbPaymentView**: 332 → 619 lines with payment adjustments panel, gift cards, house accounts
  - **Migration 0136**: F&B payment tier 3 provisioning — gift cards, house accounts, QR code payments
- **GL Remap Workflow** (Session 2026-02-23):
  - **Preview**: `POST /api/v1/accounting/unmapped-events/remap/preview` — find tenders that can be auto-remapped based on new mapping rules
  - **Execute**: `POST /api/v1/accounting/unmapped-events/remap` — batch remap GL entries
  - **Commands**: `remapGlForTender` (185 lines), `tryAutoRemap` helper (46 lines)
  - **Query**: `getRemappableTenders` (180 lines)
  - **Auto-remap setting**: `accounting_settings.enable_auto_remap` boolean (migration 0143)
  - **Frontend**: `RemapPreviewDialog` (352 lines), `useGlRemap` hook (128 lines)
  - **ReconciliationReadApi expanded**: 20 → 61 methods with `getTendersForRemapping`, `getPaymentsForRemapping`, `getTransactionsWithGlStatus`
- **Admin Impersonation** (Session 2026-02-23):
  - **Schema**: `admin_impersonation_sessions` table (migration 0141) — tracks session, expiry, action count, audit trail
  - **API routes**: `POST /api/v1/auth/impersonate` (start), `POST /api/v1/auth/impersonate/end` (end)
  - **Frontend**: `/impersonate` page with Suspense boundary, `ImpersonationBanner` component
  - **Auth middleware**: detects impersonation token in refresh, tracks action count in audit log
  - **Tenant role CRUD**: admin API for tenant-scoped role management (create/read/update/delete), `TenantRolesTab` component (465 lines)
- **RBAC & Permission Seed Fixes** (Session 2026-02-23):
  - Admin role gets `*` wildcard permissions (like Owner, but can be location-scoped)
  - All 6 system roles get `pos_fnb.floor_plan.view` by default
  - Cashier gets `pos_fnb.tabs.manage`, `pos_fnb.kds.view`, `pos_fnb.payments.create`
  - Admin + Manager roles get `pos_fnb.*`, `accounting.*`, `ap.*`, `ar.*`
  - Dead letter routes now read from persistent `event_dead_letters` table (was in-memory, lost on Vercel cold starts)
  - Migration 0134 made fully idempotent (`DROP POLICY IF EXISTS`, `IF NOT EXISTS` for indexes)
- **Property Management System (PMS)** (`packages/modules/pms/`) — Session 2026-02-24:
  - **50+ schema tables** in `packages/db/src/schema/pms.ts`: properties, room types, rooms, rate plans, rate plan prices, guests, reservations, room blocks, folios, folio entries, room status log, audit log, idempotency keys, outbox, rate restrictions, payment methods, payment transactions, deposit policies, cancellation policies, message templates, message log, housekeepers, housekeeping assignments, work orders, work order comments, rate packages, groups, group room blocks, corporate accounts, corporate rate overrides, pricing rules, pricing log, channels, channel sync log, booking engine config, room assignment preferences, guest portal sessions, loyalty programs, loyalty members, loyalty transactions
  - **CQRS read models**: `rm_pms_calendar_segments`, `rm_pms_daily_occupancy`, `rm_pms_revenue_by_room_type`, `rm_pms_housekeeping_productivity`
  - **55+ commands**: property/room/rate CRUD, reservation lifecycle (create, update, cancel, no-show, check-in/check-out, move room, resize), folio posting/close, rate restrictions, payment methods, deposits (authorize/capture), card charges, refunds, deposit/cancellation policies, messaging (templates, send, log), housekeeping (assign, start/complete/skip cleaning, work orders), rate packages, groups (create, blocks, pickup, release), corporate accounts + rate overrides, pricing rules + engine, channels (create, update, sync), booking engine config, room assignment preferences + auto-assignment, guest portal sessions, loyalty programs + enrollment + earn/redeem/adjust points
  - **60+ queries**: list/get for all entities, calendar week/day/month views, occupancy forecast, revenue by room type, pickup report, manager flash report, no-show report, housekeeping productivity, pricing preview/log, channel sync log, booking engine config, room suggestions, guest portal folio, loyalty transactions
  - **State machines**: `RESERVATION_TRANSITIONS` (confirmed→checked_in→checked_out, confirmed→cancelled, confirmed→no_show), `ROOM_STATUS_TRANSITIONS` (clean→occupied→dirty→cleaning→inspected→clean). Assert functions throw `InvalidStatusTransitionError`.
  - **Event consumers**: `handleCalendarProjection`, `handleOccupancyProjection` for CQRS read model updates
  - **Background jobs**: `runNightlyChargePosting`, `runNoShowMarking`, `runHousekeepingAutoDirty`
  - **Helpers**: `bootstrapPropertiesFromLocations`, `computeDynamicRate` (pricing engine), `scoreRoom`/`rankRooms` (room assignment), `renderTemplate` (message templates), SMS/Stripe gateway stubs
  - **30+ PMS permissions** across 10 categories (properties, rooms, reservations, rates, guests, folios, housekeeping, reports, settings, channels, loyalty)
  - **Own idempotency + outbox tables**: `pms_idempotency_keys`, `pms_outbox` — module-specific for microservice extractability
  - **Migrations**: 0148-0168 (rate restrictions, deposits/payments, communications, reporting, housekeeping/maintenance, rate packages, groups/corporate, pricing rules, channels/booking, auto-assignment, guest portal, loyalty)
  - **Frontend**: `use-pms.ts` hook, PMS calendar page (code-split), sub-pages for corporate, groups, loyalty, maintenance, reports, revenue management
- **Semantic Layer Upgrades** (Session 2026-02-24):
  - **Dual-mode pipeline**: Mode A (metrics via registry compiler) + Mode B (SQL via LLM generation). Mode routing is automatic based on intent and schema availability
  - **SQL generation pipeline**: `generateSql()` → `validateGeneratedSql()` → `executeSqlQuery()` → auto-retry via `retrySqlGeneration()`. Full schema catalog built from live DB introspection via `buildSchemaCatalog()`
  - **SQL validation (defense-in-depth)**: SELECT/WITH only, no DDL/DML/TX/utility commands, no dangerous functions, no comments/semicolons, tenant_id=$1 required, LIMIT required (except aggregates), table whitelist
  - **RAG few-shot retrieval**: `retrieveFewShotExamples()` injects similar past queries into SQL generator system prompt. Best-effort, never blocks
  - **Conversation pruning**: `pruneForSqlGenerator()` with token-aware history trimming
  - **LLM response cache**: Separate from query cache. Keyed on `(tenantId, promptHash, message+dataSummary, history)`. Prevents redundant LLM calls for identical questions with same data
  - **Intelligence enrichments**: `generateFollowUps()` (suggested questions), `inferChartConfig()` (auto chart type), `scoreDataQuality()` (confidence scoring)
  - **Eval training platform expanded**: batch review, conversation analysis, cost analytics, experiments, regression testing, safety engine, example effectiveness tracking, bulk import/export
  - **New admin pages**: 8 new sub-pages under `/train-ai/` (batch-review, comparative, conversations, cost, experiments, playground, regression, safety)
- **Insights Sub-Pages** (Session 2026-02-24):
  - **Authoring**: `/insights/authoring` — semantic authoring panel for creating custom metrics/reports
  - **Embeds**: `/insights/embeds` — embeddable widget management
  - **Reports**: `/insights/reports` — NL report builder panel
  - **Tools**: `/insights/tools` — analysis tools
  - **Watchlist**: `/insights/watchlist` — metric watchlist panel
  - **Components**: `SemanticAuthoringPanel`, `EmbeddableWidget`, `NLReportBuilderPanel`, `WatchlistPanel`, `AnnotationOverlay`, `BranchTree`, `CorrelationChart`, `DataLineagePanel`, `DataQualityBadge`, `DigestViewer`, `DrillDownTable`, `FollowUpChips`, `ForecastChart`, `InlineChart`, `NotificationBell`, `PosInsightCard`, `RootCausePanel`, `ScheduledReportsPanel`, `VoiceInput`, `WhatIfPanel`
  - **Hooks**: `use-agentic`, `use-ai-alerts`, `use-ai-digests`, `use-ai-feed`, `use-ai-findings`, `use-ai-goals`, `use-ai-preferences`, `use-ai-shared`, `use-ai-simulations`, `use-annotations`, `use-branches`, `use-correlations`, `use-data-quality`, `use-digests`, `use-embed-widgets`, `use-forecast`, `use-nl-report`, `use-pinned-metrics`, `use-root-cause`, `use-scheduled-reports`, `use-whatif`
- **Catalog Import System** (Session 2026-02-24):
  - **Inventory import**: `importInventory` command, `InventoryImportWizard` component, `use-inventory-import.ts` hook, `inventory-import-analyzer.ts`, `inventory-import-parser.ts`, `inventory-import-validator.ts` services, `validation-import.ts` schemas
  - **Customer import**: `bulkImportCustomers` command, `use-customer-import.ts` hook, CSV import test suite
  - **Staff import**: `use-staff-import.ts` hook, migration 0162
  - **Unified import framework**: `apps/web/src/lib/import-registry.ts`, `apps/web/src/components/import/` shared components, `/settings/data-imports` page, `use-import-wizard.ts`, `use-import-jobs.ts`, `use-import-progress.ts`, `use-import-completion.ts`
- **Customer Tag Management** (Session 2026-02-24):
  - **11 commands**: `createTag`, `updateTag`, `archiveTag`, `unarchiveTag`, `applyTagToCustomer`, `removeTagFromCustomer`, `createSmartTagRule`, `updateSmartTagRule`, `toggleSmartTagRule`, `evaluateSmartTags`
  - **8 queries**: `listTags`, `getTag`, `getTaggedCustomers`, `getCustomerTags`, `listSmartTagRules`, `getSmartTagRule`, `getSmartTagEvaluationHistory`, `getTagAuditLog`
  - **Schema**: `packages/db/src/schema/tags.ts`, migration 0163
  - **API routes**: `/api/v1/customers/tags/`, `/api/v1/customers/[id]/tags/`, `/api/v1/customers/smart-tag-rules/`
  - **Settings page**: `/settings/tag-management`
- **Build & Deployment Fixes** (Session 2026-02-22–23):
  - **Vercel build blockers resolved** across all 3 apps (web, admin, member-portal)
  - 30+ ESLint `consistent-type-imports` fixes, unused variable removal
  - Admin app: `workspace:*` for `@oppsera/core`, added to `transpilePackages`
  - Webpack watchOptions fix for Windows EPERM (all 3 apps)
  - Member portal: dotenv loading from monorepo root
  - `useSearchParams` wrapped in Suspense boundary for Next.js 15 static generation
  - Removed `eslint-disable` for non-loaded `react-hooks/exhaustive-deps` rule
- **Migrations 0134–0143** (Session 2026-02-22–23):
  - `0134_rls_and_index_hardening.sql`: idempotent RLS policy + index fixes
  - `0135_uncategorized_revenue_fallback.sql`: fallback GL accounts (account 49900)
  - `0136_fnb_payment_tier3.sql`: gift cards, house accounts, QR code payments
  - `0137_guest_pay_sessions.sql`: guest pay sessions table
  - `0138_coa_governance.sql`: account renumbering, merge, hierarchy validation
  - `0139_guest_pay_member_charge.sql`: house account billing for members
  - `0140_fnb_subdepartment_revenue.sql`: GL tracking by subdepartment
  - `0141_admin_impersonation.sql`: admin impersonation sessions
  - `0142_gl_remap_index.sql`: source reference index for remap lookups
  - `0143_auto_remap_setting.sql`: `enable_auto_remap` on accounting_settings
  - **Dashboard & Reporting Fixes** (Session 2026-02-23):
  - **Dashboard fallback chain**: `getDashboardMetrics` now has 3-tier fallback: (1) CQRS read models (`rm_daily_sales`), (2) operational tables filtered by today's business date, (3) all-time orders with no date filter. Labels update dynamically ("Total Sales Today" vs "Total Sales") based on which data source was used
  - **Reporting consumers cents→dollars fix**: `handleOrderPlaced`, `handleOrderVoided`, `handleTenderRecorded` consumers were storing raw cent values from event payloads into NUMERIC(19,4) read model columns that expect dollar amounts — values were 100x too large. Fixed with `/ 100` conversion at consumer boundary
  - **Backfill route**: `POST /api/v1/reports/backfill` rebuilds `rm_daily_sales` and `rm_item_sales` from operational tables for orders created outside the event system (e.g., seed data)
  - **Reporting query fallbacks**: `getDailySales` and `getInventorySummary` now fall back to operational tables (orders, tenders, inventory_items + inventory_movements) when CQRS read models are empty. Multi-location aggregation recomputes `avgOrderValue = SUM(netSales) / SUM(orderCount)` correctly
  - **Recent Orders unfiltered**: dashboard Recent Orders section no longer filters by today's date — shows 5 most recent orders regardless of date
  - **Setup Status Banner**: `SetupStatusBanner` component on dashboard reads localStorage/sessionStorage for onboarding progress — shows green "all set up" banner with go-live date, or red "complete your setup" banner with progress bar and percentage. Zero API calls (reads cached state only)
- **Accounting UI Improvements** (Session 2026-02-23):
  - **AccountPicker enhanced**: dual suggestion engines (hint-based + dynamic semantic matching), 20+ role-specific suggestion paths, semantic grouping maps departments to GL accounts (e.g., "Sandwiches" → "Food Sales"), portal-based dropdown with scroll/resize repositioning, fuzzy matching with token overlap scoring and penalty for generic accounts
  - **Mapping content 5-tab layout**: Sub-Departments, Payment Types, Tax Groups, F&B Categories, Unmapped Events. Auto-mapping engine with intelligent account suggestions
  - **Dark mode bootstrap wizard**: select dropdowns properly styled for dark mode
  - **F&B dashboard query fixes**: `getFnbDashboard` query fixes for manager content
- **Transaction Type Registry** (Session 2026-02-23 — uncommitted):
  - **2 new schema tables**: `gl_transaction_types` (system-wide transaction type registry, 45 pre-seeded types across 12 categories), `tenant_tender_types` (custom payment methods per tenant with GL account mappings, posting mode, reporting bucket)
  - **Migration 0144**: `0144_transaction_type_registry.sql` — creates both tables with RLS, seeds 45 system transaction types (cash, card, gift cards, tips, deposits, refunds, settlement, AR/AP, inventory, memberships, events), extends `payment_type_gl_defaults` with posting_mode/expense_account_id/description
  - **Schema**: `packages/db/src/schema/transaction-types.ts` — Drizzle ORM definitions for `glTransactionTypes` and `tenantTenderTypes`
  - **Shared constants**: `packages/shared/src/constants/transaction-types.ts` — 45 system transaction types with codes, descriptions, debit/credit account hints, sort order. Types: `TransactionTypeCategory`, `TenderPostingMode`, `TenderCategory`, `ReportingBucket`
  - **3 commands**: `createTenantTenderType` (validates code uniqueness against system types, creates in both tables), `updateTenantTenderType` (syncs name/active to gl_transaction_types), `deactivateTenderType` (soft-delete both records)
  - **1 query**: `getTransactionTypeMappings` — joins transaction types with GL mappings, includes tender type details (category, posting mode, reporting bucket)
  - **API routes**: `GET /api/v1/accounting/mappings/transaction-types`, `POST /api/v1/accounting/tender-types`, `PATCH/DELETE /api/v1/accounting/tender-types/[id]`
  - **Frontend**: `CreateTenderTypeDialog` (portal-based, conditional GL pickers by posting mode: clearing/direct_bank/non_cash)
  - **`savePaymentTypeDefaults` enhanced**: validates GL account references, auto-remaps eligible tenders (best-effort), returns default + remap count
- **Onboarding System** (Session 2026-02-23 — uncommitted):
  - **Settings page**: `/settings/onboarding` with code-split pattern (thin `page.tsx` + `onboarding-content.tsx`)
  - **10 onboarding phases**: Organization & Locations (4 steps), Users & Roles (3), Catalog & Products (5), Inventory & Vendors (5), Customer Data (3), Accounting (5), POS Configuration (4), F&B Setup (6), Reporting & AI (3), Go Live Checklist (4)
  - **Phase definitions**: `apps/web/src/components/onboarding/phase-definitions.ts` — each phase has key, label, description, Lucide icon, optional `moduleKey` for entitlement gating, array of steps
  - **Auto-detection**: `useOnboardingStatus` hook makes parallel HEAD/GET requests (5s timeout each) to check if data exists for each step (profit centers, terminals, users, catalog, inventory, customers, room layouts, F&B tables, KDS stations, custom reports, AI lenses)
  - **localStorage + sessionStorage persistence**: skipped phases, manually completed steps, completion timestamp in localStorage; API completion cache in sessionStorage with stale-while-revalidate pattern
  - **Accounting bootstrap inline**: Accounting phase step opens existing `BootstrapWizard` component directly inline (not navigating away)
  - **Go Live Checklist auto-completion**: `all_phases_complete` checks every non-skipped, visible, enabled-module phase; `verify_gl` passes if accounting disabled OR all accounting steps complete; `final_review` auto-completes when all other go_live steps pass
  - **"Mark as Live" button**: sets `oppsera_onboarding_completed_at` in localStorage, triggers celebration banner
  - **Components**: `OnboardingPhase` (collapsible with progress bar, skip/unskip toggle), `OnboardingStep` (icon + label + description, expandable incomplete steps, "Open [step name]" button with href, "Mark as done" toggle, undo for manual completions)
  - **Sidebar nav**: added "Setup Guide" link under Settings in `navigation.ts`
- **F&B POS Enhancements** (Session 2026-02-23 — uncommitted):
  - **Floor view dual modes**: Layout (spatial canvas with zoom 0.5x–3x, wheel/pinch zoom, auto-fit viewport) and Grid (table list) modes. "My Section" filter for server-specific table visibility
  - **Floor hook snapshot cache**: `useFnbFloor` uses module-level cache (30-min TTL) surviving React Query GC for instant cold starts. Polling interval: 20 minutes. POS visibility resume listener
  - **Menu panel refactored**: 6 extracted sub-components (MenuModeTabs, DepartmentBar, SubDepartmentBar, CategorySidebar, MenuSearchBar, MenuBreadcrumb). 3 menu modes: All Items, Hot Sellers, Tools. F&B-specific item filtering (food/beverage only). Non-blocking allergen loading
  - **Menu hook deduplication**: `useFnbMenu` uses module-level cache with in-flight promise dedup (`_menuFetchPromise`), 5-min TTL with background refresh, auto-select first department on cached data
  - **Tab hook AbortController**: `useFnbTab` uses abort-based request cancellation on unmount, stale data clearing on tab switch, `pollEnabled` flag to pause when screen hidden
- **Accounting Module Updates** (Session 2026-02-23):
  - **28 tables total** (was 26): + `gl_transaction_types`, `tenant_tender_types`
  - **`getMappingCoverage` enhanced**: payment type total now counts active GL transaction types (system + tenant-scoped) instead of hardcoded list. Returns `{ departments, paymentTypes, taxGroups, overallPercentage, unmappedEventCount }`
  - **Accounting module exports expanded**: `createTenantTenderType`, `updateTenantTenderType`, `deactivateTenderType`, `getTransactionTypeMappings`, `remapGlForTender`, `batchRemapGlForTenders`
- **Accounting Close Hardening** (ACCT-CLOSE sessions 01-08):
    - **ACCT-CLOSE-01**: Drawer session opening balance enforcement — validates `openingBalanceCents >= 0` in `openDrawerSession`, terminal availability check (prevents double-open on same terminal)
    - **ACCT-CLOSE-02**: Breakage income configurability — `breakage_income_settings` table (threshold days, recognition method, account ID), configurable per tenant
    - **ACCT-CLOSE-03**: Reconciliation summary dashboard — chain-of-custody waterfall (`getReconciliationWaterfall`) tracing orders → tenders → settlements → deposits with variance at each stage. Two-tab layout: "Chain of Custody" + "Subledger Reconciliation"
    - **ACCT-CLOSE-04**: Audit log consistency pass — `getAuditCoverage()` diagnostic, mandatory audit for all money-moving commands, `auditLogSystem()` for event consumers
    - **ACCT-CLOSE-05**: Permissions matrix — fine-grained accounting permissions (`accounting.bank_reconciliation.manage`, `accounting.recurring.manage`, etc.), seed updates for all 6 system roles
    - **ACCT-CLOSE-06**: Multi-currency schema prep (`transaction_currency`, `exchange_rate` on GL entries), recurring journal templates (`recurring_journal_templates` + `_lines` tables), `createRecurringTemplate`/`generateFromTemplate` commands
    - **ACCT-CLOSE-07**: Bank reconciliation — `bank_reconciliations` + `bank_reconciliation_items` tables, start/clear/adjust/complete workflow, auto-populate unreconciled GL lines, difference-to-zero validation, full frontend workspace with checkbox-based clearing
    - **ACCT-CLOSE-08**: Documentation — V1 conventions for till sharing (strict mode), offline behavior (read-only), kitchen waste tracking (boolean only), multi-currency roadmap, stored value UX spec (`docs/specs/STORED-VALUE-UX.md`)
    - **4 new migrations**: 0119-0122
    - **Bank Reconciliation frontend**: Banking section "Bank Rec" tab, `ReconciliationWorkspace` component with outstanding/cleared item lists, difference indicator, summary cards, `StartReconciliationDialog`, `AddAdjustmentDialog`
  - **GL Account Mapping Frontend**: `/accounting/mappings` page with 5-tab layout (Sub-Departments, Payment Types, Tax Groups, F&B Categories, Unmapped Events)
    - Mapping coverage card: progress bars with mapped/total counts per category + overall percentage
    - Sub-department mappings: enriched query joining catalog_categories + GL defaults + GL accounts, supports both 2-level (departments) and 3-level (sub-departments) catalog hierarchies
    - Flat mode (2-level): departments rendered as a simple table with AccountPicker dropdowns
    - Grouped mode (3-level): collapsible department sections with sub-department rows
    - Item drill-down: expandable rows showing catalog items under each mappable category
    - AccountPicker: intelligent suggestion engine with 20+ role-specific paths (revenue, cogs, inventory, returns, discount, cash, clearing, fee, tax, expense), semantic grouping (maps departments to GL accounts via shared naming heuristics), portal-based dropdown with scroll/resize repositioning, fuzzy matching with token overlap scoring
    - AccountPicker filtering: revenue→`['revenue']`, cogs→`['expense']`, inventory→`['asset']`, clearing→`['asset', 'liability']`, tax→`['liability']`
    - Payment type mappings: joined with `gl_transaction_types` registry (system + tenant custom), GL account columns (cash, clearing, fee, expense), posting mode (clearing/direct_bank/non_cash)
    - Auto-mapping engine: intelligent account suggestions using semantic grouping and naming heuristics, remap preview dialog for retroactively correcting GL entries
    - Unmapped row highlighting with amber background
    - API routes: `GET /api/v1/accounting/mappings/coverage` (totals from catalog hierarchy + transaction types), `GET /api/v1/accounting/mappings/sub-departments` (enriched with dept names + item counts + GL display strings), `GET /api/v1/accounting/mappings/sub-departments/[id]/items` (drill-down with cursor pagination), `GET /api/v1/accounting/mappings/transaction-types` (transaction type registry with GL mappings)
    - Hooks: `useMappingCoverage`, `useSubDepartmentMappings`, `useSubDepartmentItems`, `usePaymentTypeMappings`, `useTransactionTypeMappings`, `useTaxGroupMappings`, `useUnmappedEvents`, `useMappingMutations`
- **Accounts Payable Module** (Sessions 30-31):
  - **5 schema tables**: ap_bills, ap_bill_lines, ap_payments, ap_payment_allocations, ap_payment_terms + vendor extensions
  - **Migrations**: 0073 (AP schema), 0074 (AP payments + payment terms)
  - **17 commands**: createBill, updateBill, postBill, voidBill, createPaymentTerms, updatePaymentTerms, updateVendorAccounting, createBillFromReceipt, createPayment, postPayment, voidPayment, allocatePayment, createVendorCredit, applyVendorCredit, allocateLandedCost
  - **11 queries**: listBills, getBill, listPaymentTerms, getVendorAccounting, getApAging, getVendorLedger, getOpenBills, getPaymentHistory, getExpenseByVendor, getCashRequirements, get1099Report, getAssetPurchases
  - **~20 API routes** under `/api/v1/ap/`
  - **~60 tests** across test files
  - Bill lifecycle: draft → posted → partial → paid → voided
  - Payment lifecycle: draft → posted → voided with FIFO allocation
  - GL integration via AccountingPostingApi
  - Vendor accounting config (default expense/AP accounts, payment terms, 1099 eligibility)
  - AP aging report (current, 1-30, 31-60, 61-90, 90+ buckets)
  - Landed cost allocation across bill lines
- **Accounts Receivable Module** (Session 33):
  - **4 schema tables**: ar_invoices, ar_invoice_lines, ar_receipts, ar_receipt_allocations
  - **Migration**: 0076 (AR schema with RLS)
  - **7 commands**: createInvoice, postInvoice, voidInvoice, createReceipt, postReceipt, voidReceipt, bridgeArTransaction
  - **8 queries**: listInvoices, getInvoice, listReceipts, getOpenInvoices, getArAging, getCustomerLedger, getReconciliationAr
  - **~10 API routes** under `/api/v1/ar/`
  - **23 tests**
  - Invoice lifecycle: draft → posted → partial → paid → voided
  - Receipt allocation to invoices, GL integration
  - AR aging report, customer ledger with running balance
  - Bridge command for migrating existing operational ar_transactions
- **F&B POS Module** (`packages/modules/fnb/`) — Sessions 1-16:
  - **103 commands**, **63 queries**, **3 consumers**, **10 helpers**, **56 test files** (1,011 tests)
  - **Schema**: 50+ domain tables + 7 CQRS read model tables (`rm_fnb_*`) in `packages/db/src/schema/fnb.ts`
  - **Session 1 — Table Management**: syncTablesFromFloorPlan, createTable, updateTable, seatTable, clearTable, combineTable, uncombineTable; table status tracking with history
  - **Session 2 — Server Sections & Shifts**: createSection, assignServer, cutServer, pickupSection; shift extensions, server checkout
  - **Session 3 — Tabs, Checks & Seat Lifecycle**: openTab, updateTab, closeTab, voidTab, transferTab, reopenTab; seat management, check presentation, discountCheck, refundCheck
  - **Session 4 — Course Pacing & Kitchen Tickets**: createKitchenTicket, updateTicketStatus, voidTicket, createDeltaChit; hold/fire course pacing, routing rules, station assignment
  - **Session 5 — KDS Stations & Expo**: createStation, updateStation, bumpItem, recallItem; expo view with station readiness indicators, ticket queue management
  - **Session 6 — Modifiers, 86 Board & Menu Availability**: compItem, eightySixItem, restoreItem; allergen configuration, availability windows, menu period management, prep note presets
  - **Session 7 — Split Checks & Payment Flows**: splitTender, startPaymentSession, completePaymentSession; split by seat/item/amount/even, merged tabs, payment session lifecycle
  - **Session 8 — Pre-Auth Bar Tabs**: createPreauth, capturePreauth, voidPreauth; card-on-file management, pre-auth lifecycle (created→captured→voided)
  - **Session 9 — Tips & Gratuity**: adjustTip, finalizeTips; auto-gratuity rules (party size threshold), tip pools with distribution methods (equal/points/hours), server tip reporting
  - **Session 10 — Close Batch & Cash Control**: startCloseBatch, lockBatch, postBatch, reconcileBatch; Z-report generation, deposit slip, cash counting, over/short tracking, server checkout
  - **Session 11 — GL Posting & Accounting Wiring**: GL mapping configuration, journal line builder (`buildBatchJournalLines`), posting reconciliation, revenue/tax/tender/tip account mapping per sub-department
  - **Session 12 — F&B Settings Module**: 46 Zod schemas for all F&B settings (general, kitchen, floor plan, payment, tip, KDS, printing, close batch, allergen, display); defaults factory, validation helpers
  - **Session 13 — Real-Time Sync & Offline**: Channel topology (WebSocket pub/sub channels for tables, tabs, KDS, expo, dashboard), offline queue with replay/conflict resolution, soft-lock protocol for concurrent editing
  - **Session 14 — Receipts & Printer Routing**: Chit layout engine (guest check, kitchen chit, bar chit, receipt, credit slip), printer routing rules (station→printer mapping), print job lifecycle, reprint support
  - **Session 15 — F&B Reporting Read Models**: 7 `rm_fnb_*` tables (server performance, table turns, kitchen performance, daypart sales, menu mix, discount/comp analysis, hourly sales), 5 event consumers (tab closed, discount/comp, ticket/item bumped/voided), 8 query services, reporting utilities (computeDaypart, computeTurnTimeMinutes, incrementalAvg, computeTipPercentage)
  - **Session 16 — UX Screen Map & Interaction Flows**: 10 screen definitions (floor plan, tab view, KDS station, expo, payment, server/host/manager dashboards, close batch, settings), 24-component reuse map (shared vs fnb-only), 28 F&B permissions across 10 categories, 6 system roles with default permissions, 6 interaction flows (dine-in lifecycle, bar tab pre-auth, transfer tab, void after send, close batch GL, 86 mid-service), 3 wireframe descriptions, responsive breakpoints, navigation structure
- **F&B POS Frontend** (Sessions 17-28, 12 phases):
  - **Phase 1 — Design System**: CSS design tokens (`fnb-design-tokens.css`), F&B types (`types/fnb.ts`), Zustand store (`fnb-pos-store.ts`)
  - **Phase 2 — Floor Plan**: ~14 API routes (tables CRUD, seat, clear, combine, sync, floor-plan, sections, host-stand), `useFnbFloor`/`useFnbRooms`/`useTableActions` hooks, FloorCanvas, FnbTableNode, RoomTabs, BottomDock, ContextSidebar, SeatGuestsModal, TableActionMenu, FnbFloorView
  - **Phase 3 — Tab/Check**: ~9 API routes (tabs CRUD, close, void, transfer, reopen, fire/send course, check summary), `useFnbTab` hook, TabHeader, SeatRail, OrderTicket, CourseSection, FnbOrderLine, CourseSelector, TabActionBar, FnbTabView
  - **Phase 4 — Menu**: ~7 API routes (86, restore, menu periods, allergens, prep-notes), `useFnbMenu` hook, FnbMenuPanel, FnbModifierDrawer, FnbItemTile, QuickItemsRow
  - **Phase 5 — KDS/Expo**: ~15 API routes (kitchen tickets, stations, bump/recall/callback, expo), `useFnbKitchen` hook, TicketCard, TicketItemRow, BumpButton, TimerBar, DeltaBadge, AllDaySummary, StationHeader, ExpoTicketCard, standalone `/kds` + `/expo` pages
  - **Phase 6 — Split Checks**: ~6 API routes (split, rejoin, comp, discount, void, refund), SplitCheckPage, SplitModeSelector, CheckPanel, DragItem, EqualSplitSelector, CustomAmountPanel, FnbSplitView
  - **Phase 7 — Payment/Tips**: ~17 API routes (payment sessions, tender, gratuity rules, preauth, tips, tip pools), `useFnbPayments` hook, PaymentScreen, TenderGrid, CashKeypad, TipPrompt, ReceiptOptions, PreAuthCapture, FnbPaymentView
  - **Phase 8 — Manager/Host/Close**: ~17 API routes (sections cut/pickup/rotation, check present, close-batch lifecycle, reports, dashboard), `useFnbManager`/`useFnbCloseBatch` hooks, ManagerPinModal, TransferModal, CompVoidModal, EightySixBoard, AlertFeed, HostContent, ManagerContent, CloseBatchContent, CashCountForm, ZReportView, standalone `/host` + `/fnb-manager` + `/close-batch` pages
  - **Phase 9 — Real-Time**: ~5 API routes (locks CRUD, clean), `useFnbRealtime`/`useFnbLocks` hooks, ConnectionBanner, ConflictModal, LockBanner, polling transport (5s floor, 10s KDS)
  - **Phase 10 — Architecture**: ~18 API routes (GL mappings/config/post/reverse/retry/unposted/reconciliation, print jobs/routing-rules, reports), `useFnbSettings`/`useFnbReports` hooks, sidebar nav (entitlement-gated)
  - **Phase 11 — Responsive**: KDS large display (1280px+: 240px cards, 32px timer, 80px bump), handheld (<640px: horizontal rails, hidden sidebars, 2-col grids, wrapped flex)
  - **Phase 12 — Integration Tests**: 16 integration tests (4 flows), 45 API contract tests, 38 store tests = 99 total F&B frontend tests
- **UXOPS Operations** (Sessions UXOPS-01 through UXOPS-14):
  - **Migrations 0108–0118**: 11 migrations for drawer sessions, retail close batches, comp events, returns contra-accounts, payment settlements, tip payouts, tax jurisdiction enrichment, COGS posting mode, F&B batch category version, event dead letters, deposit slips
  - **6 Drizzle schema files**: `drawer-sessions.ts`, `retail-close.ts`, `comp-events.ts`, `payment-settlements.ts`, `tip-payouts.ts`, `deposit-slips.ts` in `packages/db/src/schema/`
  - **3 core submodules**: `drawer-sessions/` (open/close/events, 9 files), `pos-ops/` (comp/void line, 6 files), `retail-close/` (start/lock/reconcile/post close + Z-report, 10 files) in `packages/core/src/`
  - **Dead letter queue**: `packages/core/src/events/dead-letter-service.ts` — persist failed events to DB, admin retry/resolve/discard
  - **6 GL posting adapters**: `void-posting-adapter.ts`, `return-posting-adapter.ts`, `fnb-posting-adapter.ts`, `voucher-posting-adapter.ts`, `membership-posting-adapter.ts`, `chargeback-posting-adapter.ts` in `packages/modules/accounting/src/adapters/`
  - **10 accounting commands**: settlement lifecycle (create, import CSV, match, post, void), tip payouts (create, void), COGS (calculate, post), deposit slips (create, mark deposited, reconcile)
  - **16 accounting queries**: settlements (list, get, unmatched), tips (balances, history), tax remittance, COGS (list, comparison), operations (summary, daily reconciliation, cash dashboard, tender audit trail), F&B mapping coverage, location close status, deposit slips
  - **Payments additions**: voucher commands (purchase, redeem, expire), chargeback commands (record, resolve)
  - **Orders addition**: `createReturn` command for line-item returns with negative qty tracking
  - **42 API routes**: settlements (8), deposits (4), operations (4), COGS (2), close status (1), drawer sessions (4), retail close (5), pos-ops (3), returns (2), tax remittance (3), tip payouts (3), plus reconciliation (3)
  - **10 frontend pages**: settlements, deposits, tip payouts, COGS, tax remittance, operations dashboard, close dashboard, tender audit detail, return entry, POS close
  - **9 frontend hooks**: `use-settlements`, `use-tip-payouts`, `use-retail-close`, `use-deposits`, `use-operations`, `use-tax-remittance`, `use-periodic-cogs`, `use-close-status`, `use-dead-letters`
  - **10 components**: ImportSettlementDialog, SettlementDetailPanel, TipPayoutDialog, CloseShiftDialog, CompDialog, DrawerEventDialog, OpenShiftDialog, VoidLineDialog, ManagerPinModal (shared), CommandPalette
  - **Shift management promoted**: `use-shift.ts` rewritten from localStorage-only to server-persisted drawer sessions with localStorage fallback
  - **Admin dead letter UI**: `/events` page in admin app with dead letter list, detail, retry/resolve/discard
  - **Sidebar navigation**: extracted to `apps/web/src/lib/navigation.ts`, Operations link added, CommandPalette (Ctrl+K)
  - **Close checklist extended**: 8 new items (#11-#18): drawer sessions, retail/F&B close batches, tip balances, deposit slips, dead letter events, card settlements, COGS posting
  - **309 accounting tests**: 31 UXOPS posting matrix tests validating GL balance for retail close, comp, void-line, return, settlement, tip payout, periodic COGS, deposit slip + end-to-end lifecycle flows + idempotency
- **Payment Gateway Integration** (CardPointe) — Sessions 2026-02-23–24:
  - **21 migrations** (0172–0192): payment gateway foundation, ACH, surcharge, terminal devices, modifier groups, ERP config, guest pay enhancements, member portal passwords
  - **7 core gateway tables**: `paymentProviders`, `paymentProviderCredentials`, `paymentMerchantAccounts`, `terminalMerchantAssignments`, `paymentIntents`, `paymentTransactions`, `paymentWebhookEvents`
  - **Provider Registry pattern**: `providerRegistry.register('cardpointe', factory)` — pluggable provider architecture for CardPointe, Square, Worldpay, etc.
  - **PaymentsFacade**: singleton entry point with 8 methods (authorize, capture, sale, void, refund, tokenize, createProfile, inquire). All POS/online/recurring callers go through this facade.
  - **Payment intent lifecycle**: `created → authorized → captured → voided → refunded → declined → error → resolved`
  - **Per-operation idempotency**: each void/refund/capture gets its own `clientRequestId` (not just per-intent). Migration 0176 adds partial unique index excluding NULL keys.
  - **AES-256-GCM encrypted credentials**: `paymentProviderCredentials.credentialsEncrypted` stores encrypted JSON
  - **Terminal-level MID assignment**: different terminals can route to different merchant accounts at the same location
  - **ACH payment support**: `ach_returns` table (append-only), `ach_micro_deposits` table, NACHA return codes R01-R83 with retry classification
  - **Surcharge compliance**: `surcharge_settings` table with rate caps, state prohibition lists, debit/prepaid exemptions. 3 partial unique indexes for NULL-scoped tenant/location/terminal settings. Pure `calculateSurcharge()` function.
  - **Response interpreter**: 3-tier decline categorization (processor:code → PPS fallback → respstat-based). Separate user-safe vs operator messages. AVS/CVV independent interpretation.
  - **Gateway response codes**: `packages/shared/src/constants/gateway-response-codes.ts` — 50+ PPS codes, `DeclineCategory`, `SuggestedAction` types
  - **Terminal device management**: `terminal_device_assignments` table mapping physical CardPointe terminals (HSN) to POS terminals
  - **Wallet payments**: `wallet_type` column on `tenders` (apple_pay, google_pay)
  - **GL wiring**: surcharge revenue (4510), ACH receivable (1150/1160) COA templates. `default_surcharge_revenue_account_id` on accounting settings.
  - **Tokenization**: CardPointe Hosted iFrame tokenizer (`cardpointe-iframe-tokenizer.tsx`), `useTokenizerConfig` hook, `GET /api/v1/payments/tokenizer-config`
  - **30+ API routes**: tokenizer config, settlements, transactions, failed payments, terminal ops (auth-card, read-card, display, cancel), bank accounts, ACH, wallet, Apple Pay validation
  - **Frontend**: merchant services settings page, transaction list/detail pages, ACH status page, failed payments page, Apple Pay / Google Pay button components
- **ERP Dual-Mode Infrastructure** (Session 2026-02-23–24):
  - **Schema**: 3 new tables (`erpWorkflowConfigs`, `erpWorkflowConfigChangeLog`, `erpCloseOrchestratorRuns`), extended `tenants` with `business_tier` (SMB/MID_MARKET/ENTERPRISE), `business_vertical`
  - **Tier-based workflow defaults**: `TIER_WORKFLOW_DEFAULTS` in `packages/shared/src/constants/erp-default-profiles.ts` — SMB (automatic/invisible), MID_MARKET (visible/automatic), ENTERPRISE (manual/approvals)
  - **Workflow engine**: `packages/core/src/erp/workflow-engine.ts` — cascading fallback (DB config → tier defaults → ultimate fallback), in-memory 60s TTL cache
  - **25+ workflow keys** across accounting, payments, inventory, AP, AR modules
  - **Close orchestrator**: `erpCloseOrchestratorRuns` tracks day-end close with step-by-step results
  - **Cron route**: `POST /api/v1/erp/cron` — Vercel Cron trigger for auto-close with timezone handling and idempotency
  - **9 API routes**: config CRUD per module/workflow, tier evaluation, close-orchestrator, verticals, cron
  - **Frontend**: ERP config settings page with workflow toggles per module
  - **Day-end close settings**: `auto_close_enabled`, `auto_close_time`, `auto_close_skip_holidays`, `day_end_close_enabled`, `day_end_close_time` on `accounting_settings`
- **Modifier Group Enhancements** (Session 2026-02-24):
  - **Schema** (migration 0183): `catalog_modifier_group_categories` table (hierarchical), extended `catalog_modifier_groups` (category_id, instruction_mode, default_behavior, channel_visibility, sort_order), extended `catalog_modifiers` (extra_price_delta, kitchen_label, allow_none/extra/on_side, is_default_option, cost), per-assignment overrides on `catalog_item_modifier_groups` (override_required, override_min/max, override_instruction_mode, prompt_order)
  - **Bulk assignment**: `bulkAssignModifierGroups` command with replace/merge modes + per-assignment overrides
  - **Channel visibility**: modifiers filterable by channel (pos, online, qr, kiosk)
  - **Modifier reporting**: 3 new `rm_` read model tables (`rmModifierItemSales`, `rmModifierDaypart`, `rmModifierGroupAttach`), 2 event consumers, 8 queries (performance, upsell impact, daypart heatmap, waste signals, complexity, group health, location heatmap, group-item heatmap)
  - **Frontend**: modifiers management page, modifier reports page with analytics
  - **API routes**: modifier groups CRUD, bulk assign, modifier group categories CRUD, item modifier assignments, modifier reports
- **Role Access Scoping** (Session 2026-02-24):
  - **3 junction tables**: `role_location_access`, `role_profit_center_access`, `role_terminal_access` (migration 0175)
  - **Convention**: Empty table = unrestricted (role sees everything). Adding rows restricts to only those entities.
  - All use CASCADE on DELETE for cleanup
- **SuperAdmin Portal** (Sessions 1-14, Phases 1-3):
  - **~120 API routes** across 14 modules: tenant management, admin RBAC, impersonation, module provisioning, DLQ management, user management, health dashboard, financial support, audit log, global search, timeline, onboarding engine, notifications/alerts, dashboard home
  - **~90 frontend components** with dark mode, keyboard shortcuts, loading skeletons, error boundaries
  - **16+ new DB tables**: tenant extensions, onboarding checklists, support notes, impersonation sessions, feature flags, health/system snapshots, admin searches, timeline events, onboarding templates, alert rules, notification preferences, notifications
  - **6 admin roles**: Super Admin, Platform Engineer, Implementation Specialist, Support Agent, Finance Support, Viewer — with granular permission middleware (`withAdminPermission`)
  - **Impersonation safety**: restricted actions (no void >$500, no accounting changes, no deletes, no permission changes), max duration, action counting, audit trail, undismissible banner in tenant app. Guard functions: `assertImpersonationCanVoid`, `assertImpersonationCanRefund`, `assertImpersonationCanModifyAccounting`, `assertImpersonationCanDelete`, `assertImpersonationCanModifyPermissions`, `assertNotImpersonating`. 25 tests in `impersonation-safety.test.ts`.
  - **Health scoring**: score 0-100 with grade (A-F), deductions for DLQ depth, error rate, unmapped GL, inactive tenants. Snapshots every 15 minutes.
  - **Alert engine**: 7 seeded rule types, cooldown mechanism, Slack webhook integration, in-app notifications with 30s polling
  - **Timeline**: unified chronological feed with fire-and-forget writes, retroactive hydration from 5 data sources, 25+ event types
  - **Onboarding engine**: auto-detection of setup progress (parallel HEAD/GET checks), template-based step initialization, dependency chains, stalled detection (>3 days), auto-complete to active when all steps done
  - **4 scheduled jobs**: impersonation expiry, health snapshot capture, health snapshot cleanup, alert check runner
- **Semantic Intelligence Expansion** (Session 2026-02-24):
  - **Tier 2 services**: anomaly detection (z-score on `rm_daily_sales`), root cause analyzer (dimension decomposition), correlation engine (Pearson + p-value), predictive forecaster (linear regression, SMA, exponential smoothing), what-if simulator, background analyst
  - **Tier 3 (agentic)**: agentic orchestrator (multi-step Think/Act/Observe loop with 5-step max, SELECT-only guardrails), NL report builder, data quality scorer
  - **Additional services**: shared insights (snapshot + token URLs), role-based feed, voice input (transcript normalization), multi-language (detection + prompt wrapping), scheduled delivery (recurring AI reports)
- **POS UX Improvements** (Session 2026-02-24):
  - **Visibility resume hook** (`usePOSVisibilityRefresh`): proactive JWT refresh + health ping + custom event dispatch after 30s idle. Other hooks listen for `pos-visibility-resume` to refresh stale data.
  - **Connection indicator**: 3-state (online/slow/offline), pings `/api/health` every 30s with HEAD
  - **Customer cache**: module-level singleton (500 entries, 5-min TTL), pre-warmed on mount, client-side search with server fallback, AbortController cancellation
  - **Display size selector**: 3 sizes (1x/1.15x/1.3x) via CSS custom property `--pos-font-scale`, localStorage persisted
  - **POS error boundary**: mode-aware (Retail/F&B), preserves Zustand state on crash
  - **POS close page**: `/pos/close` with denomination counting and status stepper
  - **POS header redesign**: CSS custom property-based theming, employee name, connection indicator, font size selector, dark mode toggle
- **Member Portal Payment Methods** (Session 2026-02-24):
  - **Bank accounts**: tokenize, add, verify (micro-deposit), CRUD API routes
  - **Payment methods**: CardPointe iFrame tokenizer integration, CRUD with default selection
  - **One-time payments**: make-payment page with amount entry and payment method selection
  - **Password auth**: `password_hash` on `customer_auth_accounts` for email+password login (migration 0191)
- **Guest Pay Enhancements** (Session 2026-02-24):
  - **Lookup codes**: 6-char alphanumeric codes for manual entry (migration 0190), partial unique index on active sessions
  - **Receipt email tracking**: `receipt_emailed_at` column, one email per session rate limit (migration 0192)
  - **Card charge**: `POST /api/v1/guest-pay/[token]/card-charge` for credit card payment via gateway
  - **Email receipt**: `POST /api/v1/guest-pay/[token]/email-receipt`
- **CI/Build Improvements** (Session 2026-02-24):
  - **Business logic test workflow**: `.github/workflows/business-logic-tests.yml` — separate CI for domain tests
  - **Test mock alignment**: multiple fix commits for mock chain order, schema test skipping without DB, pipeline fallback mocks
  - **Destructured array defaults**: `const [a = 0] = str.split(':').map(Number)` pattern enforced
  - **Vercel Hobby cron limitation**: daily-only cron on Hobby plan (15-min requires Pro)
- **Migrations 0172–0192** (Session 2026-02-23–24):
  - `0172_payment_gateway_foundation.sql`: 7 gateway tables + payment_intent_id on tenders
  - `0173_fnb_my_section_tables.sql`: F&B server section assignment tables
  - `0174_payment_profile_extensions.sql`: customer payment profile columns
  - `0175_role_access_scoping.sql`: role-location/profit-center/terminal access junction tables
  - `0176_payment_idempotency_hardening.sql`: per-operation client_request_id on payment_intents
  - `0177_terminal_device_management.sql`: terminal device assignments table
  - `0178_ach_payment_support.sql`: ACH columns, ach_returns, ach_micro_deposits tables
  - `0179_payment_wallet_type.sql`: wallet_type on tenders
  - `0180_payment_response_enrichment.sql`: decline categorization columns on payment_transactions
  - `0181_surcharge_settings.sql`: surcharge settings table with 3-level scoping
  - `0182_payment_surcharge_columns.sql`: surcharge_amount_cents on intents/transactions/tenders
  - `0183_modifier_groups_enhancement.sql`: modifier group categories, extended modifiers/assignments
  - `0184_payment_gateway_gl_wiring.sql`: surcharge revenue + ACH receivable GL accounts
  - `0185_ach_receivable_gl_template_fix.sql`: fix column names in GL template INSERT
  - `0186_modifier_reporting.sql`: 3 modifier analytics read model tables
  - `0187_erp_dual_mode_infrastructure.sql`: ERP workflow tables + tenant tier columns
  - `0188_merchant_account_settings.sql`: HSN + ACH/funding MID columns on merchant accounts
  - `0189_day_end_close_settings.sql`: auto-close and day-end-close on accounting settings
  - `0190_guest_pay_lookup_code.sql`: lookup_code on guest_pay_sessions
  - `0191_member_portal_passwords.sql`: password_hash on customer_auth_accounts
  - `0192_guest_pay_receipt_emailed.sql`: receipt_emailed_at on guest_pay_sessions
  - `0193_tenant_business_info.sql`: tenant_business_info + tenant_content_blocks tables with RLS
- **Tenant Business Info & Content Blocks** (Session 2026-02-24):
  - **2 new tables**: `tenant_business_info` (one row per tenant — identity, operations, online presence, advanced metadata), `tenant_content_blocks` (keyed content blocks: about, services_events, promotions, team)
  - **Schema**: `packages/db/src/schema/business-info.ts`, Migration: `0193_tenant_business_info.sql`
  - **Shared schemas**: `packages/shared/src/schemas/business-info.ts` — Zod schemas for business hours (day/period structure), social links (13 platforms), photo gallery, industry types, access types, F&B levels, rental types
  - **Commands**: `updateBusinessInfo(ctx, input)` (upsert), `updateContentBlock(ctx, blockKey, content)` (upsert) — in `packages/core/src/settings/business-info.ts`
  - **Queries**: `getBusinessInfo(tenantId)`, `getContentBlocks(tenantId)`
  - **API routes**: `GET/PATCH /api/v1/settings/business-info`, `GET/PATCH /api/v1/settings/content-blocks`
  - **Frontend**: `/settings/general` page (code-split) with 6-tab layout: Business Info, Users, Roles, Modules, Dashboard, Audit Log. Business Info tab has 5 collapsible sections (Business Info, Operations, Online Presence, Content Blocks, Advanced) with profile completeness progress bar
  - **Settings redirect**: `/settings` now redirects to `/settings/general` via `router.replace()`
  - **Roles tab**: RBAC management with 75+ permissions grouped by category, role details sidebar, access scope (location/profit-center/terminal scoping)
  - **Modules tab**: Module enable/disable with grid/list view modes, status badges, plan tier display
  - **Dashboard tab**: Widget toggle configuration, customizable dashboard notes (localStorage)
  - **Audit Log tab**: Full audit log viewer with actor display, filterable
  - **Sub-components**: `BusinessHoursEditor`, `RichTextEditor` (contentEditable with toolbar), `SocialLinksEditor`, `TagInput`
  - **Hook**: `useBusinessInfo()` — loads both data sources, provides `saveInfo()` and `saveBlock()` mutations
  - **Tax ID masking**: stored encrypted, returned with bullet characters + last 4
- **Merchant Services Settings UI** (Session 2026-02-24):
  - **5-tab layout** under `/settings/merchant-services`: ProvidersTab, MerchantAccountsTab, DevicesTab, TerminalsTab, WalletsTab
  - **ProvidersTab**: payment provider CRUD with credential management, test connection, activate/deactivate
  - **MerchantAccountsTab**: merchant account CRUD with MerchantAccountSetupPanel — full credential management (CardPointe API, ACH, Funding), account settings (HSN, MIDs), terminal processing options, sandbox test data display, credential verification report
  - **DevicesTab**: physical terminal device management (HSN mapping to CardPointe terminals)
  - **TerminalsTab**: POS terminal-to-MID assignment with cascading location/profit-center/terminal selectors (uses `useProfitCenterSettings` for single-fetch filtering)
  - **WalletsTab**: Apple Pay / Google Pay configuration with auto-fill gateway MID from default merchant account
  - **Shared**: `DialogOverlay` component in `_shared.tsx`
  - **Hooks** (`use-payment-processors.ts`): React Query-based — `usePaymentProviders`, `useProviderCredentials`, `useMerchantAccounts`, `useTerminalAssignments`, `useDeviceAssignments`, `useSurchargeSettings`, `useMerchantAccountSetup`, `useVerifyCredentials`, plus mutation hooks with automatic query invalidation
  - **Backend queries** (`get-provider-config.ts`): `listPaymentProviders` (with subquery for credential status + MID count), `listProviderCredentials`, `listMerchantAccounts` (full setup details), `listTerminalAssignments` (enriched JOINs)
- **Year Seed Script** (`packages/db/src/seed-year.ts`):
  - Generates 366 days of realistic transactions (~$800K–$1.2M revenue) with seasonal variation, tournament spikes, void rates (8%), cash/card mix (33%/67%)
  - Deterministic PRNG (`mulberry32(20260224)`) — same data every run
  - Additive-only (never deletes/truncates), requires `pnpm db:seed` first
  - Populates `rm_daily_sales` and `rm_item_sales` read models via ON CONFLICT upsert
  - Usage: `pnpm tsx packages/db/src/seed-year.ts` (local) or `--remote` flag for production
- **Portal Auth Scripts** (Session 2026-02-24):
  - `tools/scripts/seed-portal-auth.ts`: bulk-creates portal auth for all customers (password: `member123`)
  - `tools/scripts/add-portal-member.ts`: one-off script for specific member with custom password
  - Both support `--remote` flag for production DB
- **Bug Fixes** (Session 2026-02-24):
  - Modifiers page: fixed category filter to use `g.categoryId` instead of `g.category_id` (Drizzle column name)
  - Inventory ItemEditDrawer: fixed item type display using `getItemTypeGroup()`
  - Inventory ActivitySection: fixed movements display with `Number()` conversion on numeric fields + date formatting
  - F&B module index: fixed duplicate `ReceiptData` export (renamed to `FnbReceiptData`)
  - Catalog import-inventory: added `createdItemIds` to validation failure path for `publishWithOutbox` inference
  - PMS occupancy projector: type-annotated empty events array for Vercel build
- **API Consolidation & Settings Improvements** (Session 2026-02-25):
  - **Profit centers settings data**: new `getSettingsData(tenantId)` query — single API call replaces 3 sequential calls for locations + profit centers + terminals. API: `GET /api/v1/profit-centers/settings-data`
  - **Terminal selection all data**: new `getTerminalSelectionAll(tenantId, roleId?)` query — single API call with role-based access filtering (uses `role_location_access`, `role_profit_center_access`, `role_terminal_access` tables). API: `GET /api/v1/terminal-session/all?roleId=xxx`
  - **`useProfitCenterSettings` hook**: single-fetch + client-side filtering via `filterProfitCenters()`, `filterTerminalsByLocation()`, `filterTerminalsByPC()`, `useVenuesBySite()`
  - **`useTerminalSelection` rewritten**: single API call, derived lists via `useMemo`, auto-selects single options via `useEffect` chains
  - **Settings page redirect**: `/settings` → `/settings/general` via `router.replace()`
  - **Settings General 6-tab layout**: Business Info (with profile completeness), Users, Roles (75+ permissions, access scope), Modules (grid/list view), Dashboard (widget toggles), Audit Log
  - **Merchant services React Query hooks**: `usePaymentProviders`, `useMerchantAccounts`, `useTerminalAssignments`, `useDeviceAssignments`, `useSurchargeSettings`, `useMerchantAccountSetup`, `useVerifyCredentials` + mutation hooks with auto-invalidation
  - **MerchantAccountSetupPanel**: comprehensive merchant account configuration (credentials, ACH, processing options, sandbox test data, credential verification)
  - **TerminalsTab**: cascading location/profit-center/terminal selectors using `useProfitCenterSettings` for single-fetch filtering
  - **Payment provider config queries**: `listPaymentProviders` (subquery for credential status + MID count), `listMerchantAccounts` (full setup details), `listTerminalAssignments` (enriched JOINs) in `get-provider-config.ts`
  - **Impersonation safety guards**: 6 assertion functions (`assertImpersonationCanVoid`, `assertImpersonationCanRefund`, `assertImpersonationCanModifyAccounting`, `assertImpersonationCanDelete`, `assertImpersonationCanModifyPermissions`, `assertNotImpersonating`) with 25 tests
  - **Test fixes**: updated mock patterns in onboard, account-crud, close-checklist, bulk-import tests for hoisted mock compatibility

### Test Coverage
3355+ tests: 159 core (134 + 25 impersonation-safety) + 68 catalog + 58 orders (52 + 6 add-line-item-subdept) + 37 shared + 100 customers + 621 web (80 POS + 66 tenders + 42 inventory + 15 reports + 19 reports-ui + 15 custom-reports-ui + 9 dashboards-ui + 178 semantic-routes + 24 accounting-routes + 24 accounting-gl-mappings + 23 ap-routes + 27 ar-routes + 38 fnb-pos-store + 16 fnb-integration + 45 fnb-api-comprehensive) + 27 db + 99 reporting (27 consumers + 16 queries + 12 export + 20 compiler + 12 custom-reports + 12 cache) + 49 inventory-receiving (15 shipping-allocation + 10 costing + 5 uom-conversion + 10 receiving-ui + 9 vendor-management) + 276 semantic (62 golf-registry + 25 registry + 35 lenses + 30 pipeline + 23 eval-capture + 9 eval-feedback + 6 eval-queries + 52 compiler + 35 cache + 14 observability) + 45 admin (28 auth + 17 eval-api) + 199 room-layouts (65 store + 61 validation + 41 canvas-utils + 11 export + 11 helpers + 10 templates) + 309 accounting (22 posting + 5 void + 7 account-crud + 5 classification + 5 bank + 10 mapping + 8 sub-dept-mappings + 9 reports + 22 validation + 22 financial-statements + 33 integration-bridge + 9 catalog-gl-resolution + 12 pos-posting-adapter + 12 void-posting-adapter + 16 voucher-posting-adapter + 9 fnb-posting-adapter + 10 membership-posting-adapter + 14 chargeback-posting-adapter + 8 close-checklist + 26 posting-matrix + 31 uxops-posting-matrix) + 60 ap (bill lifecycle + payment lifecycle) + 129 ar (23 lifecycle + 16 invoice-commands + 16 receipt-commands + 14 queries + 47 validation + 13 gl-posting) + 119 payments (35 validation + 17 gl-journal + 13 record-tender + 13 record-tender-event + 13 reverse-tender + 13 adjust-tip + 10 consumers + 5 chargeback) + 1011 fnb (28 core-validation + 26 session2 + 48 session3 + 64 session4 + 59 session5 + 69 session6 + 71 session7 + 38 session8 + 50 session9 + 53 session10 + 49 session11 + 77 session12 + 73 session13 + 91 session14 + 64 session15 + 100 session16 + 12 extract-tables)

### What's Built (Infrastructure)
- **Observability**: Structured JSON logging, request metrics, DB health monitoring (pg_stat_statements), job health, alert system (Slack webhooks, P0-P3 severity, dedup), on-call runbooks, migration trigger assessment
- **Admin API**: `/api/health` (public, minimal), `/api/admin/health` (full diagnostics), `/api/admin/metrics/system`, `/api/admin/metrics/tenants`, `/api/admin/migration-readiness`
- **Container Migration Plan**: Docker multi-stage builds, docker-compose, Terraform (AWS ECS Fargate + RDS + ElastiCache), CI/CD (GitHub Actions), deployment config abstraction, feature flags, full Vercel/Supabase limits audit with 2026 pricing, cost projections, migration trigger framework (16/21 pre-migration checklist items complete)
- **Security Hardening**: Security headers (CSP, HSTS, X-Frame-Options, etc.) on both web and admin apps, in-memory sliding window rate limiter on all auth endpoints, auth event audit logging (login/signup/logout), env-var-driven DB pool + prepared statement config, debug/link-account endpoints disabled (410 Gone), semantic pipeline errors sanitized (generic message to clients). Full audit at `infra/SECURITY_AUDIT.md`
- **CI/CD**: GitHub Actions workflow (`.github/workflows/lint-typecheck.yml`) — lint, type-check, test, build on push/PR to main. Vitest coverage reporting via `@vitest/coverage-v8` (v8 provider, lcov + json-summary reporters) across all 16 packages. Run `pnpm test:coverage` for coverage reports.
- **Legacy Migration Pipeline**: 14 files in `tools/migration/` (~4,030 lines) — config, ID mapping, transformers, validators, pipeline, cutover/rollback, monitoring
- **Load Testing**: k6 scenarios for auth, catalog, orders, inventory, customers (in `load-tests/`)
- **Business Logic Tests**: 30 test files in `test/` covering all domain invariants

- **Semantic Layer (AI Insights)** (Sessions 0–10):
  - **Schema**: `packages/db/src/schema/semantic.ts` (6 tables: metrics, dimensions, metric-dimensions, table-sources, lenses) + `evaluation.ts` (4 tables: eval-sessions, eval-turns, eval-examples, eval-quality-daily) + `platform.ts` (platform-admins). Migrations 0070–0073.
  - **Registry**: In-memory with stale-while-revalidate (5min TTL + 10min SWR window). 16 core metrics, 8 core dimensions, 8 golf metrics, 6 golf dimensions, 60+ metric-dimension relations, 4 system lenses. `syncRegistryToDb()` + `invalidateRegistryCache()`.
  - **Query Compiler**: `compilePlan()` — validates metrics/dimensions against registry, builds parameterized SQL with GROUP BY, WHERE, ORDER BY, LIMIT. Enforces tenant isolation, date range, max rows (10K), max cols (20), max filters (15).
  - **LLM Pipeline (Dual-Mode)**: `runPipeline()` orchestrates two modes: **Mode A (metrics)**: intent → compile via registry → execute → narrate. **Mode B (SQL)**: intent → generate SQL via LLM → validate → execute → auto-retry on failure → narrate. Mode routing is automatic based on intent confidence and schema catalog availability. Both modes share eval capture, caching (query cache + LLM response cache), and observability. Post-pipeline enrichments: `generateFollowUps()`, `inferChartConfig()`, `scoreDataQuality()`.
  - **SQL Generation Pipeline (Mode B)**: `generateSql()` builds a system prompt with full DB schema (via `buildSchemaCatalog()`), money/date/status conventions, common query patterns, and RAG few-shot examples. `validateGeneratedSql()` enforces SELECT-only, tenant isolation, LIMIT, table whitelist, and blocks dangerous functions. `retrySqlGeneration()` sends errors back to LLM for one auto-correction attempt. `pruneForSqlGenerator()` trims conversation history to fit token budgets.
  - **Intelligence Enrichments**: `generateFollowUps()` suggests contextual follow-up questions based on query results and plan. `inferChartConfig()` auto-detects optimal chart type (line/bar/pie/table) from data shape. `scoreDataQuality()` computes confidence score from row count, execution time, date range coverage, and schema tables used.
  - **Narrative Engine — THE OPPS ERA LENS**: Universal SMB optimization framework powering all AI responses. System prompt in `narrative.ts` with `buildNarrativeSystemPrompt()`. Features:
    - **DATA-FIRST DECISION RULE**: Priority chain: REAL DATA → ASSUMPTIONS → BEST PRACTICE. Never refuses a question.
    - **Adaptive depth**: DEFAULT MODE (concise, <400 words) for most responses; DEEP MODE for strategic/financial decisions; QUICK WINS MODE for urgent help.
    - **Industry translation**: `getIndustryHint(lensSlug)` auto-translates to user's industry (golf → tee sheet utilization, retail → shelf space, hospitality → covers).
    - **Structured response**: Answer → Options (3, with Effort/Impact) → Recommendation (with confidence %) → Quick Wins → ROI Snapshot → What to Track → Next Steps. Sections are optional — skip what doesn't apply.
    - **ADVISOR MODE**: When data is missing (0-row results or compilation errors), pipeline still calls LLM with business context. `buildEmptyResultNarrative()` is static fallback only if LLM fails.
    - **Markdown parser**: `parseMarkdownNarrative()` splits LLM markdown into typed `NarrativeSection[]` via `HEADING_TO_SECTION` lookup (20+ heading variants). Footer `*THE OPPS ERA LENS. [metrics]. [period].*` → `data_sources` section.
    - **Section types**: `answer`, `options`, `recommendation`, `quick_wins`, `roi_snapshot`, `what_to_track`, `conversation_driver`, `assumptions`, `data_sources` + legacy types for backward compat.
    - **Metric context**: `buildMetricContext(metricDefs)` injects metric definitions (displayName, description, higherIsBetter, format) into the prompt so the LLM understands what each metric means.
  - **Intent Resolver Improvements**: Biased toward attempting queries instead of clarifying. Rule 3: only clarify when genuinely cannot map ANY part to available metrics. Rule 4: default to last 7 days when no date range specified. Rule 8: general business questions still build a plan with most relevant metrics (confidence <0.6).
  - **Evaluation Layer**: `semanticEvalSessions` (conversation tracking) + `semanticEvalTurns` (57 columns: input, LLM plan, compilation, execution, user feedback, admin review, quality scoring) + `semanticEvalExamples` (golden few-shot training data) + `semanticEvalQualityDaily` (pre-aggregated read model). Quality score formula: 40% admin + 30% user + 30% heuristics. Capture service (fire-and-forget). Feedback commands (user rating 1-5 + tags, admin verdict + corrected plan). `promoteToExample()` for few-shot curation. 8 golf training examples.
  - **Custom Lenses**: `createCustomLens`, `updateCustomLens`, `deactivateCustomLens`, `reactivateCustomLens`, `getCustomLens`, `listCustomLenses`. Slug validation. Partial unique indexes (system vs tenant). API routes: GET/POST `/api/v1/semantic/lenses`, GET/PATCH/DELETE `/api/v1/semantic/lenses/[slug]`.
  - **Cache Layer**: Query result LRU cache (`getFromQueryCache`/`setInQueryCache`/`invalidateQueryCache`). Sliding window rate limiter (30 req/min per tenant). Admin cache invalidation API.
  - **Observability**: Per-tenant + global metrics (p50/p95 latency, cache hit rate, token usage, error rate). `GET /api/v1/semantic/admin/metrics`.
  - **Chat UI**: `useSemanticChat` hook (multi-turn, 10-message context window, session management, `initFromSession()` for recall), `ChatMessageBubble` (markdown + table + debug panel), `ChatInput` (auto-resize), `FeedbackWidget` (thumbs + 5-star + tags + text), `RatingStars` component. `InsightsContent` page at `/insights` with suggested questions + inline chat history sidebar. Sub-pages: `/insights/history` (session list with Open/Export buttons), `/insights/lenses` (system + custom lens management). Sidebar nav "AI Insights" with Sparkles icon + Chat, Lenses, History children.
  - **Chat History Sidebar**: Inline flexbox panel (320px, right of chat) on desktop `lg:` 1024px+, slide-in overlay with backdrop on mobile. `ChatHistorySidebar` component (`components/insights/ChatHistorySidebar.tsx`) with session list, active highlighting, "New Chat", "Load more", "View all history" link. `useSessionHistory` hook (`hooks/use-session-history.ts`) shared between sidebar and standalone history page — cursor-paginated session list with `refresh()`. `exportSessionAsTxt()` utility (`lib/export-chat.ts`) for .txt download. Desktop toggle persisted in `localStorage('insights_history_open')`. Sidebar refreshes via `refreshKey` prop with 1s delay after `sendMessage` (eval capture is async).
  - **Sync Scripts**: `src/sync/sync-registry.ts` + `src/sync/golf-seed.ts`. Run with `pnpm --filter @oppsera/module-semantic semantic:sync`.
  - **API Routes**: `/ask` (conversational, rate-limited), `/query` (raw data), `/metrics`, `/dimensions`, `/lenses`, `/lenses/[slug]`, `/sessions` (session list, cursor-paginated), `/sessions/[sessionId]` (session detail + turns for chat reconstruction), `/eval/feed` (query history), `/eval/turns/[id]/feedback`, `/admin/invalidate`, `/admin/metrics`.
  - **Tests**: 276 semantic module tests (registry, compiler, 30 pipeline incl. OPPS ERA LENS section parsing, lenses, cache, observability, eval) + 178 web route tests.
- **Admin App** (`apps/admin/`):
  - Separate Next.js app on port 3001 for platform operators (NOT tenant-scoped)
  - **Auth**: Email/password → JWT (HS256, 8h TTL) + HttpOnly cookie. `platformAdmins` table with bcrypt password hashing. Legacy 3 roles: viewer, admin, super_admin. `withAdminAuth(handler, minRole)` middleware. New granular RBAC via `platform_admin_roles` + `platform_admin_role_permissions`.
  - **Train AI Section** (expanded from Eval): `/train-ai/examples` (golden examples with bulk import/export + effectiveness tracking), `/train-ai/turns/[turnId]` (turn detail with plan viewer, SQL viewer, result sample, admin review), `/train-ai/batch-review` (bulk review workflows), `/train-ai/comparative` (A/B comparison), `/train-ai/conversations` (conversation analysis), `/train-ai/cost` (token/cost analytics), `/train-ai/experiments` (A/B experiments), `/train-ai/playground` (interactive testing), `/train-ai/regression` (regression testing), `/train-ai/safety` (safety evaluation)
  - **Eval Training Hook**: `useEvalTraining()` centralizes all AI training operations — examples CRUD + bulk import/export + effectiveness, batch review, experiments, regression, cost analytics, safety, conversations
  - **Components**: AdminSidebar (with Train AI section), EvalTurnCard, QualityFlagPills, QualityKpiCard, VerdictBadge, RatingStars, PlanViewer, SqlViewer, TenantSelector
  - **API Routes**: 20+ eval endpoints (examples CRUD + bulk-import + export + effectiveness, turns + promote-correction, batch-review, conversations, cost, experiments, playground, regression, safety) + ~6 admin staff/customer endpoints + ~12 tenant endpoints + module template endpoints
  - **Tests**: 45 tests (28 auth + 17 eval API)
  - **Entitlement**: `semantic` module added to core entitlements registry. Script: `tools/scripts/add-semantic-entitlement.ts` for existing tenants.
  - **Utility**: `scripts/switch-env.sh` (toggle local/remote Supabase)
  - **Admin RBAC** (migration 0097):
    - 4 platform tables: `platform_admin_roles`, `platform_admin_role_permissions`, `platform_admin_role_assignments`, `platform_admin_audit_log`
    - Extended `platform_admins`: `phone`, `status`, invite flow fields, `passwordResetRequired`
    - `withAdminPermission(handler, { module, action })` middleware for granular access control
    - `auditAdminAction()` helper for admin operation logging with before/after snapshots
    - Seed script: `tools/scripts/seed-admin-roles.ts`
  - **User Management** (`/users`):
    - Staff tab: invite, suspend, reactivate, password reset, role assignment
    - Customers tab: cross-tenant customer search (name/email/phone/identifier)
    - Hooks: `useStaff`, `useCustomersAdmin`
    - Libs: `staff-commands.ts`, `staff-queries.ts`, `customer-queries.ts`, `admin-audit.ts`, `admin-permissions.ts`
  - **Tenant Management** (admin):
    - **Pages**: `/tenants` (list with search, status filter, cursor pagination), `/tenants/[id]` (detail with 3 tabs: Overview, Organization, Entitlements)
    - **Organization Builder**: 4-column hierarchical UI: Sites → Venues → Profit Centers → Terminals. Full CRUD with modal forms, cascading selection resets.
    - **Entitlement Toggle**: Three-mode (off/view/full) per module with dependency validation, risk level indicators, reason required for high-risk changes
    - **Components**: CreateTenantModal, TenantStatusBadge, OrgHierarchyBuilder, HierarchyPanel, LocationFormModal, ProfitCenterFormModal, TerminalFormModal, EntitlementToggleList
    - **API Routes**: ~12 endpoints under `/api/v1/tenants/` (list, create, detail, update, locations CRUD, profit-centers CRUD, terminals CRUD, entitlements)
    - **Hooks**: `useTenantList`, `useTenantDetail`, `useOrgHierarchy`, `useTenantEntitlements` in `use-tenant-management.ts`
    - **Module Templates**: `GET/POST /api/v1/module-templates` — preset module configs by business type
    - **Admin Context**: `buildAdminCtx(session, tenantId)` creates synthetic `RequestContext` with `user.id = 'admin:{adminId}'`, `isPlatformAdmin: true` for calling core commands

- **Profit Centers Submodule** (`packages/core/src/profit-centers/`):
  - **7 commands**: `createProfitCenter`, `updateProfitCenter`, `deactivateProfitCenter`, `ensureDefaultProfitCenter`, `createTerminal`, `updateTerminal`, `deactivateTerminal`
  - **9 queries**: `listProfitCenters`, `getProfitCenter`, `listTerminals`, `getTerminal`, `listTerminalsByLocation`, `getLocationsForSelection`, `getProfitCentersForSelection`, `getTerminalsForSelection`, `getSettingsData`, `getTerminalSelectionAll`
  - **Types**: `ProfitCenter` (with terminalCount), `Terminal`, `TerminalSession`
  - **Validation**: Zod schemas for all inputs, `allowSiteLevel` flag for site-level guardrail
  - **~16 API routes**: CRUD for profit centers + terminals, terminal-session selection endpoints, ensure-default, by-location, settings-data (consolidated), terminal-session/all (consolidated with role filtering)
  - **Hooks**: `useProfitCenters`, `useProfitCenterMutations`, `useProfitCenterSettings` (consolidated settings fetch + client-side filtering), `useTerminals`, `useTerminalsByLocation`, `useTerminalMutations`

- **Terminal Infrastructure Schema** (`packages/db/src/schema/terminals.ts`):
  - **9+ tables**: `terminalLocations` (profit centers), `terminals`, `terminalCardReaders`, `terminalCardReaderSettings`, `dayEndClosings`, `dayEndClosingPaymentTypes`, `dayEndClosingCashCounts`, `terminalLocationTipSuggestions`, `terminalLocationFloorPlans`, `drawerEvents`, `registerNotes`, `printers`, `printJobs`
  - Profit center fields: `locationId`, `code`, `description`, `icon`, `sortOrder`, `tipsApplicable`, receipt config
  - Terminal fields: `terminalNumber`, `deviceIdentifier`, `ipAddress`, `isActive`, settings (pin lock, auto-logout, signature tip, etc.)

- **Location Hierarchy** (migration 0095):
  - Adds `parentLocationId` (self-FK) and `locationType` ('site' | 'venue') to `locations` table
  - Check constraints: sites have no parent, venues must have a parent
  - Index on `(tenant_id, parent_location_id)` for efficient venue lookups
  - Hierarchy: Tenant → Site → Venue → Profit Center → Terminal

- **Terminal Session Flow**:
  - **TerminalSelectionScreen**: Full-screen modal with 4-level cascading selects (Site → Venue → Profit Center → Terminal), auto-selects when only one option exists
  - **TerminalSessionProvider**: React Context + localStorage persistence (`oppsera:terminal-session`), provides `session`, `setSession()`, `clearSession()`
  - **`useTerminalSelection` hook**: Single API call (`GET /api/v1/terminal-session/all?roleId=xxx`) fetches all locations + profit centers + terminals, then filters client-side via `useMemo`. Supports optional `roleId` for role-based access scoping. Auto-selects single sites/venues/PCs/terminals via `useEffect` chains. Returns `buildSession()` factory for constructing `TerminalSession` object.

- **Profit Centers Settings UI** (3-panel layout):
  - **LocationsPane**: Read-only site/venue tree with expand/collapse chevrons, icons (Building2/MapPin), auto-expand single site
  - **ProfitCenterPane**: CRUD list with selection highlight, MoreVertical menu (Edit/Deactivate), code badge, terminal count pill
  - **TerminalPane**: CRUD list with terminal number badge, device identifier, menu actions
  - **Orchestrator** (`profit-centers-content.tsx`): Single API call via `useProfitCenterSettings()` fetches all data; client-side filtering via helper functions (`filterProfitCenters`, `filterTerminalsByLocation`, `filterTerminalsByPC`). Simple/Advanced mode toggle (localStorage), 2-col/3-col grid, selection cascade, site-level warning banner, ensure-default for Simple mode terminal add
  - **ProfitCenterFormModal**: `prefilledLocationId` + `requireSiteLevelConfirm` props for guardrail checkbox
  - **Site-level guardrail**: Backend rejects profit centers at sites with child venues unless `allowSiteLevel: true`; frontend shows yellow warning banner + confirmation checkbox

- **OrdersWriteApi** (`packages/core/src/helpers/orders-write-api.ts`):
  - Cross-module abstraction for creating/modifying orders without direct module imports
  - Singleton pattern: `setOrdersWriteApi()` / `getOrdersWriteApi()`, wired in `apps/web/src/lib/orders-bootstrap.ts`
  - Used by PMS integration to create orders from reservations

- **Entitlement Access Modes** (migration 0098):
  - Evolved from binary (on/off) to three-mode: `off` | `view` | `full`
  - `MODULE_REGISTRY` enhanced with `dependencies[]`, `riskLevel`, `supportsViewMode`, `category` per module
  - **Dependency validation**: `validateModeChange()` + `computeDependencyChain()` — pure functions, no DB
  - **`requireEntitlementWrite(moduleKey)`** — middleware that blocks `view` mode (throws `ModuleViewOnlyError`, 403)
  - **`withMiddleware` `writeAccess` option** — routes can specify `{ entitlement: 'catalog', writeAccess: true }` to block view-only tenants
  - **Entitlement change log**: append-only `entitlement_change_log` table tracking all mode changes with reason
  - **Module templates**: `module_templates` table for preset module configurations by business type

- **Admin Portal RBAC** (migration 0097):
  - **4 new platform tables**: `platform_admin_roles`, `platform_admin_role_permissions`, `platform_admin_role_assignments`, `platform_admin_audit_log`
  - Extended `platform_admins`: `phone`, `status` (active/invited/suspended/deleted), invite flow fields (`inviteTokenHash`, `inviteExpiresAt`), `passwordResetRequired`
  - Granular permission model: `module.submodule.action` with `scope` (global/tenant/self)
  - Admin audit log with before/after snapshots
  - `withAdminPermission(handler, { module, action })` middleware
  - `auditAdminAction()` helper for logging admin operations
  - Seed script: `tools/scripts/seed-admin-roles.ts` for default roles

- **Admin User Management**:
  - **Staff management**: `/users` page with invite, suspend, reactivate, password reset, role assignment
  - **Customer admin**: cross-tenant customer search (name/email/phone/identifier)
  - **API routes**: `GET/POST /api/v1/admin/staff`, `PATCH /api/v1/admin/staff/[id]`, `GET /api/v1/admin/customers`
  - **Hooks**: `useStaff`, `useCustomersAdmin`
  - **Libs**: `staff-commands.ts`, `staff-queries.ts`, `customer-queries.ts`, `admin-audit.ts`, `admin-permissions.ts`

- **F&B POS Improvements**:
  - Floor + Tab views now CSS-mounted (stay mounted, toggle via `hidden` class) — prevents data loss on screen switch
  - New `TableGridView` component for grid-based table layout (alternative to canvas)
  - Auto-fit floor canvas: computes bounding box and calculates `viewScale` to fit all tables
  - `fnb-pos-store`: added `selectedMenuCategory` for persistent category selection
  - Enhanced `useFnbTab` hook with targeted `tabId` operations
  - Enhanced `useFnbMenu` hook with persistent search and category state

- **Order Metadata Support**:
  - Orders now support `metadata: Record<string, unknown>` (JSONB) for cross-module context
  - Added to `openOrderSchema` and `updateOrderSchema` validation
  - Used by PMS `check-in-to-pos` route to attach reservation context

- **Terminal Session Integration**:
  - POS layout now uses `TerminalSessionProvider` for terminal ID (replaces URL param / localStorage)
  - Dashboard layout gates children with `TerminalSessionGate` — shows selection screen if no session
  - Users can skip terminal selection for non-POS workflows

- **Seed Data Updates**:
  - Location hierarchy: 1 site + 2 venues (was flat locations)
  - Profit centers: 2 (one per venue) with code/description
  - Terminals: 2 (one per profit center) with terminal numbers

- **Migrations 0093–0098**:
  - `0093_profit_center_extensions.sql`: adds location_id, code, description, is_active, icon, sort_order to terminal_locations + location_id, terminal_number, device_identifier, ip_address, is_active to terminals. Backfills existing rows.
  - `0094_optimize_rls_current_setting.sql`: wraps all RLS `current_setting()` calls in subqueries `(select current_setting(...))` for InitPlan evaluation (once per query instead of per-row). Idempotent PL/pgSQL.
  - `0095_location_hierarchy.sql`: adds parent_location_id + location_type to locations with check constraints and index.
  - `0096_unindexed_foreign_keys.sql`: adds missing indexes on catalog_items.tax_category_id, ap_bills.payment_terms_id, customer_auth_accounts.customer_id.
  - `0097_admin_user_management.sql`: extends platform_admins, adds platform_admin_roles + permissions + assignments + audit_log tables.
  - `0098_entitlement_access_modes.sql`: adds access_mode to entitlements, creates entitlement_change_log and module_templates tables.
- **Migrations 0099–0107** (Accounting Alignment Sessions 37–48):
  - `0099_legacy_gl_gate.sql`: `enable_legacy_gl_posting` on accounting_settings
  - `0100_accounting_tips_service_charge.sql`: tips payable + service charge GL account defaults
  - `0101_gl_line_dimensions.sql`: profitCenterId, subDepartmentId, terminalId, channel on gl_journal_lines
  - `0102_coa_template_accounts.sql`: Tips Payable (2160) + Service Charge Revenue (4500) templates
  - `0103_line_item_returns.sql`: return_type, return_order_id on orders; original_line_id on order_lines
  - `0104_fnb_gl_account_mappings.sql`: fnb_gl_account_mappings table for F&B GL resolution
  - `0105_voucher_gl_audit.sql`: gl_journal_entry_id on voucher tables
  - `0106_membership_gl_ar_billing.sql`: revenue/deferred GL on membership_plans; billing_account_id on orders
  - `0107_chargebacks.sql`: chargebacks table (received → under_review → won/lost)
- **Migrations 0108–0118** (UXOPS-01 through UXOPS-11):
  - `0108_drawer_sessions.sql`: drawer_sessions + drawer_session_events tables
  - `0109_retail_close_batches.sql`: retail_close_batches + tender/tax breakdown tables
  - `0110_comp_events.sql`: comp_events + comp GL defaults
  - `0111_returns_contra_accounts.sql`: is_contra_account on gl_accounts + returns account default
  - `0112_payment_settlements.sql`: payment_settlements + payment_settlement_lines
  - `0113_tip_payouts.sql`: tip_payouts + tip_payout_details
  - `0114_tax_jurisdiction_enrichment.sql`: jurisdiction columns on tax_rates
  - `0115_cogs_posting_mode.sql`: COGS tri-state on settings + periodic_cogs_calculations table
  - `0116_fnb_batch_category_version.sql`: category_version on fnb_close_batch_summaries
  - `0117_event_dead_letters.sql`: event_dead_letters table
  - `0118_deposit_slips.sql`: deposit_slips table

### What's Next
- ~~F&B POS frontend wiring~~ ✓ DONE (Sessions 17-28: 12 phases — design tokens, floor plan, tab/check, menu, KDS/expo, split checks, payment/tips, manager/host/close-batch, real-time, architecture, responsive, integration tests)
- F&B POS migration (run fnb schema migration 0082 on dev DB, then sync tables from room layouts)
- Accounting frontend (COA management, journal browser, ~~mapping UI~~, ~~payment type mapping UI~~, report viewers, statement viewers)
- AP frontend (bill entry, payment batch, aging dashboard, vendor ledger)
- AR frontend (invoice entry, receipt entry, aging dashboard, customer ledger)
- AP approval workflow (Draft → Pending Approval → Approved → Posted)
- Bank reconciliation module (match bank feeds to GL entries)
- Vendor Management remaining API routes (search, deactivate/reactivate, catalog CRUD endpoints)
- Purchase Orders module Phases 2-6 (commands, queries, API routes, frontend) — schema done
- Receiving module frontend polish (barcode scan on receipt lines, cost preview panel, void receipt UI)
- Settings → Dashboard tab (widget toggles, notes editor)
- Install `@sentry/nextjs` and uncomment Sentry init in `instrumentation.ts`
- Ship logs to external aggregator (Axiom/Datadog/Grafana Cloud)
- Remaining security items: CORS for production, email verification, account lockout, container image scanning (see `infra/SECURITY_AUDIT.md` checklist)
- Run `pnpm --filter @oppsera/module-semantic semantic:sync` after migrations 0070-0073
- For existing tenants: run `tools/scripts/add-semantic-entitlement.ts` to grant semantic access
- ~~Package "Price as sum of components" toggle~~ ✓ DONE (Session 27)
- ~~Debug/link-account endpoints secured~~ ✓ DONE (Session 35)
- ~~Semantic error message sanitization~~ ✓ DONE (Session 35)
- ~~Admin app security headers~~ ✓ DONE (Session 35)
- ~~Payments module unit tests (0 → 101)~~ ✓ DONE (Session 35)
- ~~AR tests expanded (23 → 129)~~ ✓ DONE (Session 35)
- ~~CI workflow (lint + type-check + test + build)~~ ✓ DONE (Session 35)
- ~~AR InvoiceStatusError → 409~~ ✓ DONE (Session 35)
- ~~AR customer validation in createInvoice~~ ✓ DONE (Session 35)
- ~~buildQueryString() helper extracted~~ ✓ DONE (Session 35)
- ~~accounts-content.tsx split into sub-components~~ ✓ DONE (Session 35)
- ~~Test coverage reporting configured~~ ✓ DONE (Session 35)
- ~~POS/Accounting/AP/AR API route contract tests (74 tests)~~ ✓ DONE (Session 35)
- ~~Profit Centers submodule (core commands/queries + API routes + hooks)~~ ✓ DONE
- ~~Terminal infrastructure schema (9+ tables in terminals.ts)~~ ✓ DONE
- ~~Location hierarchy (parent_location_id + location_type on locations)~~ ✓ DONE
- ~~Terminal session flow (selection screen + session provider + localStorage)~~ ✓ DONE
- ~~Profit Centers 3-panel Settings UI (Simple/Advanced mode + guardrails)~~ ✓ DONE
- ~~Admin tenant management (CRUD + hierarchy builder + entitlements)~~ ✓ DONE
- ~~RLS optimization (subquery-wrapped current_setting for InitPlan caching)~~ ✓ DONE
- ~~OrdersWriteApi cross-module abstraction~~ ✓ DONE
- ~~Entitlement access modes (off/view/full) + dependency validation~~ ✓ DONE
- ~~Admin portal RBAC (roles, permissions, audit log)~~ ✓ DONE
- ~~Admin user management (staff + customer pages)~~ ✓ DONE
- ~~F&B POS CSS-mount for floor/tab views~~ ✓ DONE
- ~~Order metadata support (JSONB)~~ ✓ DONE
- ~~Seed: site→venue hierarchy + profit centers + terminals~~ ✓ DONE
- ~~Accounting alignment: dual GL posting fix~~ ✓ DONE (Session 37)
- ~~Accounting alignment: complete GL categories~~ ✓ DONE (Session 38)
- ~~Accounting alignment: void GL reversal~~ ✓ DONE (Session 39)
- ~~Accounting alignment: GL dimensions~~ ✓ DONE (Session 40)
- ~~Accounting alignment: close checklist enhancements~~ ✓ DONE (Session 41)
- ~~Accounting alignment: COA templates + backfill~~ ✓ DONE (Session 42)
- ~~Accounting alignment: line-item refunds~~ ✓ DONE (Session 43)
- ~~Accounting alignment: F&B GL wiring~~ ✓ DONE (Session 44)
- ~~Accounting alignment: voucher deferred revenue~~ ✓ DONE (Session 45)
- ~~Accounting alignment: memberships GL + AR~~ ✓ DONE (Session 46)
- ~~Accounting alignment: chargeback support~~ ✓ DONE (Session 47)
- ~~Accounting alignment: posting matrix + integration tests~~ ✓ DONE (Session 48)
- ~~UXOPS-01: Drawer sessions (server-persisted shifts)~~ ✓ DONE
- ~~UXOPS-02: Retail close + Z-report~~ ✓ DONE
- ~~UXOPS-03: Manager PIN + Comp/Void-Line GL~~ ✓ DONE
- ~~UXOPS-04: Partial refunds + returns contra-accounts~~ ✓ DONE
- ~~UXOPS-05: Card settlement + clearing accounts~~ ✓ DONE
- ~~UXOPS-06: Tip payout workflow~~ ✓ DONE
- ~~UXOPS-07: Tax jurisdiction enrichment + remittance report~~ ✓ DONE
- ~~UXOPS-08: COGS posting mode (disabled/perpetual/periodic)~~ ✓ DONE
- ~~UXOPS-09: F&B batch category keys + coverage~~ ✓ DONE
- ~~UXOPS-10: Dead letter queue + admin UI~~ ✓ DONE
- ~~UXOPS-11: Hybrid close + deposit aggregation~~ ✓ DONE
- ~~UXOPS-12: Close checklist extensions + settings~~ ✓ DONE
- ~~UXOPS-13: Operations dashboard + tender audit trail~~ ✓ DONE
- ~~UXOPS-14: Integration tests + posting matrix extension~~ ✓ DONE
- ~~ACCT-CLOSE-01: Cash Drawer Hardening~~ ✓ DONE
- ~~ACCT-CLOSE-02: Breakage Income Configurability~~ ✓ DONE
- ~~ACCT-CLOSE-03: Reconciliation Summary Dashboard~~ ✓ DONE
- ~~ACCT-CLOSE-04: Audit Log Consistency Pass~~ ✓ DONE
- ~~ACCT-CLOSE-05: Permissions Matrix~~ ✓ DONE
- ~~ACCT-CLOSE-06: Multi-Currency + Recurring Journal Entries~~ ✓ DONE
- ~~ACCT-CLOSE-07: Bank Reconciliation~~ ✓ DONE
- ~~ACCT-CLOSE-08: Documentation + Provisioning~~ ✓ DONE
- ~~Reporting consumers cents→dollars conversion~~ ✓ DONE
- ~~Dashboard 3-tier fallback (read models → today orders → all-time)~~ ✓ DONE
- ~~Reports backfill route for seed data~~ ✓ DONE
- ~~AccountPicker intelligent suggestions (semantic grouping + 20 role paths)~~ ✓ DONE
- ~~Mapping content 5-tab layout with auto-mapping engine~~ ✓ DONE
- ~~Dark mode accounting bootstrap wizard~~ ✓ DONE
- ~~Transaction type registry (45 system types + tenant custom)~~ ✓ IN PROGRESS (uncommitted)
- ~~Onboarding system (10 phases, auto-detection, Go Live checklist)~~ ✓ IN PROGRESS (uncommitted)
- ~~F&B floor dual view modes (layout + grid)~~ ✓ IN PROGRESS (uncommitted)
- ~~F&B menu panel refactor (6 sub-components, deduplication)~~ ✓ IN PROGRESS (uncommitted)
- ~~Dashboard setup status banner~~ ✓ IN PROGRESS (uncommitted)
- ~~Member portal app (standalone Next.js)~~ ✓ DONE
- ~~Customer sub-resource API expansion (50+ routes)~~ ✓ DONE
- ~~Guest Pay (QR code pay at table)~~ ✓ DONE
- ~~COA governance (merge, renumber, CSV import, health dashboard)~~ ✓ DONE
- ~~F&B payment tier 3 (gift cards, house accounts, NFC stubs)~~ ✓ DONE
- ~~GL remap workflow (preview, batch remap, auto-remap setting)~~ ✓ DONE
- ~~Admin impersonation + tenant role CRUD~~ ✓ DONE
- ~~RBAC permission seed fixes (wildcard admin, F&B defaults)~~ ✓ DONE
- ~~Dead letter routes switched to DB persistence~~ ✓ DONE
- ~~Vercel build blockers resolved (all 3 apps)~~ ✓ DONE
- ~~1,500+ new accounting tests~~ ✓ DONE
- ~~PMS module (reservations, calendar, folios, housekeeping, yield mgmt, channels, loyalty)~~ ✓ DONE
- ~~Semantic dual-mode pipeline (metrics + SQL generation)~~ ✓ DONE
- ~~Admin train-ai platform (batch review, experiments, regression, safety, cost analytics)~~ ✓ DONE
- ~~Insights sub-pages (authoring, embeds, reports, tools, watchlist)~~ ✓ DONE
- ~~Catalog/customer/staff import system~~ ✓ DONE
- ~~Customer tag management (smart tags, rules, audit)~~ ✓ DONE
- ~~PMS calendar frontend~~ ✓ IN PROGRESS (uncommitted)
- ~~Payment gateway integration (CardPointe foundation + ACH + surcharges)~~ ✓ DONE
- ~~ERP dual-mode infrastructure (workflow engine + tier defaults + close orchestrator)~~ ✓ DONE
- ~~Modifier group enhancements (categories, channel visibility, per-assignment overrides)~~ ✓ DONE
- ~~Modifier reporting read models (3 rm_ tables + 8 analytics queries)~~ ✓ DONE
- ~~Role access scoping (location/profit-center/terminal level)~~ ✓ DONE
- ~~SuperAdmin portal (14 sessions, 120 API routes, 90+ components)~~ ✓ DONE (spec complete)
- ~~Semantic intelligence expansion (anomaly detection, root cause, correlation, forecasting, agentic orchestrator)~~ ✓ DONE
- ~~POS UX (visibility resume, connection indicator, customer cache, display size, error boundary)~~ ✓ DONE
- ~~Member portal payment methods (bank accounts, card tokenization, one-time payments)~~ ✓ DONE
- ~~Guest pay enhancements (lookup codes, email receipts, card charges)~~ ✓ DONE
- ~~Tenant business info + content blocks (Settings → General)~~ ✓ DONE
- ~~Merchant services settings UI (5-tab layout: providers, accounts, devices, terminals, wallets)~~ ✓ DONE
- ~~Year seed script (366 days of realistic transactions)~~ ✓ DONE
- ~~Portal auth scripts (seed-portal-auth, add-portal-member)~~ ✓ DONE
- ~~Bug fixes: modifiers category filter, inventory display, F&B export, catalog import, PMS projector~~ ✓ DONE
- Run migrations 0134-0193 on dev DB
- Run `tools/scripts/seed-admin-roles.ts` after migration 0097
- Run `tools/scripts/backfill-accounting-accounts.ts` after migration 0100 (creates Tips Payable + Service Charge Revenue for existing tenants)
- Toggle `enableLegacyGlPosting = false` per tenant after validating GL reconciliation
- PMS frontend: reservation detail, guest profile, housekeeping dashboard, rate management
- PMS testing: unit tests for commands/queries, integration tests for lifecycle flows
- Admin invite flow (email sending integration)
- Admin customer detail page (cross-tenant profile viewer)
- Module template management UI (create/apply presets)
- Entitlement bulk mode change (batch enable/disable with dependency resolution)
- Semantic SQL mode testing: regression suite for common SQL patterns
- Payment gateway: additional providers (Square, Worldpay), Apple Pay merchant validation, recurring billing
- ERP cron: upgrade to Vercel Pro for 15-minute cron intervals (required for auto-close windows)
- SuperAdmin portal: implement all 14 session specs (build frontend + backend per session notes)
- Modifier reporting: frontend analytics dashboards (daypart heatmaps, upsell impact, waste signals)

## Critical Gotchas (Quick Reference)

1. **`z.input<>` not `z.infer<>`** for function params when schema has `.default()` — see CONVENTIONS.md §19
2. **`export type` doesn't create local bindings** — add separate `import type` for same-file use — see §20
3. **Money: catalog/GL/AP/AR=dollars (NUMERIC), orders/payments=cents (INTEGER)** — convert with `Math.round(parseFloat(price) * 100)` for catalog→orders, `(cents / 100).toFixed(2)` for POS→GL — see §21
4. **postgres.js returns RowList** — use `Array.from(result as Iterable<T>)`, never `.rows`
5. **Append-only tables** — `inventory_movements`, `audit_log`, `payment_journal_entries` are never updated/deleted
6. **Receipt snapshots are immutable** — frozen at `placeOrder`, never regenerated
7. **POS commands need idempotency INSIDE the transaction** — `checkIdempotency(tx, ...)` and `saveIdempotencyKey(tx, ...)` both use the transaction handle, not bare `db`. This prevents TOCTOU race conditions between check and save.
8. **POS layout dual-mounts both shells** — `pos/layout.tsx` mounts both Retail and F&B POS content via `next/dynamic` and toggles with CSS (`invisible pointer-events-none`). Page files (`retail/page.tsx`, `fnb/page.tsx`) return `null` — they exist only as route targets. Content lives in `retail-pos-content.tsx` / `fnb-pos-content.tsx` with `isActive` prop. Exit via router.push('/dashboard').
9. **Item typeGroup drives POS behavior** — always use `getItemTypeGroup()` from `@oppsera/shared`, never raw `item.type`
10. **POS V1 state is localStorage (except shifts)** — config, favorites are localStorage until backend APIs exist. Shifts are now server-persisted via `drawer_sessions` table with localStorage fallback for offline.
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
50. **Event payloads must be self-contained** — consumers should NEVER query other modules' tables. If a consumer needs data not in the event, enrich the event payload at publish time. All cross-module consumer violations have been resolved via payload enrichment.
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
73. **Read model tables use `rm_` prefix** — all reporting/CQRS read models are prefixed `rm_` (e.g., `rm_daily_sales`). They are projections updated by event consumers, never by user commands directly.
74. **Read model monetary columns use NUMERIC(19,4), not cents** — unlike order-layer tables (cents as INTEGER), read models store aggregated dollar amounts as `NUMERIC(19,4)` since they are reporting summaries, not transactional amounts. Always convert with `Number()` when returning to frontend.
75. **Read models use upsert-by-natural-key** — each `rm_` table has a UNIQUE composite index on its natural key (e.g., `tenant_id + location_id + business_date`). Consumers use `ON CONFLICT ... DO UPDATE` to increment/decrement aggregates atomically.
76. **processed_events has tenant_id** — the `processed_events` table was enhanced with `tenant_id` for tenant-scoped consumer idempotency. Consumers check `(tenant_id, consumer_name, event_id)` before processing.
77. **Reporting consumers use atomic idempotency** — each consumer does `INSERT INTO processed_events ... ON CONFLICT DO NOTHING RETURNING id` as the first statement inside `withTenant`. If RETURNING is empty, event was already processed → skip. This is stronger than the bus-level `checkProcessed` because it's inside the same transaction as the read model upsert.
78. **Business date uses day-close-time offset** — `computeBusinessDate(occurredAt, timezone, dayCloseTime?)` subtracts the day-close offset (default `'00:00'`) from the UTC timestamp before converting to local date. Events between midnight and dayCloseTime belong to the previous business day.
79. **Voids don't decrement orderCount** — `handleOrderVoided` increments `voidCount`/`voidTotal` and subtracts from `netSales`, but does NOT touch `orderCount`. `avgOrderValue` is recomputed as `netSales / orderCount` with the original count.
80. **Reporting consumers use raw SQL, not Drizzle fluent API** — `tx.execute(sql`...ON CONFLICT...DO UPDATE SET col = col + ${value}...`)` because Drizzle's `onConflictDoUpdate` doesn't support `EXCLUDED` column references or arithmetic on existing values.
81. **Multi-location aggregation recomputes avgOrderValue** — when aggregating daily sales across locations, `avgOrderValue = SUM(netSales) / SUM(orderCount)`. Never sum per-location avgOrderValue — that's a mathematical error (average of averages ≠ true average).
82. **CSV export uses UTF-8 BOM** — `toCsv()` prepends `\uFEFF` (BOM) so Excel auto-detects UTF-8 encoding. Without BOM, Excel may interpret as ANSI and mangle non-ASCII characters.
83. **Report API routes use two permission levels** — `reports.view` for JSON data queries, `reports.export` for CSV downloads. Both require the `reporting` entitlement. This allows operators to grant dashboard access without export capability.
84. **Vendor name uniqueness uses `name_normalized`** — `LOWER(TRIM(name))` stored in `name_normalized` column with UNIQUE constraint `(tenant_id, name_normalized)`. Always recompute and check on create/update/reactivate. Use `normalizeVendorName()` from `services/vendor-name.ts`.
85. **Vendors are soft-deleted, never hard-deleted** — set `isActive = false` via `deactivateVendor()`. Queries filter by `isActive` by default. Reactivation re-checks name uniqueness against active vendors.
86. **Vendor catalog items (`item_vendors`) use soft-delete** — `isActive` boolean, never hard DELETE. `deactivateVendorCatalogItem()` sets `isActive = false`. Re-adding a deactivated mapping reactivates the existing row.
87. **postReceipt() auto-updates vendor item costs** — Rule VM-4: inside the postReceipt transaction, `updateVendorItemCostAfterReceipt()` upserts `item_vendors.last_cost`, `last_received_at`, and `vendor_cost`. Auto-creates the row if vendor+item pair doesn't exist.
88. **Receipt posting recomputes everything from scratch** — Rule VM-5: server recomputes all line calculations (extendedCost, baseQty, shipping allocation, landedCost, landedUnitCost) before posting. Client-side values are previews only.
89. **Shipping allocation remainder distribution** — after proportional split (rounded to 4dp), remainder cents are distributed one-by-one to lines ordered by extendedCost DESC, tie-break by id ASC. Sum of allocated amounts MUST exactly equal shippingCost.
90. **Only one preferred vendor per item** — `addVendorCatalogItem` and `updateVendorCatalogItem` enforce single preferred vendor per inventoryItemId. Setting `isPreferred = true` clears all others in the same transaction.
91. **Receipt lifecycle is status-based** — DRAFT → POSTED → VOIDED. No hard deletes. Draft receipts can be edited/deleted. Posted receipts can only be voided. Voided receipts are immutable.
92. **Purchase orders use optimistic locking** — `version` column on `purchase_orders`, incremented on each mutation. PO revision snapshots (JSONB) are created when editing submitted/sent POs.
93. **Circular import avoidance between schema files** — `purchasing.ts` imports from `receiving.ts` (for vendors, itemVendors). The reverse link (`receiving_receipts.purchase_order_id → purchase_orders`) is a plain text column in Drizzle with FK added via ALTER TABLE in migration only.
94. **Receiving money stored as NUMERIC(12,4) in dollars** — unlike orders (cents as INTEGER), receiving/purchasing amounts are `NUMERIC(12,4)` dollars (same convention as reporting read models). Always convert with `Number()` in query mappings.
95. **POS catalog uses single-query loader** — `getCatalogForPOS` in `packages/modules/catalog/src/queries/get-catalog-for-pos.ts` loads the full catalog in one optimized query via `POST /api/v1/catalog/pos`. Don't use multiple individual category/item API calls in POS context.
96. **Golf reporting is a separate module** — `packages/modules/golf-reporting/` is independent from `packages/modules/reporting/`. It has its own schema (`golf-reporting.ts`), consumers, queries, and KPI modules. Don't mix golf-specific read models with the core reporting `rm_` tables.
97. **Archive semantics replace isActive boolean** — catalog items use `archivedAt IS NULL` for active status, NOT a boolean `isActive` column. The `isActive` column was dropped in migration 0061. Use `archiveItem` / `unarchiveItem` commands. Archived items have `archivedAt`, `archivedBy`, and `archivedReason` fields.
98. **`catalog_item_change_logs` is append-only** — RLS enforces SELECT + INSERT only (no UPDATE or DELETE policies). The `logItemChange()` function runs inside the same `publishWithOutbox` transaction as the mutation. It skips the insert if `computeItemDiff()` returns null (no actual changes).
99. **Receiving frontend uses pure calculation library** — `apps/web/src/lib/receiving-calc.ts` contains pure functions for line totals, shipping allocation, and receipt summary. These are client-side previews only — server recomputes everything on post (Rule VM-5). Keep calculations pure (no side effects, no API calls).
100. **Freight mode determines shipping handling** — ALLOCATE mode distributes `shippingCost` across receipt lines proportionally (by extendedCost). EXPENSE mode books shipping as a separate GL expense, not included in landed cost. Set via `freightMode` on `receivingReceipts` (migration 0064).
101. **Trigram GIN indexes for search** — migration 0062 adds `pg_trgm` GIN indexes on `catalog_items(name)`, `catalog_items(sku)`, `item_identifiers(value)`, and `vendors(name)` for fast substring search via `ILIKE '%term%'`. These replace sequential scans on receiving item search.
102. **Supabase local dev** — `supabase/` directory contains `config.toml` for local Postgres v17 + pooler. Use `npx supabase start` for local DB + auth. Database URL for local dev: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
103. **Stock UI lives in catalog item detail page, not a separate page** — The Stock Levels page was deleted. All stock data (on-hand, movements, receive/adjust/shrink) is shown via `StockSection` component in `/catalog/items/[id]`. The data architecture stays split: `catalog_items` (global) + `inventory_items` (per-location). Only the UI was unified.
104. **POS catalog auto-refreshes every 5 minutes** — `useCatalogForPOS` periodically fetches fresh data so archived items are removed during long shifts. Additionally, `usePOS` accepts `onItemNotFound` callback — triggered on 404 from `addItem`, which pages wire to `catalog.refresh()` for immediate stale-item purge.
105. **`useInventoryForCatalogItem` resolves catalog→inventory** — Takes `(catalogItemId, locationId?)` and returns the inventory item with computed on-hand, or `null` when no inventory record exists at that location. Backend: `getInventoryItemByCatalogItem` query. API: `GET /api/v1/inventory/by-catalog-item`.
106. **Inventory dialogs are portal-based extracted components** — `receive-dialog.tsx`, `adjust-dialog.tsx`, `shrink-dialog.tsx` in `apps/web/src/components/inventory/`. Each takes `{ open, onClose, inventoryItemId, onSuccess }`. Uses `createPortal` to `document.body`, z-50. Shared between catalog item detail page and any future usage.
107. **Every dashboard page uses code-split pattern** — `page.tsx` is a thin wrapper: `dynamic(() => import('./xxx-content'), { loading, ssr: false })`. Heavy content lives in `*-content.tsx`. This ensures route transitions commit instantly (loading skeleton appears) while the JS chunk loads async. Never put heavy logic directly in `page.tsx`.
108. **Dashboard sidebar is z-40, main content is z-0** — desktop sidebar has `relative z-40` to stay above POS overlay backdrops (z-30). Main content area has `relative z-0` to create a stacking context that scopes POS `fixed`/`absolute` overlays. Portals to `document.body` (z-50/z-60) are unaffected.
109. **POS portal dialogs must close on mode switch** — when `isActive` becomes false, a `useEffect` in each POS content component sets all dialog states to `false`. Without this, `createPortal` dialogs render outside the CSS-hidden container and remain visible on top of the other POS mode.
110. **Category hooks share a module-level cache** — `_catCache` in `use-catalog.ts` deduplicates concurrent category API calls via shared promise + 30s TTL. `useDepartments`, `useSubDepartments`, `useCategories` all call `useAllCategories()` which filters in-memory. Never fetch categories individually.
111. **Dashboard uses reporting read models for KPIs** — `GET /api/v1/reports/dashboard` returns pre-aggregated metrics from `rm_daily_sales` and `rm_inventory_on_hand` tables. Never fetch raw orders/inventory for dashboard KPI cards — that's 100x slower. Dashboard also uses sessionStorage caching with business-date invalidation.
112. **`listItems` supports `includeInventory` flag** — when `true`, the backend batch-fetches `inventory_items` + computes `SUM(quantity_delta)` on-hand in the same transaction. Returns `inventoryItemId`, `onHand`, `reorderPoint` on each item. Eliminates the need for a separate inventory API call on the catalog list page.
113. **Dashboard uses React Query for data fetching** — `dashboard-content.tsx` uses `useQuery` with `({ signal })` pattern for automatic AbortSignal cancellation. When user navigates away, all in-flight dashboard requests are cancelled instantly. `QueryProvider` wraps the dashboard layout with `staleTime: 30_000`, `gcTime: 5 * 60 * 1000`. Never use raw `useEffect` + `apiFetch` for dashboard data — use React Query.
114. **Register tab orderId clearing is ONLY via `clearActiveTab()`** — the sync-back effect in `use-register-tabs.ts` must NEVER auto-clear `orderId` when `pos.currentOrder` is null. During POS remount, `currentOrder` is temporarily null while the order fetch is in-flight — auto-clearing would break the `tab → order → customer` chain. All order-clearing paths (payment, void, hold) already explicitly call `clearActiveTab()`.
115. **`clearActiveTab()` clears both `orderId` AND `label`** — after payment/void/hold, the customer name stored in `tab.label` must be wiped along with `orderId`. The label came from the customer attachment and should not persist across orders.
116. **POS loading paths use `isSwitching` guard** — when `useRegisterTabs` loads from cache or server, `isSwitching.current = true` blocks the sync-back effect during the rehydration window. Released via `requestAnimationFrame` after order fetches are dispatched. Without this, the sync-back effect races with order rehydration and clears orderId.
117. **`placeOrder()` recovers from "already placed" 409** — when a preemptive placeOrder races with handleSubmit, the second call gets a 409. Instead of clearing the order via `handleMutationError`, `doPlace()` catches the 409, fetches the placed order, and returns it as success. TenderDialog's `handleSubmit` also has a fallback: on placeOrder failure, it re-fetches the order and continues if status is 'placed'.
118. **TenderDialog preemptive placeOrder pattern** — when TenderDialog opens, it fires `onPlaceOrder()` in a useEffect so the order is placed by the time the user enters an amount and clicks Pay. `handleSubmit` awaits `placePromiseRef.current` (the preemptive promise) to avoid double-calling. Both `placeOrder()` (via `placingPromise.current`) and TenderDialog (via `placePromiseRef.current`) deduplicate concurrent place calls.
119. **`vercel.json` must not duplicate Vercel Dashboard settings** — When the Dashboard sets `rootDirectory: apps/web`, any `outputDirectory`, `buildCommand`, or `installCommand` in `vercel.json` are resolved *relative to that root*. Setting `outputDirectory: "apps/web/.next"` creates a double-nested path (`/vercel/path0/apps/web/apps/web/.next`) and breaks the build. Keep `vercel.json` minimal — only `$schema` and `regions`. All build/install/output/framework settings live in the Dashboard (or Vercel API) only. **Correct Dashboard settings for this monorepo**: Root Directory = `apps/web`, Framework = Next.js, Install Command = `cd ../.. && pnpm install`, Build Command = `cd ../.. && pnpm turbo build --filter=@oppsera/web...`, Output Directory = default (leave blank).
120. **`db:seed` does NOT create Supabase Auth users** — the seed creates app-level DB records only (`users` table, memberships, etc.) and leaves `users.auth_provider_id` as null. The production `SupabaseAuthAdapter.validateToken()` looks up users by `auth_provider_id` — if it's null, login silently fails even with valid Supabase credentials (the frontend just clears the form). To fix for a new environment: (1) create the Supabase Auth user via admin API (or confirm it already exists), (2) update the app's users table to link the UUID. Quick recovery commands:
   ```bash
   # 1. Find the Supabase Auth UUID for the user
   curl "$SUPABASE_URL/auth/v1/admin/users" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
   # 2. Reset their password if needed
   curl -X PUT "$SUPABASE_URL/auth/v1/admin/users/<uuid>" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"password":"<newpassword>"}'
   # 3. Link the UUID to the app's users table
   curl -X PATCH "$SUPABASE_URL/rest/v1/users?email=eq.<email>" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"auth_provider_id":"<uuid>"}'
   ```
   `DEV_AUTH_BYPASS=true` bypasses all of this on localhost — lookup is by email only, password ignored.
121. **`computePackageAllocations` lives in `@oppsera/shared`, not a module** — pure math, no DB, no side effects. Lives at `packages/shared/src/utils/package-allocation.ts`, exported from `@oppsera/shared`. Import it from any module without violating cross-module rules. Do NOT place pure allocation logic in a module package — it can't be shared from there.
122. **`addLineItem` now populates `packageComponents` for ALL packages** — previously always `null`, now enriched with `componentUnitPriceCents`, `componentExtendedCents`, `allocatedRevenueCents`, and `allocationWeight` for every package item. This activated the existing inventory component deduction in the inventory consumer (gotcha #20) for both `fixed` and `sum_of_components` pricing modes. For `fixed` mode, component prices are fetched live from catalog at order time.
123. **Package component prices are fetched outside the transaction** — `addLineItem` resolves component prices (via `catalogApi.getEffectivePrice()`, batched with `Promise.all`) before entering the `publishWithOutbox` transaction. This avoids N serial DB round-trips inside the transaction and prevents lock contention. Always keep non-mutating reads outside the transaction boundary.
124. **Reporting consumer splits component revenue for enriched packages** — `handleOrderPlaced` checks `packageComponents[0].allocatedRevenueCents != null`. If present, records each component separately in `rm_item_sales` using `allocatedRevenueCents / 100` as dollars. If absent (old packages, null components), falls back to recording the package line itself — backward-compatible.
125. **Semantic registry uses stale-while-revalidate (SWR) caching** — `getCache()` in `registry.ts` returns stale data for up to 10 minutes (SWR_WINDOW_MS) while refreshing in background after the 5-minute TTL (CACHE_TTL_MS). Requests within TTL return immediately. Requests in the SWR window return stale data and kick off a non-blocking refresh. Requests older than SWR_WINDOW_MS block and refresh synchronously. Call `invalidateRegistryCache()` after `syncRegistryToDb()` to force a fresh load.
126. **Semantic query cache key includes tenant + SQL + params** — `getFromQueryCache(tenantId, sql, params)` uses a djb2 hash of all three. Same SQL with different tenants or params = different keys. Max 200 entries, 5-minute TTL, LRU eviction. Call `invalidateQueryCache(tenantId?)` to flush. The pipeline auto-sets the cache after each successful DB execution.
127. **Semantic rate limiter is per-tenant sliding window** — `checkSemanticRateLimit(tenantId)` defaults to 30 requests/minute per tenant. Returns `{ allowed, remaining, resetAt, retryAfterMs }`. The `/api/v1/semantic/ask` route checks this before running the pipeline and returns 429 with `Retry-After` and `X-RateLimit-Reset` headers when blocked.
128. **Semantic observability uses in-memory metrics** — `recordSemanticRequest()` accumulates per-tenant stats (p50/p95 latency, cache hit rate, token usage, error rate). View via `GET /api/v1/semantic/admin/metrics` (requires `semantic.admin` permission). Reset with `resetSemanticMetrics()` in tests. Stage 2: emit via OTLP.
129. **Sync registry before first deploy** — run `pnpm --filter @oppsera/module-semantic semantic:sync` after running migrations 0070-0073. This seeds metrics, dimensions, relations, system lenses, and eval examples. Without this, the semantic layer has no registry data and all queries return "Unknown metric" errors.
130. **Custom lenses use partial unique indexes** — `semantic_lenses` has two partial unique indexes: `uq_semantic_lenses_system_slug` (slug WHERE tenant_id IS NULL) for system lenses, and `uq_semantic_lenses_tenant_slug` (tenant_id, slug WHERE tenant_id IS NOT NULL) for custom tenant lenses. A tenant can create a lens with the same slug as a system lens — they coexist. The custom lens takes priority in GET lookups.
131. **Pipeline `vi.mock` for cache and metrics in tests** — when testing pipeline.ts behavior, always mock `../../cache/query-cache` (return null from `getFromQueryCache`) and `../../observability/metrics` (stub `recordSemanticRequest`). Without these mocks, cache state leaks between tests and causes non-deterministic failures (gotcha #58 applies here too).
132. **Narrative LLM output is direct markdown, not JSON** — the narrative system prompt instructs the LLM to respond in markdown only. `parseNarrativeResponse()` tries JSON first (backward compat), then falls through to `parseMarkdownNarrative()` which splits on `##`/`###` headings. Never instruct the narrative LLM to return JSON — it produces worse output and parsing failures.
133. **THE OPPS ERA LENS section types must match `HEADING_TO_SECTION` mapping** — the `HEADING_TO_SECTION` record in `narrative.ts` maps lowercase heading text to `NarrativeSection.type`. If the LLM uses an unmapped heading, it falls through to type `'detail'`. When adding new section types: (1) add to `NarrativeSection.type` union in `types.ts`, (2) add heading→type mapping in `HEADING_TO_SECTION`, (3) add a test in `pipeline.test.ts`.
134. **Pipeline calls LLM for 0-row results (ADVISOR MODE)** — `runPipeline()` always calls `generateNarrative()` even when `queryResult.rowCount === 0`. The system prompt's DATA-FIRST DECISION RULE handles this: "If no data exists → use industry best practices, market benchmarks, and operational heuristics." `buildEmptyResultNarrative()` is only used as a static fallback if the LLM call itself throws.
135. **Pipeline generates ADVISOR narrative on compilation errors** — when `compilePlan()` throws, the pipeline calls `generateNarrative(null, intent, message, context, ...)` to provide helpful business advice instead of returning a raw error. This means compilation failures still consume LLM tokens (2 calls: intent + narrative).
136. **Intent resolver biases toward attempting queries** — Rule 3 in `intent-resolver.ts` only sets `clarificationNeeded = true` when the LLM genuinely cannot map ANY part of the question to available metrics. Ambiguous questions get `confidence < 0.7` and a best-effort plan. General business questions get `confidence < 0.6`. This prevents the frustrating "could you clarify?" loop.
137. **`buildNarrativeSystemPrompt` is the single source of THE OPPS ERA LENS** — all narrative behavior (tone, response structure, industry translation, adaptive depth, token rules) is defined in the system prompt built by `buildNarrativeSystemPrompt()` in `narrative.ts`. When updating the lens: edit the prompt, update `HEADING_TO_SECTION` if new sections are added, and add parser tests.
138. **Narrative maxTokens is 2048, not 1024** — THE OPPS ERA LENS produces richer responses (Options + Recommendation + Quick Wins + ROI Snapshot + What to Track + Next Steps). The `maxTokens` was bumped from 1024 to 2048 in `generateNarrative()`. Intent resolution remains at 4096.
139. **Room Layout editor uses 3-layer Konva architecture** — GridLayer (cached, not redrawn per frame), ObjectLayer (filtered by layer visibility, sorted by zIndex), UI Layer (Transformer + SelectionBox). All in `apps/web/src/components/room-layouts/editor/canvas/`.
140. **Room Layout store stage ref is module-level** — `setEditorStageRef()` / `getEditorStageRef()` live outside the Zustand store to avoid serialization issues. CanvasArea registers in a useEffect, EditorShell reads for PNG export.
141. **Room Layout objects store position in feet, dimensions in pixels** — `x`/`y` are in feet (room coordinate system), `width`/`height` are in pixels. Convert with `scalePxPerFt`. Konva renders at `x * scalePxPerFt`, `y * scalePxPerFt`.
142. **Room Layout templates use SVG thumbnails** — `TemplateThumbnail` renders a lightweight SVG preview, not a full Konva mini-stage. `computeFitScale` ensures the room fits within the thumbnail dimensions.
143. **Room Layout validation is warning-based** — out-of-bounds objects and missing table numbers are warnings, not errors. Only duplicate IDs and missing required fields are errors. `validateForPublish` returns both levels.
144. **Room Layout error boundary preserves data** — `CanvasErrorBoundary` wraps only the Konva `<Stage>`. On canvas crash, Zustand state (snapshot) is preserved. "Reload Editor" button resets the error boundary without losing data.
145. **Room Layout dialogs are portal-based** — all dialogs (SaveAsTemplate, ApplyTemplate, ModeManager, VersionHistory, CreateRoom) use `createPortal(... , document.body)` with z-50, matching the POS dialog pattern.
146. **Room Layout publish always saves draft first** — `handlePublish` in `editor-content.tsx` always calls `saveDraftApi()` before `publishVersionApi()`, regardless of `isDirty` state. After autosave sets `isDirty=false`, `draftVersionId` could be null (e.g., after a prior publish). Without the forced save, publish fails with "No draft version to publish".
147. **Room Layout template creation requires dimensions** — `createTemplateSchema` requires `widthFt` and `heightFt`. The SaveAsTemplateDialog reads these from `useEditorStore`. `createRoomFromTemplateApi` is a two-step process: create blank room with template dimensions → apply template snapshot.
148. **Room Layout `applyTemplateApi` sends roomId in body** — the API route is `POST /api/v1/room-layouts/templates/:templateId/apply` with `{ roomId }` in the request body (not in the URL path). The route extracts `templateId` from the URL.
149. **Room Layout editor fetches on mount** — `editor-content.tsx` calls `fetchEditor()` in a `useEffect` on mount. The `useRoomEditor` hook returns `{ data, isLoading, error, mutate: fetchEditor }` — only one call, never duplicate hook instances.
150. **Room Layout components use `bg-surface` exclusively** — no `bg-white` or `dark:` prefixed classes in any room layout component. All backgrounds use `bg-surface` for theme-aware rendering. Hover states use opacity-based colors (`hover:bg-gray-200/50`, `hover:bg-red-500/10`). Warning banners use `bg-yellow-500/10 border-yellow-500/40`. This matches the inverted gray scale pattern (gotcha #39).
151. **Room Layout actions dropdown needs no overflow-x-auto** — the room list table container must NOT have `overflow-x-auto`, as it clips the absolutely-positioned actions dropdown menu. The table is narrow enough to not need horizontal scrolling.
152. **Seeded users don't exist in Supabase Auth** — The seed script creates users in the app's `users` table but NOT in Supabase Auth (`auth.users`). Locally with `DEV_AUTH_BYPASS=true`, the `DevAuthAdapter` bypasses Supabase entirely so it works fine. On Vercel (production), `SupabaseAuthAdapter` calls `supabase.auth.signInWithPassword()` which checks Supabase Auth — users won't exist there. Use the `/api/v1/auth/link-account` endpoint (or `supabase.auth.admin.createUser()`) to create the Supabase Auth account and update `authProviderId` in the `users` table. The `authProviderId` column MUST match the Supabase Auth user's UUID (`sub` claim in JWT).
153. **`validateToken()` must re-throw DB errors, not swallow them** — On Vercel cold starts, DB connection timeouts can occur. If `validateToken()` catches ALL errors and returns `null`, DB timeouts become false 401s, which clear tokens and bounce users to login. The catch block must ONLY return `null` for `jwt.JsonWebTokenError` and `jwt.TokenExpiredError`. All other errors (DB timeouts, network errors) must be re-thrown so middleware returns 500, not 401.
154. **`login()` must block until `/api/v1/me` succeeds** — The login function must await the `/api/v1/me` call (with retries) BEFORE returning. If it fires `fetchMe()` as fire-and-forget, `router.push('/dashboard')` executes with `user=null` and the dashboard redirects back to `/login`, creating a redirect loop. Use an inline await-based retry (not `setTimeout`).
155. **Local dev and Vercel share the same Supabase project by default** — `.env.local` points `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` at the remote Supabase instance. Running `pnpm db:seed` locally overwrites `authProviderId` values that were linked via Supabase Auth, breaking Vercel login. Either use `npx supabase start` for a fully local stack, or avoid re-seeding the remote DB.
156. **GL amounts are NUMERIC(12,2) in dollars** — NOT cents. Different from orders layer (INTEGER cents). Convert at boundaries: `Number(amount)` for GL, `Math.round(parseFloat(price) * 100)` for orders.
157. **Never write GL tables directly** — always use `postJournalEntry()`. The unique index on (tenantId, sourceModule, sourceReferenceId) enforces idempotent posting from adapters.
158. **Posted journal entries are immutable** — void + create reversal. Never UPDATE a posted entry's amounts or accounts.
159. **AP/AR post to GL via AccountingPostingApi** — singleton in `@oppsera/core/helpers/accounting-posting-api.ts`. Never import `@oppsera/module-accounting` from another module. Interface: `postEntry(ctx, input)`, `getAccountBalance(tenantId, accountId, asOfDate?)`, `getSettings(tenantId)`. Initialized in `apps/web/src/lib/accounting-bootstrap.ts`, wired in `instrumentation.ts`.
160. **Currency is locked to USD** — all tables have currency column defaulting to 'USD'. Posting engine rejects non-USD. Multi-currency is a future feature.
161. **Control accounts restrict posting by sourceModule** — `controlAccountType` on `gl_accounts` limits which modules can post. Manual entries to control accounts require `accounting.control_account.post` permission.
162. **POS adapter never blocks tenders** — if GL mapping is missing, skip the GL post and log to `gl_unmapped_events`. POS must always succeed. Handler: `handleTenderForAccounting` in `packages/modules/accounting/src/adapters/pos-posting-adapter.ts`.
163. **AP denormalizes balanceDue** — `ap_bills.balanceDue` is kept in sync by payment posting. Never compute it from allocations in hot paths — use the denormalized column.
164. **AR bridges existing ar_transactions** — the AR module reads from existing operational AR tables and posts to GL. It does NOT replace the existing POS house account flow.
165. **Retained earnings is semi-automatic** — current-year P&L is added to the stored retained earnings balance for the balance sheet. Year-end close creates the formal journal entry via `generateRetainedEarnings()`. Idempotent: checks for existing entry by sourceReferenceId.
166. **Close checklist is query-based** — checklist items are computed live (open drafts, unreconciled subledgers, unmapped events), not stored. Only the period status and notes are persisted in `accounting_close_periods`.
167. **AP bill lifecycle** — draft → posted → partial → paid → voided. Bills have `balanceDue` denormalized. `postBill` validates GL references and creates journal entry. `voidBill` creates reversal journal entry.
168. **AP payment lifecycle** — draft → posted → voided. Payments allocate to bills via `ap_payment_allocations`. `postPayment` updates bill `balanceDue` and `amountPaid`, creates GL journal entry. `allocatePayment` distributes across multiple bills.
169. **AR invoice lifecycle** — draft → posted → partial → paid → voided. Same pattern as AP bills but for receivables. Schema: `ar_invoices`, `ar_invoice_lines`, `ar_receipts`, `ar_receipt_allocations`.
170. **Financial statement layouts are tenant-configurable** — `financial_statement_layouts` table allows tenants to customize P&L and Balance Sheet section groupings. `financial_statement_layout_templates` provides system defaults. Layouts group accounts by `classificationIds[]` and/or `accountIds[]`.
171. **Balance sheet includes current-year net income in equity** — `getBalanceSheet()` computes current fiscal year revenue - expenses and adds it to totalEquity. This ensures A = L + E even before year-end close. `isBalanced` flag validates the equation.
172. **Sales tax liability report uses GL, not POS data** — `getSalesTaxLiability()` pulls from `tax_group_gl_defaults` → `gl_journal_lines`. Credits to tax payable = collected, debits = remitted. Net liability = collected - remitted.
173. **Accounting module has 28 tables total** — GL: gl_accounts, gl_classifications, gl_journal_entries, gl_journal_lines, gl_journal_number_counters, gl_account_templates, gl_classification_templates, accounting_settings, gl_unmapped_events, accounting_close_periods, financial_statement_layouts, financial_statement_layout_templates. Mappings: sub_department_gl_defaults, payment_type_gl_defaults, tax_group_gl_defaults, bank_accounts, gl_transaction_types, tenant_tender_types. AP: ap_bills, ap_bill_lines, ap_payments, ap_payment_allocations, ap_payment_terms. AR: ar_invoices, ar_invoice_lines, ar_receipts, ar_receipt_allocations. Vendor extensions: columns added to existing vendors table.
174. **POS adapter converts cents to dollars for GL** — POS events use cents (INTEGER), GL uses dollars (NUMERIC(12,2)). The adapter converts: `(amountCents / 100).toFixed(2)`. Always use `.toFixed(2)` when building GL line amounts from cents.
175. **AP control account resolution is two-tier** — `postBill` first checks `vendor.defaultAPAccountId`, then falls back to `settings.defaultAPControlAccountId`. AR uses tenant-level only (no customer-specific control accounts).
176. **Void requires zero allocations** — cannot void an AP bill with payment allocations or an AR invoice with receipt allocations. Must void the payment/receipt first. AP throws `BillHasPaymentsError`, AR throws `INVOICE_HAS_RECEIPTS`.
177. **Vendor credits are stored as negative bills** — AP vendor credits use the `ap_bills` table with negative `totalAmount`/`balanceDue`. GL posting reverses: Debit AP control, Credit expense. Applied against future bills via normal allocation.
178. **Denormalized `balanceDue` uses `.toFixed(2)` at update time** — AP/AR both compute `newBalance = (Number(totalAmount) - Number(newPaid)).toFixed(2)` inside the transaction. Prevents floating-point drift. Status derived: `balanceDue <= 0 ? 'paid' : 'partial'`.
179. **GL balance direction depends on `normal_balance`** — Assets/Expenses (debit-normal): `SUM(debit) - SUM(credit)`. Liabilities/Equity/Revenue (credit-normal): `SUM(credit) - SUM(debit)`. Always use this pattern in GL queries, never hardcode sign by account type.
180. **Automated GL postings use `forcePost: true`** — AP, AR, and POS adapters always set `forcePost: true` to bypass draft mode. Only manual journal entries respect `autoPostMode` from settings.
181. **Automated GL postings use `hasControlAccountPermission: true`** — the `accounting-bootstrap.ts` wiring passes this option to bypass control account permission checks for system-initiated postings.
182. **Reconciliation tolerance is $0.01** — `reconcileSubledger` considers `Math.abs(difference) < 0.01` as reconciled. Differences >= $0.01 fail the close checklist.
183. **POS adapter creates synthetic RequestContext** — event consumers that post to GL create a synthetic context with `user.id = 'system'` and `requestId = 'pos-gl-{tenderId}'`. This satisfies the `auditLog` requirement without a real user session.
184. **GL `sourceReferenceId` format by module** — POS: tender ID, AP: bill.id or payment.id, AR: invoice.id or receipt.id, retained earnings: `retained-earnings-{startDate}-{endDate}`. The unique partial index prevents double-posting.
185. **Accounting bootstrap is lazy-imported** — `accounting-bootstrap.ts` uses dynamic `await import()` for the accounting module to prevent module resolution at build time. Called once from `instrumentation.ts`.
186. **GL rounding line auto-appended** — if `sum(debits) - sum(credits)` is within `roundingToleranceCents` (default 5), the posting engine appends a line to `defaultRoundingAccountId`. Beyond tolerance throws `UnbalancedJournalError`. No rounding account configured + any imbalance also throws.
187. **AP `lineType` drives GL posting** — `expense` debits expense account, `inventory` debits inventory asset, `asset` debits fixed asset, `freight` debits freight expense. All line types credit AP control. When building AP bills, choose the correct `lineType` for proper reporting (asset purchases, landed cost allocation, etc.).
188. **Mapping coverage diagnostic** — `getMappingCoverage()` reports how many sub-departments, payment types, and tax groups have GL mappings vs don't. Powers the accounting dashboard "mapping coverage" card. Always check coverage before going live with GL posting.
189. **Legacy bridge adapter is batch + idempotent** — `migrateLegacyJournalEntries()` reads `payment_journal_entries` (old JSONB-based GL) and creates proper `gl_journal_entries`. Processes in batches of 100. Idempotent via `sourceModule: 'pos_legacy'` + `sourceReferenceId`.
190. **CONVENTIONS.md has full architecture docs for accounting** — See §66 (Accounting/GL), §67 (AP), §68 (AR), §69 (Subledger Reconciliation), §70 (Cross-Module Financial Posting). Always read these before modifying any financial module.
191. **Chat history sidebar is inline flexbox, not a portal** — `ChatHistorySidebar` is a peer of the chat column inside a `flex h-[calc(100vh-64px)]` container. Desktop: `hidden lg:flex w-80 shrink-0 border-l`. Mobile: `fixed inset-0 z-30 lg:hidden` overlay with backdrop. Do NOT use `createPortal` for the sidebar — it scrolls independently alongside the chat.
192. **`useSessionHistory` is the shared session list hook** — both `ChatHistorySidebar` and `/insights/history` page use `useSessionHistory({ limit: 20 })`. It provides `sessions`, `loadMore`, `refresh`, `hasMore`, `isLoading`, `isLoadingMore`. Call `refresh()` after sending a message (with delay — eval capture is async). Never duplicate session fetching logic.
193. **Sidebar refresh uses `refreshKey` prop pattern** — parent increments a counter after `sendMessage`, child detects via `useRefreshOnChange(key, refresh)` hook and triggers a 1-second delayed refresh. The delay accounts for async eval turn capture (fire-and-forget in the pipeline).
194. **`initFromSession()` maps DB turns to ChatMessages** — `useSemanticChat.initFromSession(dbSessionId, turns)` resets session state and maps each `LoadedTurn` to user+assistant message pairs via `evalTurnToChatMessages()`. The `LoadedTurn` interface mirrors the API response shape from `GET /api/v1/semantic/sessions/[sessionId]`.
195. **`buildQueryString()` is the shared URL param helper** — `apps/web/src/lib/query-string.ts` exports `buildQueryString(filters)` which skips undefined/null/empty values, converts booleans to `'true'`, and returns `?key=val` or `''`. All frontend hooks (`use-ap.ts`, `use-ar.ts`, `use-journals.ts`, `use-mappings.ts`) use this instead of inline `URLSearchParams`. Never duplicate query string logic.
196. **Debug and link-account endpoints return 410 Gone** — `/api/v1/auth/debug` and `/api/v1/auth/link-account` are disabled in production. They return `{ error: { code: 'GONE', message: '...' } }` with status 410. Use Supabase admin CLI for account linking instead.
197. **AR status errors are 409, not 400** — `InvoiceStatusError` and `ReceiptStatusError` both return HTTP 409 (Conflict) to match AP conventions (`BillStatusError`). Status conflicts are resource state issues, not bad user input.
198. **AR `createInvoice` validates customer exists** — before creating an invoice, the command queries the `customers` table to verify the `customerId` belongs to the tenant. Throws `NotFoundError('Customer', customerId)` if missing. This matches AP's vendor validation pattern.
199. **AR `postReceipt` throws on missing invoice** — when a receipt allocation references a non-existent invoice, `postReceipt` throws `AppError('INVOICE_NOT_FOUND', ...)` with 400 instead of silently skipping. Ensures data integrity during posting.
200. **Accounts-content uses extracted sub-components** — `AccountFilterBar` (search, status tabs, view mode toggle) and `AccountTreeView` (collapsible type sections, tree/flat rendering) are in `apps/web/src/components/accounting/`. The main `accounts-content.tsx` orchestrates state and passes props.
201. **Vitest coverage uses v8 provider** — all 16 vitest configs include `coverage: { provider: 'v8', reporter: ['text', 'json-summary', 'lcov'] }`. Run `pnpm test:coverage` for the full report via turbo. The `vitest.workspace.ts` at root defines the workspace for parallel coverage. `@vitest/coverage-v8` is installed at root and hoisted.
202. **CI runs lint → type-check → test → build** — `.github/workflows/lint-typecheck.yml` runs on push/PR to main. Uses pnpm 9, Node 20, with pnpm store caching. Build step uses placeholder Supabase env vars.
203. **GL mapping query adapts to catalog hierarchy depth** — `getSubDepartmentMappings` uses `COALESCE(parent_id, id)` to find the mappable entity: for 3-level hierarchies (Dept → SubDept → Category → Items) it maps at sub-department level; for 2-level hierarchies (Dept → Items) it maps at department level. The frontend auto-detects flat vs grouped mode. Same logic applies to coverage API and items drill-down. The `sub_department_gl_defaults.sub_department_id` column stores whatever category ID the mappable entity is — the naming is historical.
204. **`order_lines` now have `sub_department_id` and `tax_group_id`** — migration 0084 adds both nullable columns. Populated at `addLineItem` time from `posItem.subDepartmentId` (resolved via `COALESCE(parent_id, id)` on catalog categories) and `posItem.taxInfo.taxGroups[0]?.id`. These are snapshots — if the catalog hierarchy changes later, existing order lines retain the original mapping.
205. **`tender.recorded.v1` event includes `lines[]` array** — each line has `catalogItemId`, `catalogItemName`, `subDepartmentId`, `qty`, `extendedPriceCents`, `taxGroupId`, `taxAmountCents`, `costCents`, and `packageComponents`. Also includes `paymentMethod` alias for backward compat with adapters that read that field name instead of `tenderType`.
206. **POS adapter splits package revenue by component subdepartment** — when a line has enriched `packageComponents` (with `allocatedRevenueCents != null`), the adapter groups revenue by each component's `subDepartmentId` instead of the package's line-level subdepartment. Falls back to line-level for legacy packages without allocations.
207. **`expandPackageForGL` is a pure helper** — lives in `packages/modules/accounting/src/helpers/catalog-gl-resolution.ts`. Takes a line and returns `GLRevenueSplit[]` — one entry per component for packages, single entry for regular items. No DB access, no side effects.
208. **POS adapter uses `tenderType ?? paymentMethod` for field name compat** — the event emits `tenderType` (the correct field name), and also includes `paymentMethod` as an alias. The adapter resolves with `data.tenderType ?? data.paymentMethod ?? 'unknown'` for backward compatibility with older events.
209. **F&B module has full backend + frontend** — `packages/modules/fnb/` contains 103 commands, 63 queries. ~100 API routes under `/api/v1/fnb/`, React hooks (`use-fnb-floor`, `use-fnb-tab`, `use-fnb-kitchen`, `use-fnb-menu`, `use-fnb-payments`, `use-fnb-manager`, `use-fnb-close-batch`, `use-fnb-settings`, `use-fnb-reports`, `use-fnb-realtime`, `use-fnb-locks`, `use-fnb-sections`), Zustand store (`fnb-pos-store`), 60+ components across floor, tab, menu, kitchen, split, payment, manager, host, close-batch directories. Standalone pages: `/kds`, `/expo`, `/host`, `/fnb-manager`, `/close-batch`.
210. **F&B tables sync from room-layouts snapshots** — `syncTablesFromFloorPlan` in `commands/sync-tables-from-floor-plan.ts` extracts table objects from a published `CanvasSnapshot` via `extractTablesFromSnapshot()`. It creates/updates/deactivates `fnb_tables` rows to match the floor plan. Tables are linked via `roomId` + `floorPlanObjectId`.
211. **F&B read models use `rm_fnb_` prefix** — all 7 reporting tables: `rm_fnb_server_performance`, `rm_fnb_table_turns`, `rm_fnb_kitchen_performance`, `rm_fnb_daypart_sales`, `rm_fnb_menu_mix`, `rm_fnb_discount_comp_analysis`, `rm_fnb_hourly_sales`. Same upsert-by-natural-key pattern as core `rm_` tables.
212. **F&B consumers expect enriched data, not raw events** — consumer functions like `handleFnbTabClosed` take typed input objects (`FnbTabClosedConsumerData`) not raw event payloads. The wiring layer (API/web app) is responsible for enriching event data before calling consumers.
213. **F&B permissions are separate from core RBAC** — 28 F&B-specific permissions (`pos_fnb.*`) across 10 categories (floor_plan, tabs, kds, payments, tips, menu, close_batch, reports, settings, gl). Role defaults defined in `FNB_ROLE_DEFAULTS` for 6 system roles. These complement, not replace, core system permissions.
214. **F&B close batch posts GL via `buildBatchJournalLines`** — the helper in `helpers/build-batch-journal-lines.ts` constructs double-entry journal lines from Z-report data: revenue by sub-department, tax collected, tender by type, tip payable. Uses the same GL mapping resolution pattern as the POS adapter.
215. **F&B hourly sales uses INTEGER cents, not NUMERIC dollars** — `rm_fnb_hourly_sales.salesCents` stores as INTEGER (like orders), unlike other `rm_fnb_*` tables that use NUMERIC(19,4) dollars. This matches the granularity needed for hourly breakdowns.
216. **F&B offline queue is typed but not yet wired** — `helpers/offline-queue-types.ts` defines the offline operation queue (command buffering, conflict resolution, replay) as TypeScript types. The actual WebSocket/offline infrastructure is future work.
217. **F&B UX screen map is a typed spec, not UI code** — `helpers/ux-screen-map.ts` encodes screen definitions, interaction flows, wireframes, and component reuse maps as TypeScript constants. These serve as contracts/specs for frontend implementation, not actual React components.
218. **F&B entitlement key is `pos_fnb`, not `pos_restaurant`** — the registry, settings UI, business types, onboarding, seed, and all 100+ API routes use `pos_fnb`. Do not use `pos_restaurant` anywhere — it was renamed. The sidebar layout also gates F&B nav items on `pos_fnb`.
219. **F&B POS uses Zustand internal routing, not URL routes** — `fnb-pos-content.tsx` uses `useFnbPosStore().currentScreen` (floor|tab|payment|split) for instant screen switching. No route transitions — preserves dual-mount architecture. KDS, Expo, Host, Manager, Close Batch are separate Next.js pages.
220. **F&B standalone pages require `'use client'`** — all `page.tsx` files under `/(dashboard)/` that use `next/dynamic` with `ssr: false` MUST have `'use client'` directive. Next.js 15 enforces this. Affected pages: `/kds`, `/kds/[stationId]`, `/expo`, `/host`, `/fnb-manager`, `/close-batch`.
221. **F&B floor plan requires migration + table sync** — after running migration `0082_fnb_table_management.sql`, the `fnb_tables` table is empty. Users must click "Sync Tables" in the floor view (or call `POST /api/v1/fnb/tables/sync`) to extract table objects from the published room layout snapshot into `fnb_tables`. Without sync, rooms appear but show "No tables."
222. **F&B design tokens are CSS custom properties** — all F&B colors, spacing, and touch targets defined in `apps/web/src/styles/fnb-design-tokens.css`. KDS large display overrides at `@media (min-width: 1280px)`, handheld at `@media (max-width: 639px)`. Imported in `pos/layout.tsx`.
223. **F&B components use `var(--fnb-*)` tokens exclusively** — never use Tailwind color classes (e.g., `text-green-500`) in F&B components. Always use inline styles with CSS custom properties: `style={{ color: 'var(--fnb-status-available)' }}`. This allows theming and consistent status colors.
224. **Profit centers = `terminal_locations` table** — the DB table is named `terminal_locations` (historical), but the domain concept is "Profit Center." The `title` column maps to `name` in the `ProfitCenter` type. All queries, commands, and API routes use the "profit center" naming. Schema: `packages/db/src/schema/terminals.ts`.
225. **Location hierarchy: Tenant → Site → Venue → Profit Center → Terminal** — `locations` table has `parentLocationId` (self-FK) and `locationType` ('site' | 'venue'). Sites have no parent. Venues must have a parent site. Profit centers attach to the most specific location. Check constraints enforce this at the DB level.
226. **Terminal session is localStorage-scoped** — `TerminalSessionProvider` stores `TerminalSession` in `localStorage('oppsera:terminal-session')`. Provides React Context with `session`, `setSession()`, `clearSession()`, `isLoading`. All POS operations depend on this context for `terminalId`, `profitCenterId`, and `locationId`.
227. **`ensureDefaultProfitCenter` is idempotent via `code='DEFAULT'`** — matches on `code` (not `title`) for stability. Returns `{ id, created: boolean }`. When found, returns no events. When created, emits `platform.profit_center.created.v1`. Used by Simple mode to auto-create a default profit center before adding terminals.
228. **Profit Centers Settings uses Simple/Advanced mode** — persisted in `localStorage('profitCenters_mode')`. Simple mode: 2-column grid (Locations + Terminals), hides profit centers panel, auto-creates Default PC on terminal add via `ensureDefaultProfitCenter`. Advanced mode: 3-column grid (Locations + Profit Centers + Terminals). Default: `'advanced'`.
229. **Site-level guardrail prevents accidental site-level profit centers** — `createProfitCenter` checks if the `locationId` is a site with child venues. If so, rejects with 422 unless `allowSiteLevel: true` is passed. Frontend shows yellow warning banner + confirmation checkbox in `ProfitCenterFormModal` when `requireSiteLevelConfirm={true}`.
230. **Admin tenant management uses `buildAdminCtx()`** — `apps/admin/src/lib/admin-context.ts` creates a synthetic `RequestContext` with `user.id = 'admin:{adminId}'` and `isPlatformAdmin: true`. Used when admin routes call core commands (createProfitCenter, createTerminal, etc.) that require `RequestContext`.
231. **`OrdersWriteApi` is a cross-module singleton** — `packages/core/src/helpers/orders-write-api.ts` defines the interface; `apps/web/src/lib/orders-bootstrap.ts` wires it via `setOrdersWriteApi()`. Allows PMS and other modules to create/modify orders without importing `@oppsera/module-orders`. Same pattern as `AccountingPostingApi` and `CatalogReadApi`.
232. **RLS `current_setting()` must be subquery-wrapped** — migration 0094 rewrites all RLS policies to use `(select current_setting('app.current_tenant_id', true))` instead of bare `current_setting(...)`. The subquery forces PostgreSQL InitPlan evaluation (once per query), not per-row re-evaluation. Always use the subquery form in new policies.
233. **Terminal selection auto-selects single options** — `useTerminalSelection` auto-selects when only one site, one venue, one profit center, or one terminal exists. Reduces clicks during onboarding. The selection screen also allows skipping if no profit centers are configured yet.
234. **Profit center API input `name` maps to DB column `title`** — the `terminalLocations` table uses `title`, but the public API and TypeScript types use `name`. All query mappings convert: `title AS name` in SQL, `name: row.title` in Drizzle. Never expose `title` in API responses.
235. **Entitlements are three-mode, not binary** — `accessMode` column: `'off'` | `'view'` | `'full'`. Use `requireEntitlementWrite(moduleKey)` for write endpoints. `isModuleEnabled()` returns `mode !== 'off'` for backward compat. Old `isEnabled` boolean is deprecated but preserved for migration.
236. **`ModuleViewOnlyError` is 403 with code `MODULE_VIEW_ONLY`** — distinct from `ModuleNotEnabledError` (`MODULE_NOT_ENABLED`). Both return 403 but frontend should show different messages ("view-only" vs "not enabled").
237. **Module dependencies block mode changes** — `validateModeChange()` returns `allowed: false` if enabling a module whose dependencies are `off`, or disabling a module that has active dependents. No auto-cascade — admin must disable dependents first.
238. **High/critical risk modules require a reason to disable** — `riskLevel === 'high' || 'critical'` sets `reasonRequired: true` in `DependencyCheckResult`. Admin UI must collect `changeReason` before submitting.
239. **`withMiddleware` `writeAccess` option** — set `{ writeAccess: true }` on POST/PUT/PATCH/DELETE routes to block `view`-mode tenants. GET routes use default `requireEntitlement` which allows `view` through.
240. **F&B Floor + Tab views are CSS-mounted** — `fnb-pos-content.tsx` mounts both `FnbFloorView` and `FnbTabView` inside divs toggled with `hidden` class. Payment and Split views mount on-demand. This prevents data loss and expensive re-fetches when switching between floor and tab screens.
241. **Platform admin tables have no RLS** — `platform_admins`, `platform_admin_roles`, `platform_admin_role_permissions`, `platform_admin_role_assignments`, `platform_admin_audit_log` are NOT tenant-scoped and have NO RLS policies. They are accessed via admin routes only.
242. **Admin audit log is separate from tenant audit log** — `platform_admin_audit_log` captures admin portal actions; tenant `audit_log` captures tenant-scoped operations. Never mix them. Admin audit stores before/after JSONB snapshots.
243. **Entitlement change log is append-only** — `entitlement_change_log` tracks all mode changes. Never UPDATE or DELETE rows. Use for auditing and compliance.
244. **Order `metadata` is opaque JSONB** — `Record<string, unknown>` validated by Zod. Use for cross-module context (PMS reservation ID, etc.). Never query by metadata fields — add dedicated columns if you need to filter.
245. **Outbox worker uses `IN` not `ANY`** — migration from `ANY(${publishedIds})` to `IN (${idList})` with `sql.join()` for compatibility. Always use `sql.join()` with `sql` template literals for dynamic IN clauses in Drizzle.
246. **`seeds` create site→venue hierarchy** — seed now creates 1 site + 2 venues (not flat locations). All location-dependent seed data (profit centers, terminals) uses venue IDs, not site ID.
247. **`enableLegacyGlPosting` gates dual GL posting** — `accounting_settings.enable_legacy_gl_posting` (default `true`) controls whether `recordTender()` writes to `payment_journal_entries` (legacy JSONB-based GL). When `false`, only the proper `gl_journal_entries` path via the POS adapter is active. Toggle per tenant after validating GL reconciliation.
248. **POS adapter uses proportional + remainder allocation** — non-final tenders post `(tenderAmount / orderTotal)` share of revenue/tax/discounts/service charges. Final tender (`isFullyPaid = true`) posts `orderTotal - previouslyPosted` to prevent rounding drift. Single tenders are treated as final. Tips are per-tender (no proportional split).
249. **GL adapters NEVER throw** — all 9 adapters (`pos`, `void`, `return`, `fnb`, `voucher` x3, `membership`, `chargeback` x2) wrap their entire body in try/catch. GL failures log to console.error but never propagate — business operations (POS, vouchers, chargebacks) must always succeed regardless of GL state.
250. **GL journal line dimensions are nullable** — `profitCenterId`, `subDepartmentId`, `terminalId`, `channel` on `gl_journal_lines` are all nullable TEXT. POS adapter sets `channel = 'pos'`, F&B adapter sets `channel = 'fnb'`. Manual journal entries have no dimensions. Queries filter by dimension only when the filter value is provided.
251. **Void adapter reverses per-tender, not per-order** — `handleOrderVoidForAccounting` queries `gl_journal_entries` for each tender of the voided order and calls `voidJournalEntry()` per entry. Already-voided entries are skipped (idempotent). This handles multi-tender orders correctly.
252. **Return adapter uses `returnsAccountId` from sub-department mapping** — `handleOrderReturnForAccounting` debits `returnsAccountId` (contra-revenue) and credits the payment account. Falls back to `logUnmappedEvent` if no returns account is configured for the sub-department.
253. **F&B adapter resolves abstract categories to GL accounts** — `handleFnbGlPostingForAccounting` maps category strings (`sales_revenue`, `tax_payable`, `tips_payable`, `discount`, `comp_expense`, `cash_over_short`) from `buildBatchJournalLines()` output to GL account IDs via `fnb_gl_account_mappings` table. Falls back to `accounting_settings` defaults.
254. **Voucher GL uses lifecycle-specific sourceReferenceId** — purchase: `purchase-{voucherId}`, redeem: `redeem-{voucherId}-{tenderId}`, expire: `expire-{voucherId}`. This allows multiple redemptions of the same voucher to each get their own GL entry.
255. **Chargeback GL uses payment type mapping** — `feeExpenseAccountId` for expense side, `depositAccountId` for cash/bank side. Falls back to `defaultUndepositedFundsAccountId` from settings. Won = reversal of received. Lost with fee > 0 = fee entry. Lost with fee = 0 = no additional GL entry.
256. **Chargeback lifecycle: received → under_review → won/lost** — `resolveChargeback` validates status is `received` or `under_review` (409 if already resolved). Fee can be overridden on resolution. GL entries use sourceModule `'chargeback'` with patterns: `received-{id}`, `won-{id}`, `lost-fee-{id}`.
257. **Close checklist warns on legacy GL** — when `enableLegacyGlPosting = true`, the close checklist includes a warning item. Also validates tips payable and service charge accounts are configured, and all sub-departments have discount/returns mappings.
258. **COA templates include Tips Payable (2160) and Service Charge Revenue (4500)** — migration 0102 inserts these into `gl_account_templates` for all 4 business types. `bootstrapTenantCoa` auto-wires them to `defaultTipsPayableAccountId` and `defaultServiceChargeRevenueAccountId` in settings. Existing tenants: run `tools/scripts/backfill-accounting-accounts.ts`.
259. **Posting matrix test validates debits = credits for all adapters** — `packages/modules/accounting/src/__tests__/posting-matrix.test.ts` validates balance across voucher (purchase/redeem/expire), membership billing, chargeback (received/won/lost), and cents-to-dollars conversion accuracy. Also validates source reference ID uniqueness and never-throw guarantee.
260. **Next.js 15 `config.watchOptions` is read-only — never mutate directly** — Next.js 15.5+ freezes the `watchOptions` object passed to the webpack callback. Assigning `config.watchOptions.ignored = [...]` throws `TypeError: Cannot assign to read only property 'ignored'`. Fix: create a new object via spread: `config.watchOptions = { ...prev, ignored: kept }`. Additionally, Next.js sets `ignored` to a RegExp internally — when merging, filter to keep only string patterns (`typeof p === 'string'`), or webpack rejects the array with `watchOptions.ignored[0] should be a non-empty string`. See `apps/web/next.config.ts` lines 43-58.
261. **Drawer sessions are server-persisted** — `drawer_sessions` + `drawer_session_events` tables in `packages/db/src/schema/drawer-sessions.ts`. `useShift` hook calls `/api/v1/drawer-sessions/` API with localStorage fallback for offline. One drawer per terminal per business date (UNIQUE constraint). Events are append-only (paid_in, paid_out, cash_drop, drawer_open, no_sale).
262. **Retail close batch lifecycle: open → in_progress → reconciled → posted → locked** — `retail_close_batches` table. `startRetailClose` aggregates sales from orders/tenders for the terminal's business date. `reconcileRetailClose` computes over/short from cash count. `postRetailClose` posts GL (Dr Cash Over/Short if variance). `lockRetailClose` freezes the batch. Cannot close without closing the drawer session first.
263. **Comp vs Discount GL separation** — Comps hit `Comp Expense` account (expense); discounts hit `Discount Account` (contra-revenue). Both reduce order total but post to different GL accounts. Comp requires manager PIN. Sub-department-specific comp accounts via `comp_account_id` on `sub_department_gl_defaults`.
264. **Returns use `isContraAccount` flag on GL accounts** — `gl_accounts.is_contra_account` marks revenue accounts as contra (e.g., Returns & Allowances). P&L shows contra accounts as deductions under parent type. Return adapter uses `returnsAccountId` from sub-dept mapping → falls back to `settings.defaultReturnsAccountId`.
265. **Card settlement lifecycle: pending → matched → posted → disputed** — `payment_settlements` + `payment_settlement_lines` tables. CSV import + manual entry. Auto-matcher links settlement lines to tenders by date range + amount. GL posting: Dr Bank + Dr Processing Fee / Cr Undeposited Funds. Idempotent via `(tenant, processor, batch_id)` unique.
266. **Tip payout GL: cash = Dr Tips Payable / Cr Cash; payroll = Dr Tips Payable / Cr Payroll Clearing** — `tip_payouts` table. Balance = SUM(tenders.tipAmount) - SUM(payouts.amount) per employee. Cannot payout more than balance. Voided payout creates GL reversal.
267. **COGS posting mode is tri-state** — `accounting_settings.cogs_posting_mode`: `'disabled'` (no COGS), `'perpetual'` (per-tender), `'periodic'` (period-end calculation). POS adapter checks mode before posting COGS lines. `periodic_cogs_calculations` table stores COGS = Beginning Inventory + Purchases − Ending Inventory.
268. **Tax rates have jurisdiction dimensions** — `jurisdiction_code`, `authority_name`, `authority_type` (state/county/city/district), `tax_type`, `filing_frequency` on `tax_rates`. Tax remittance report groups by jurisdiction. Backward compatible — existing rates without jurisdiction still work.
269. **F&B batch category keys are typed enum** — `FnbBatchCategoryKey` in `@oppsera/shared/src/types/fnb-gl.ts`. Category version tracked on `fnb_close_batch_summaries`. Coverage query returns mapped/unmapped per category. Critical unmapped categories block posting.
270. **Event dead letters persist to DB** — `event_dead_letters` table. After max retries (3), events land here instead of being silently dropped. Admin UI at `/events` in admin app. Retry re-publishes through full pipeline. Idempotency prevents double-processing.
271. **Deposit slips aggregate cash from all closes** — `deposit_slips` table links to retail close batch IDs + F&B close batch ID. GL: Dr Bank / Cr Cash On Hand. Cannot finalize deposit before all terminals + F&B closed. Status: pending → deposited → reconciled.
272. **Close checklist has 18+ items** — items #11-#18 added by UXOPS-12: drawer sessions closed, retail/F&B batches posted, tip balances zero, deposit slips reconciled, no dead letter events, card settlements matched, COGS posted (if periodic). All computed live from DB queries.
273. **Operations hooks use `useAuthContext` from `@/components/auth-provider`** — NOT from `@/hooks/use-auth`. The auth context providing `user`, `locations`, etc. lives in the auth provider component, not a standalone hook.
274. **Sidebar navigation lives in `apps/web/src/lib/navigation.ts`** — extracted from layout. Array of `{ name, href, icon, group }` objects. CommandPalette (`Ctrl+K`) also reads from this config. Operations link uses `Monitor` icon from lucide-react.
275. **UXOPS posting matrix test validates GL balance for all UXOPS scenarios** — `packages/modules/accounting/src/__tests__/uxops-posting-matrix.test.ts` validates retail close over/short, comp, void-line, return, settlement, tip payout (cash/payroll/void), periodic COGS, deposit slip, plus end-to-end lifecycle flows and idempotency replay tests.
276. **Bank reconciliation difference must be $0.00 to complete** — `completeBankReconciliation` validates `Math.abs(difference) < 0.01` before marking status as `completed`. Difference = (beginningBalance + clearedTotal) − statementEndingBalance. Bank adjustments (fees, interest) are always auto-cleared.
277. **Bank reconciliation auto-populates GL lines** — `startBankReconciliation` queries `gl_journal_lines` for unreconciled entries hitting the bank's GL account, excluding lines already cleared in prior completed reconciliations. Items populated as `item_type = 'gl_entry'`.
278. **Reconciliation waterfall amounts are in cents** — `getReconciliationWaterfall` returns all amounts in cents (INTEGER) matching the orders/tenders layer. Frontend converts with `formatCents()`. Variance at each stage highlights mismatches between expected and actual amounts.
279. **Recurring journal templates are draft-only until generated** — `recurring_journal_templates` store the pattern; `generateFromTemplate` creates actual `gl_journal_entries`. Templates have `nextRunDate` + `frequencyType` (monthly/quarterly/annual). Generated entries get `sourceModule = 'recurring'` + `sourceReferenceId = template-{id}-{date}`.
280. **V1 POS blocks tenders when offline** — `TenderDialog.handleSubmit()` checks `navigator.onLine` first. If offline, shows toast error and returns early. No offline queue in V1 — read-only mode only.
281. **Audit coverage diagnostic compares counts** — `getAuditCoverage(tenantId, dateRange)` compares financial transaction counts (GL entries, tenders, AP bills, AR invoices, orders) against audit log entry counts per category. Mismatches = gaps. Surfaced on accounting dashboard and at `/accounting/audit`.
282. **ReconciliationReadApi is a 25-method cross-module singleton** — `packages/core/src/helpers/reconciliation-read-api.ts` defines the interface; `apps/web/src/lib/reconciliation-bootstrap.ts` wires it via `initializeReconciliationReadApi()`, called from `instrumentation.ts`. All accounting queries that need data from orders, tenders, settlements, tips, deposits, inventory, or F&B tables MUST use `getReconciliationReadApi()` — never import those tables directly. Implementations live in each owning module's `reconciliation/index.ts`.
283. **Accounting queries MUST NOT import operational tables** — after the ReconciliationReadApi refactor, `packages/modules/accounting/src/queries/` should have ZERO imports of `orders`, `tenders`, `drawer_sessions`, `retail_close_batches`, `comp_events`, `payment_settlements`, `tip_payouts`, `deposit_slips`, `fnb_close_batches`, `inventory_movements`, `receiving_receipts`, `terminals`, or `users` from `@oppsera/db`. All cross-module reads go through `getReconciliationReadApi()`.
284. **ReconciliationReadApi uses Promise.all for parallelism** — accounting queries that previously ran sequential SQL blocks now use `Promise.all([api.method1(), api.method2(), withTenant(tenantId, localQueries)])` to run API calls and local queries concurrently. This improves latency by 2-4x on the heaviest dashboard queries.
285. **POS adapter uses fallback cascade, never drops revenue** — when a sub-department has no GL mapping, revenue posts to `defaultUncategorizedRevenueAccountId` (account 49900). When a payment type has no mapping, the debit posts to `defaultUndepositedFundsAccountId`. When a tax group has no mapping, tax posts to `defaultSalesTaxPayableAccountId`. Tips and service charges without dedicated accounts fall back to uncategorized revenue. When no line detail exists, the full tender amount posts to uncategorized revenue. Unmapped events are ALWAYS logged to `gl_unmapped_events` regardless of whether a fallback was used — preserving the "resolve later" workflow. The only scenario where posting is skipped entirely is when no fallback accounts are configured in settings (all defaults null) AND no specific mappings exist. Migration 0135 adds the `default_uncategorized_revenue_account_id` column + seeds account 49900 templates. Run `npx tsx tools/scripts/backfill-uncategorized-revenue.ts` for existing tenants.
286. **Reporting consumers must convert cents to dollars** — event payloads from `order.placed.v1`, `order.voided.v1`, and `tender.recorded.v1` contain cent amounts (INTEGER). Read model columns (`rm_daily_sales`, `rm_item_sales`) are NUMERIC(19,4) dollars. Consumers MUST divide by 100 at the boundary: `totalCents / 100` before upserting. Without this, dashboard/report values are 100x too large.
287. **Dashboard metrics use 3-tier fallback** — `getDashboardMetrics` prefers CQRS read models, falls back to operational tables with today's business date filter, then falls back to all-time orders. Labels dynamically update: "Total Sales Today" vs "Total Sales" based on data source. This handles seed data with NULL business_date or dates from other days.
288. **Transaction types use dual-table registry** — `gl_transaction_types` holds the global registry (system types with `tenant_id IS NULL` + tenant-custom types). `tenant_tender_types` holds custom payment method details (category, posting mode, GL accounts, reporting bucket). System types are seeded in migration 0144 — never INSERT into `gl_transaction_types` with `tenant_id IS NULL` from application code.
289. **Custom tender type codes must not conflict with system types** — `createTenantTenderType` validates the new code doesn't match any existing `gl_transaction_types` code (case-insensitive). Codes are `lowercase_snake_case` only. The command creates records in BOTH `tenant_tender_types` AND `gl_transaction_types` (tenant-scoped) atomically.
290. **Tender posting modes: clearing vs direct_bank vs non_cash** — `clearing`: Dr Clearing Account / Cr Revenue (card processors). `direct_bank`: Dr Bank Account / Cr Revenue (cash, checks). `non_cash`: Dr Expense Account / Cr Revenue (comps, vouchers). The `CreateTenderTypeDialog` conditionally shows different GL account pickers per mode.
291. **Onboarding auto-detection uses parallel HEAD/GET requests** — `useOnboardingStatus` fires ~15 parallel API calls with 5s timeout each to check if data exists. Uses `hasRecords()` helper that returns boolean. Cached in sessionStorage with stale-while-revalidate pattern. Never block page render on these checks.
292. **Onboarding state is localStorage + sessionStorage** — `skippedPhases` and `manuallyCompleted` steps persist in `localStorage('oppsera_onboarding_*')`. API completion cache uses `sessionStorage('oppsera_onboarding_cache')`. Completion timestamp in `localStorage('oppsera_onboarding_completed_at')`. The `SetupStatusBanner` on dashboard reads these with zero API calls.
293. **F&B floor hook uses module-level snapshot cache** — `useFnbFloor` stores snapshots in a module-level Map (outside React lifecycle) with 30-min TTL. This survives React Query garbage collection for instant cold starts via `initialData`. Polling interval is 20 minutes (floor plans rarely change during shift). `staleTime: 5min`, `gcTime: 30min`.
294. **F&B menu hook deduplicates in-flight fetches** — `useFnbMenu` uses a module-level `_menuFetchPromise` to share a single API call across concurrent hook instances. 5-minute cache TTL with automatic background refresh. Auto-selects first department on cached data via `initialDeptSetRef`.
295. **AccountPicker uses semantic grouping for suggestions** — the suggestion engine maps department/sub-department names to GL accounts via shared naming heuristics (e.g., "Sandwiches" → "Food Sales" via the `SEMANTIC_GROUPS` map). Hint-based paths (REVENUE_HINTS, COGS_HINTS, etc.) provide role-specific suggestions. Fuzzy matching uses token overlap scoring with penalty for generic accounts ("Other Revenue", "Miscellaneous").
296. **Guest Pay tokens are 256-bit base64url** — `guest_pay_sessions.token` is crypto-random, unguessable. Session lifecycle: `active` → `paid` | `expired` | `invalidated` | `superseded`. Tip settings are JSONB-snapshotted at session creation time so changes don't affect in-flight sessions.
297. **Member portal is a separate Next.js app** — `apps/member-portal/` runs independently with its own auth (`withPortalAuth()`), JWT signing (`createPortalToken()`), and multi-tenant discovery via `[tenantSlug]/` dynamic routes. It does NOT share auth with the main web app — portal tokens are a separate token type.
298. **GL remap is retroactive** — `remapGlForTender` voids the original GL journal entry and posts a new one with corrected account mappings. Idempotent via `sourceReferenceId`. `tryAutoRemap` runs automatically when `accounting_settings.enable_auto_remap = true` and a mapping is saved. Preview before executing: `POST /api/v1/accounting/unmapped-events/remap/preview`.
299. **Admin impersonation has action counting** — `admin_impersonation_sessions.action_count` increments on every API call during impersonation. Sessions auto-expire. All actions are audit-logged with `impersonation_session_id`. End via `POST /api/v1/auth/impersonate/end`.
300. **Admin role uses wildcard permissions** — admin role seed has `permissions: ['*']` (same as Owner). The only difference is admin CAN be location-scoped via `role_assignments.location_id`, while Owner is always tenant-wide. Don't enumerate individual permissions for admin — use the wildcard.
301. **Dead letter routes MUST use DB persistence** — `/api/v1/admin/events/dlq` routes read from the `event_dead_letters` table, NOT in-memory queues. In-memory state is lost on Vercel cold starts. Always use `dead-letter-service.ts` methods for DLQ operations.
302. **COA merge reassigns journal lines** — `mergeGlAccounts` moves all `gl_journal_lines` from the source account to the target account, then deactivates the source. Both accounts must have the same `normalBalance` and `accountType`. Cannot merge into a control account.
303. **COA CSV import validates before creating** — `importCoaFromCsv` parses the CSV, validates all rows (account number format, type, classification, parent references), reports errors per row, then creates accounts atomically. Invalid rows don't block valid ones — partial imports are supported.
304. **ReconciliationReadApi has 61 methods** — expanded from 25 to 61 to support GL remap, settlements, and enhanced reconciliation. New methods include `getTendersForRemapping`, `getPaymentsForRemapping`, `getTransactionsWithGlStatus`. Always check existing methods before adding new ones.
305. **F&B payment tier 3 includes house accounts** — `chargeGuestMemberAccount` debits the member's billing account (AR). Member lookup via `GET /api/v1/fnb/payments/member-lookup?search=`. Gift card balance via `GET /api/v1/fnb/payments/gift-card-balance?cardNumber=`. NFC and loyalty are stubs for V2.
306. **Semantic pipeline is now dual-mode (metrics + SQL)** — `runPipeline()` resolves intent first, then branches: Mode A (metrics) compiles via registry → executes → narrates. Mode B (SQL) generates SQL via LLM → validates → executes → auto-retries on failure → narrates. Mode selection is automatic based on intent confidence and schema availability. Both modes share the same eval capture, caching, and observability infrastructure.
307. **LLM-generated SQL has defense-in-depth validation** — `validateGeneratedSql()` in `sql-validator.ts` enforces: SELECT/WITH only, no DDL/DML/TX control, no dangerous functions (`pg_sleep`, `set_config`, etc.), no comments, no semicolons (multi-statement prevention), `tenant_id = $1` required, LIMIT required (except aggregates), table whitelist check against schema catalog. RLS is the primary security layer — validation is an additional guard. Always validate before executing.
308. **SQL auto-correction retry sends errors back to LLM** — when LLM-generated SQL fails execution, `retrySqlGeneration()` sends the failed SQL + error message back to the LLM for one correction attempt. The corrected SQL is re-validated before execution. Token counts and latency accumulate across retries. Max retries default to 1 to control cost. Never retry more than once.
309. **Semantic pipeline uses RAG few-shot retrieval** — `retrieveFewShotExamples()` in `rag/few-shot-retriever.ts` retrieves similar past queries for injection into the SQL generator system prompt. Best-effort — never blocks SQL generation on RAG failure. Supports `includeSqlMode` / `includeMetricsMode` filtering.
310. **Conversation pruning is token-aware** — `pruneForSqlGenerator()` in `conversation-pruner.ts` trims conversation history to fit within token budgets before sending to the SQL generator. Preserves the most recent messages. Different pruning strategies for intent resolution vs SQL generation.
311. **LLM response cache is separate from query cache** — `llm-cache.ts` caches narrative LLM responses keyed on `(tenantId, promptHash, userMessage + dataSummary, history)`. `query-cache.ts` caches SQL query results keyed on `(tenantId, sql, params)`. Both are in-memory LRU with TTL. Check both caches before making LLM/DB calls.
312. **Pipeline generates follow-ups, chart config, and data quality scores** — after execution + narrative, the pipeline calls `generateFollowUps()` (context-aware suggested questions), `inferChartConfig()` (auto-detect best chart type from data shape), and `scoreDataQuality()` (confidence scoring based on row count, execution time, date range, schema tables). All are optional enrichments that never block the response.
313. **SQL generator system prompt includes money conventions** — the `buildSqlGeneratorPrompt()` explicitly documents which tables use cents (orders, tenders) vs dollars (catalog, GL, read models, receiving). LLM must convert cents to dollars with `/ 100.0` when users ask about dollar amounts. Also documents status conventions, date patterns, and the critical users vs customers table distinction.
314. **PMS module follows standard module architecture** — `packages/modules/pms/` has 50+ commands, 60+ queries, state machines for reservations and rooms, event consumers for calendar/occupancy projections, background jobs (nightly charges, no-show marking, housekeeping auto-dirty), and `rm_pms_*` CQRS read models. Uses `publishWithOutbox` for all write ops.
315. **PMS uses state machines for lifecycle management** — `state-machines.ts` defines `RESERVATION_TRANSITIONS` (confirmed→checked_in→checked_out, confirmed→cancelled, confirmed→no_show) and `ROOM_STATUS_TRANSITIONS` (clean→occupied→dirty→cleaning→inspected→clean). `assertReservationTransition()` and `assertRoomTransition()` throw `InvalidStatusTransitionError` on invalid moves.
316. **PMS calendar queries return room-centric segments** — `getCalendarWeek()` and `getCalendarDay()` return rooms with reservation segments for Gantt-style rendering. `getCalendarMonth()` returns day-level occupancy summaries. Calendar queries are optimized for frontend rendering — no N+1 queries.
317. **PMS has its own idempotency + outbox tables** — `pms_idempotency_keys` and `pms_outbox` are PMS-specific (not shared with the core outbox). This allows PMS to be extracted to a microservice later without depending on the core event infrastructure.
318. **PMS pricing engine is rule-based** — `computeDynamicRate()` evaluates `pms_pricing_rules` (occupancy-based, day-of-week, lead-time, length-of-stay, demand) in priority order. `pricingConditionsSchema` validates rule conditions. `pms_pricing_log` records which rules fired for each rate calculation.
319. **PMS room assignment engine uses weighted scoring** — `scoreRoom()` evaluates rooms by floor preference, view, accessibility, loyalty tier, previous stays, and room features. `rankRooms()` returns sorted candidates. Preferences stored in `pms_room_assignment_preferences` per property.
320. **PMS schema uses `pms_` prefix on all tables** — all 50+ PMS tables are prefixed `pms_` (e.g., `pms_reservations`, `pms_rooms`, `pms_folios`). Read models use `rm_pms_` prefix. This avoids name collisions and makes the module clearly identifiable in SQL.
321. **PMS channel management syncs availability** — `pms_channels` (OTA integrations), `pms_channel_sync_log` (sync history), `pms_booking_engine_config` (direct booking). `syncChannel` command pushes availability/rates to external channels. Channel sync is async and logged for debugging.
322. **PMS loyalty is points-based** — `pms_loyalty_programs` (earn/burn rates, tiers), `pms_loyalty_members` (points balance, tier), `pms_loyalty_transactions` (earn/redeem/adjust/expire). `enrollLoyaltyGuest`, `earnLoyaltyPoints`, `redeemLoyaltyPoints`, `adjustLoyaltyPoints` commands. Redemption validates sufficient balance.
323. **PMS guest portal uses secure token sessions** — `pms_guest_portal_sessions` with expiring tokens for pre-check-in self-service. `createGuestPortalSession` generates the token, `completePreCheckin` captures guest preferences. `expireGuestPortalSessions` runs as a background job.
324. **Admin train-ai section replaces eval** — the admin sidebar now uses "Train AI" as the top-level section (was "Eval"). Sub-pages: Examples, Turns (detail), Batch Review, Comparative, Conversations, Cost Analytics, Experiments, Playground, Regression Testing, Safety. Each has corresponding API routes under `/api/v1/eval/`.
325. **Admin eval training hook centralizes all training operations** — `useEvalTraining()` in `apps/admin/src/hooks/use-eval-training.ts` provides CRUD operations for examples (including bulk import/export and effectiveness tracking), batch review workflows, experiment management, regression testing, cost analytics, safety evaluation, and conversation analysis. Single hook for all AI training features.
326. **Eval examples support bulk import/export** — `POST /api/v1/eval/examples/bulk-import` for batch creation, `GET /api/v1/eval/examples/export` for CSV/JSON export. Examples track effectiveness via `GET /api/v1/eval/examples/[id]/effectiveness`. Promoted corrections from turns create examples via `POST /api/v1/eval/turns/[id]/promote-correction`.
327. **Semantic schema catalog is built from live DB introspection** — `buildSchemaCatalog()` in `schema/schema-catalog.ts` introspects the actual database schema to build a catalog of tables, columns, and types. This is loaded in parallel with the registry catalog at pipeline start. Non-blocking — schema catalog failure falls back to metrics-only mode.
328. **Intelligence modules are post-pipeline enrichments** — `intelligence/follow-up-generator.ts`, `intelligence/chart-inferrer.ts`, `intelligence/data-quality-scorer.ts` run after query execution. They analyze the query results and plan to generate contextual follow-up questions, optimal chart configurations, and data quality scores. All are pure functions with no side effects.
329. **PMS hooks follow standard pattern** — `use-pms.ts` provides `usePmsCalendar()`, `usePmsReservations()`, `usePmsRoomTypes()`, etc. Each returns `{ data, isLoading, error, mutate }`. Mutations use `useMutation` pattern. Calendar hooks support week/day/month views with date-range parameters.
330. **Catalog module now exports modifier group queries** — `getCatalogModifierGroups` and `getModifierGroupsForItem` added to catalog query exports. Used by F&B menu panel for modifier resolution. Also exports `importInventory` command for catalog-level inventory import.
331. **Customer module expanded with import and tag management** — new commands: `bulkImportCustomers`, `createTag`, `updateTag`, `archiveTag`, `unarchiveTag`, `applyTagToCustomer`, `removeTagFromCustomer`, `createSmartTagRule`, `updateSmartTagRule`, `toggleSmartTagRule`, `evaluateSmartTags`. New queries: `listTags`, `getTag`, `getTaggedCustomers`, `getCustomerTags`, `listSmartTagRules`, `getSmartTagRule`, `getSmartTagEvaluationHistory`, `getTagAuditLog`, `listCustomerImportLogs`.
332. **Insights page has sub-sections** — `/insights` is now a hub with sub-pages: `/insights/authoring` (semantic authoring panel), `/insights/embeds` (embeddable widgets), `/insights/reports` (NL report builder), `/insights/tools` (analysis tools), `/insights/watchlist` (metric watchlist). Each has its own content component and hooks.
333. **PMS calendar content is code-split** — `apps/web/src/app/(dashboard)/pms/calendar/calendar-content.tsx` follows the standard code-split pattern: thin `page.tsx` with `next/dynamic` + `ssr: false`, heavy content in separate file. PMS sub-pages (corporate, groups, loyalty, maintenance, reports, revenue-management) follow the same pattern.
334. **Import system uses a centralized registry** — `apps/web/src/lib/import-registry.ts` defines available import types (catalog, customer, staff, COA, legacy transactions). Import wizard components in `apps/web/src/components/import/` share a common flow. API routes under `/api/v1/import/` handle file upload, validation, and processing. Hooks: `use-import-wizard.ts`, `use-import-jobs.ts`, `use-import-progress.ts`, `use-import-completion.ts`.
335. **POS design tokens are in a separate CSS file** — `apps/web/src/styles/pos-design-tokens.css` defines POS-specific CSS custom properties (colors, spacing, touch targets) separate from F&B design tokens. POS animations in `pos-animations.css`. Both imported in the POS layout.
336. **POS offline queue and sync are typed but not yet wired** — `apps/web/src/lib/pos-offline-queue.ts` and `pos-offline-sync.ts` define the offline operation queue and sync strategy as TypeScript implementations. V1 still blocks tenders when offline.
337. **Accounting CSV import flow is wizard-based** — `apps/web/src/components/accounting/csv-import-flow.tsx` and `import-wizard.tsx` provide a step-by-step CSV import experience for COA data. Maps columns, validates, previews, and creates accounts.
338. **Semantic module now exports SQL-mode types and functions** — `packages/modules/semantic/src/index.ts` exports `generateSql`, `validateGeneratedSql`, `retrySqlGeneration`, `pruneForSqlGenerator`, `buildSchemaCatalog`, `retrieveFewShotExamples`, plus intelligence functions (`generateFollowUps`, `inferChartConfig`, `scoreDataQuality`). Also exports batch review, conversation analysis, cost analytics, experiments, regression runner, and safety engine from the evaluation submodule.
339. **PMS permissions are separate from core RBAC** — `PMS_PERMISSIONS` defines 30+ PMS-specific permissions across categories (properties, rooms, reservations, rates, guests, folios, housekeeping, reports, settings, channels, loyalty). `PMS_ROLE_PERMISSIONS` maps system roles to PMS permissions. Same pattern as F&B permissions (`pos_fnb.*`).
340. **Tailwind CSS v4 on Windows: CSS disappears (0 utility classes)** — Known intermittent issue where the dev server serves CSS with only the base reset layer (12KB) but zero utility classes (should be ~185KB). Root causes: (1) `.next` cache corruption from Windows EPERM file locks on `.next/trace`, (2) Tailwind v4 oxide native binary fails to load and WASM fallback returns 0 scan results on Windows, (3) Turbopack cache holding stale empty CSS. **Fix procedure**: `taskkill /F /IM node.exe` → `rm -rf apps/web/.next` → `pnpm dev` → hard refresh browser (`Ctrl+Shift+R`). The `@source "../../"` directive in `globals.css` is REQUIRED for monorepo scanning — without it, Tailwind v4's PostCSS plugin finds zero source files. If CSS breaks after a clean restart, check `node -e "require('@tailwindcss/oxide')"` — if it fails, run `pnpm install` to restore the native binary. Never remove the `@source` directive.
341. **Windows EPERM on `.next/trace` — full server fix** — When the dev server crashes with `EPERM: operation not permitted, open '.next/trace'`, orphaned Node processes are holding the file lock. **Critical**: bash `taskkill /F /IM node.exe` CANNOT kill its own parent process tree — always use PowerShell: `powershell.exe -NoProfile -Command 'Stop-Process -Name node -Force'`, then `sleep 3`, verify 0 processes, `rm -rf apps/web/.next`, restart. Running `next dev` (with or without Turbopack) on a partial `.next` directory causes cascading `middleware-manifest.json` / `routes-manifest.json` ENOENT errors. Always fully delete `.next` before restart.
342. **Never mix dynamic slug names at the same route level** — Next.js App Router requires exactly one dynamic segment name per path level. Having both `payment-processors/[id]/` and `payment-processors/[providerId]/` as siblings causes a fatal startup error: `You cannot use different slug names for the same dynamic path`. Pick one name and use it consistently for all routes at that level.
343. **CommonJS scripts in ESM packages must use `.cjs` extension** — When `package.json` has `"type": "module"`, any script using `require()` must be named `.cjs` (not `.js`). The `dev-prep.cjs` script in `apps/web/scripts/` was renamed from `.js` for this reason. Always check the package's `type` field before adding new scripts.
344. **Payment gateway credentials are AES-256-GCM encrypted** — `paymentProviderCredentials.credentialsEncrypted` stores encrypted JSON. Use `encryptCredentials()` / `decryptCredentials()` helpers from `packages/modules/payments/src/helpers/credentials.ts`. Never store raw API keys in the database.
345. **Payment provider resolution happens OUTSIDE the transaction** — read-only provider/credential/merchant lookup happens before entering `publishWithOutbox`. This keeps transactions short and avoids holding locks during external API calls. Pattern: resolve → enter transaction → idempotency check → call provider → record result.
346. **Per-operation idempotency on payment intents** — each void/refund/capture gets its own `clientRequestId` column (migration 0176). Unlike tender-level idempotency (one key per tender), payment intents track idempotency per operation type. Partial unique index excludes NULL values for backward compatibility.
347. **Never expose raw gateway decline codes to end users** — use `interpretResponse()` from `packages/modules/payments/src/services/response-interpreter.ts` which returns separate `userMessage` (safe for cardholder display) and `operatorMessage` (with raw codes for staff). The `SuggestedAction` type guides retry behavior.
348. **Surcharge settings use 3-level scoping** — queries must check terminal-specific → location-specific → tenant-wide settings (most specific wins). Each level uses a partial unique index with NULL-scoped columns: `(tenant_id) WHERE location_id IS NULL AND terminal_id IS NULL` for tenant-wide, etc.
349. **Role access scoping: empty table = unrestricted** — `role_location_access`, `role_profit_center_access`, `role_terminal_access` use an "open by default" pattern. A role with NO rows in `role_location_access` can see ALL locations. Adding ANY row restricts the role to ONLY those locations. This is the opposite of the permission model (additive on top of nothing).
350. **ERP workflow config uses cascading fallback** — `getWorkflowConfig()` checks: (1) explicit DB row for tenant+module+workflow, (2) `TIER_WORKFLOW_DEFAULTS` based on `tenants.business_tier`, (3) ultimate fallback (auto=true, userVisible=false). Always use the workflow engine, never query `erpWorkflowConfigs` directly.
351. **Destructured `.split().map()` results need default values** — `const [a, b] = str.split(':').map(Number)` can produce `undefined` if the string is malformed. Always use `const [a = 0, b = 0] = ...`. This applies to all destructured array results from `split`/`map` chains.
352. **Vercel Hobby plan only supports daily cron** — `vercel.json` cron schedule `"0 0 * * *"` is the only supported interval on Hobby. 15-minute intervals require Vercel Pro. The ERP `isWithinWindow()` function was designed for 15-minute intervals — with daily cron it only fires if close time is within 15 minutes of midnight.
353. **Modifier per-assignment overrides live on the junction table** — `catalog_item_modifier_groups` has `override_required`, `override_min_selections`, `override_max_selections`, `override_instruction_mode`, `prompt_order`. The same modifier group can behave differently on different items. When rendering in POS, always check the junction table first, fall back to the modifier group defaults.
354. **Always use explicit column selects, never SELECT * on tables with frequent additions** — commit `cdbf002` fixed a 500 error caused by `SELECT *` on modifier tables after migration 0183 added new columns. Drizzle queries that select all columns can break when new columns are added if the mapping type doesn't include them. Use explicit `.select({ id: table.id, ... })` for safety.
355. **Payment intents are mutable (unlike tenders)** — `paymentIntents.status` is updated through a state machine (created → authorized → captured → voided → refunded → declined → error → resolved). Validate transitions before updating. Tenders remain append-only — the `payment_intent_id` FK on tenders is the bridge.
356. **POS visibility resume pattern** — when the browser tab was hidden >30s and becomes visible, `usePOSVisibilityRefresh` in `pos/layout.tsx`: (1) proactively refreshes JWT if within 5min of expiry, (2) pings `/api/health` to warm Vercel serverless function, (3) dispatches `pos-visibility-resume` custom event. Any hook needing to refresh stale POS data should `addEventListener('pos-visibility-resume', handler)`.
357. **Customer cache is module-level singleton** — `apps/web/src/lib/customer-cache.ts` caches up to 500 customers with 5-min TTL. Pre-warmed on POS mount via `warmCustomerCache()`. Use `filterCustomersLocal()` for instant results, `searchCustomersServer()` as fallback when cache is incomplete. Survives React unmounts but NOT full page refreshes.
358. **POS display size uses CSS custom property** — `--pos-font-scale` set on POS layout root via `usePOSDisplaySize` hook. 3 sizes: default (1x), large (1.15x), xlarge (1.3x). Persisted in `localStorage('pos_display_size')`. All POS text that should scale must use `calc(var(--pos-font-scale) * base-size)`.
359. **ACH return codes have retry classification** — `packages/modules/payments/src/helpers/ach-return-codes.ts` classifies R01-R83 codes into categories (nsf, closed, invalid, unauthorized, admin, regulatory, other). Only R01 (insufficient funds) and R09 (uncollected funds) are retryable with a 2-day delay. All other return codes are terminal — do not retry.
360. **SuperAdmin timeline writes are fire-and-forget** — `void writeTimelineEvent({...})` is called AFTER the primary operation succeeds, with no `await`. Errors are caught and logged internally. Never use `publishWithOutbox` for timeline events — they are read model inserts, not domain events. Never let timeline failures break primary operations.
361. **SuperAdmin health snapshots use parallel `Promise.all`** — health scoring computes ~20 metrics per tenant. All metrics are fetched concurrently via `Promise.all`. Score starts at 100 with deductions (DLQ depth: -25, error rate: -20, unmapped GL: -10, etc.). Grade: A≥90, B≥75, C≥60, D≥40, F<40.
362. **SuperAdmin alert cooldown is per-rule, not per-tenant** — when a DLQ depth alert fires for Tenant A, the cooldown prevents the same rule from firing for ANY tenant during the cooldown window. This prevents alert floods but means simultaneous issues across tenants may only generate one notification.
363. **Intelligence services read from `rm_*` tables only** — all semantic intelligence services (anomaly detection, correlation, forecasting, etc.) read from CQRS read models, never operational tables. If a new metric needs analysis, ensure it's being populated into the appropriate read model first. Anomaly detection writes only to its own `semanticAlertNotifications` table.
364. **Agentic orchestrator has strict guardrails** — max 5 Think/Act/Observe steps, SELECT-only SQL validation, tenant isolation, total timeout. Each step is a separate LLM call — a complex question can consume 5x the tokens of a simple query. Monitor via existing semantic observability metrics.
365. **`tenant_business_info` is one-row-per-tenant upsert** — uses `ON CONFLICT (tenant_id) DO UPDATE` pattern. `updateBusinessInfo` only sets fields that were actually passed (`!== undefined`). Tax ID is stored encrypted and returned masked (bullet chars + last 4). Content blocks use `ON CONFLICT (tenant_id, block_key)` for per-block upsert.
366. **Year seed script is additive-only and deterministic** — `packages/db/src/seed-year.ts` uses `mulberry32(20260224)` PRNG. Running twice creates duplicate orders (no dedup). Always run on a clean DB after `pnpm db:seed`. Populates `rm_daily_sales` and `rm_item_sales` directly via ON CONFLICT upsert (bypasses event consumers). Supports `--remote` flag for production.
367. **Portal auth default password is `member123`** — `seed-portal-auth.ts` uses a pre-computed bcrypt hash. For production members, use `add-portal-member.ts` with a custom password. Portal auth accounts use provider `'portal'` with unique constraint on `(tenant_id, customer_id, provider)`.
368. **Settings navigation renamed** — sidebar nav for Settings → General now points to `/settings/general` (was undefined). Merchant services moved from `/settings/payment-processors` to `/settings/merchant-services`.
369. **Profit centers settings use single-fetch + client-side filtering** — `useProfitCenterSettings()` calls `GET /api/v1/profit-centers/settings-data` once, returns `{ locations, profitCenters, terminals }`. Use `filterProfitCenters()`, `filterTerminalsByLocation()`, `filterTerminalsByPC()` for instant filtering — never make separate API calls for each level. `useVenuesBySite()` builds the site→venue map via `useMemo`.
370. **Terminal selection uses single-fetch with role scoping** — `useTerminalSelection({ roleId })` calls `GET /api/v1/terminal-session/all?roleId=xxx` once, then derives `sites`, `venues`, `profitCenters`, `terminals` via `useMemo`. Role access filtering happens server-side via `role_location_access`, `role_profit_center_access`, `role_terminal_access` tables. Empty tables = unrestricted (gotcha #349 applies).
371. **Merchant services hooks use React Query** — all payment processor hooks (`usePaymentProviders`, `useMerchantAccounts`, `useTerminalAssignments`, etc.) use `@tanstack/react-query` with `staleTime: 15_000–30_000`. Mutation hooks auto-invalidate relevant query keys via `queryClient.invalidateQueries()`. Never use raw `useEffect` + `apiFetch` for merchant services data.
372. **`/settings` is a redirect, not a page** — `apps/web/src/app/(dashboard)/settings/page.tsx` redirects to `/settings/general` via `router.replace()`. All settings content lives under specific sub-routes: `/settings/general` (6-tab layout), `/settings/profit-centers`, `/settings/merchant-services`, etc. Never put settings content directly in `/settings/page.tsx`.
373. **Impersonation safety guards throw 403** — `assertImpersonationCanVoid(ctx, amountCents)` blocks voids >$500, `assertImpersonationCanModifyAccounting(ctx)` blocks ALL accounting changes, `assertImpersonationCanDelete(ctx)` blocks ALL deletes during impersonation. All throw `ImpersonationRestrictionError` (code `IMPERSONATION_RESTRICTED`, HTTP 403). Check `isImpersonating(ctx)` for conditional logic.
374. **`getSettingsData` runs 3 queries in parallel inside `withTenant`** — the settings data query uses `Promise.all([locations, profitCenters, terminals])` inside a single `withTenant` call. All three queries share the same RLS-scoped transaction. Never run them sequentially or in separate `withTenant` calls.
375. **`getTerminalSelectionAll` fetches role access outside `withTenant`** — role access tables (`role_location_access`, `role_profit_center_access`, `role_terminal_access`) have no RLS and are fetched via global `db.query`. Entity data (locations, PCs, terminals) uses `withTenant` for RLS. Both run in parallel via `Promise.all`.
376. **New permissions require updates to THREE files** — when adding a new permission: (1) add to `PERMISSION_MATRIX` in `packages/shared/src/permissions/permission-matrix.ts` (source of truth), (2) add to the appropriate group/sub-group in `PERMISSION_GROUPS` in `apps/web/src/app/(dashboard)/settings/settings-content.tsx` (controls role manager UI), (3) add default role assignments in `packages/db/src/seed.ts`. If you skip step (2), the permission will exist in the system but won't appear in the role manager — users can't grant or revoke it. `PERMISSION_GROUPS` uses hierarchical sub-groups for large modules (F&B POS, PMS, Accounting, POS/Orders, Platform) — add new sub-groups when adding a new sub-module.

## Migration Rules (IMPORTANT — Multi-Agent Safety)

Multiple agents work on this codebase concurrently. Migrations are a **serialized resource** — two agents creating the same numbered migration causes journal conflicts that silently skip migrations in production.

1. **Before creating a migration file**, read `packages/db/migrations/meta/_journal.json` to find the highest `idx`. Your new migration uses `idx + 1`.
2. **Always update `_journal.json` in the same commit** as the new `.sql` file. A migration without a journal entry will be silently ignored by `pnpm db:migrate`.
3. **Never assume the next number** — another agent may have created one since your last check. Always re-read the journal right before writing.
4. **Migration file naming**: `{number}_{snake_case_description}.sql` where `{number}` is zero-padded to 4 digits matching the journal `idx` offset (currently 0-based: idx 0 = file 0000).
5. **Use `IF NOT EXISTS` / `IF EXISTS`** for all DDL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP TABLE IF EXISTS`) so migrations are idempotent and safe to re-run.
6. **Local vs Remote migrations**:
   - `pnpm db:migrate` → runs against local DB (`.env.local`, port 54322)
   - `pnpm db:migrate:remote` → runs against production Supabase (`.env.remote`)
   - Always specify which target when asking for migrations to be run

## Quick Commands

```bash
pnpm dev                  # Start dev server
pnpm build                # Build all packages
pnpm test                 # Run all tests
pnpm test:coverage        # Run tests with coverage reporting
pnpm lint                 # Lint all packages
pnpm type-check           # TypeScript check all packages
pnpm db:migrate           # Run DB migrations (LOCAL)
pnpm db:migrate:remote    # Run DB migrations (PRODUCTION)
pnpm db:seed              # Seed development data
pnpm tsx packages/db/src/seed-year.ts          # Seed 366 days of transactions (LOCAL)
pnpm tsx packages/db/src/seed-year.ts --remote # Seed 366 days of transactions (PRODUCTION)
pnpm tsx tools/scripts/seed-portal-auth.ts     # Create portal auth for all customers (LOCAL)
pnpm tsx tools/scripts/seed-portal-auth.ts --remote  # Portal auth (PRODUCTION)
```

### Troubleshooting: CSS Not Loading (Windows)

If the page renders unstyled (raw text, no layout), Tailwind utility classes aren't being generated. This is a recurring Windows-specific issue with Tailwind v4's native binary + Turbopack cache corruption.

**Quick fix (90% of cases):**
```bash
taskkill /F /IM node.exe          # Kill all Node (Windows file locks prevent .next deletion)
rm -rf apps/web/.next             # Delete corrupted Turbopack cache
pnpm dev                          # Restart dev server
# Then Ctrl+Shift+R in browser    # Hard refresh to bypass browser cache
```

**Verify CSS is healthy:**
```bash
# After dev server starts, check the CSS file size (should be ~185KB, NOT ~12KB)
curl -s http://localhost:3000/dashboard | grep -oP 'href="(/[^"]*\.css[^"]*)"'
# Then fetch that URL and check size:
curl -s http://localhost:3000/<css-url> | wc -c
```

**If CSS is still broken after clean restart:**
```bash
# 1. Verify Tailwind oxide native binary loads (should print "Scanner")
node -e "console.log(Object.keys(require('@tailwindcss/oxide')))"

# 2. If oxide fails, reinstall
pnpm install

# 3. Verify @source directive exists in globals.css (REQUIRED for monorepo)
head -2 apps/web/src/app/globals.css
# Must show: @import 'tailwindcss';
#            @source "../../";

# 4. Nuclear option — full cache wipe
rm -rf apps/web/.next node_modules/.cache
pnpm dev
```

**Root causes:**
- `.next/trace` EPERM file locks (Windows antivirus / lingering Node processes)
- Tailwind v4 oxide WASM fallback (returns 0 scan results on Windows)
- Missing `@source "../../"` directive (monorepo files not scanned)
- Turbopack caching stale empty CSS from a previous broken session
