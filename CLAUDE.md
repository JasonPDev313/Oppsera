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
| AI Insights (Semantic Layer) | semantic | V1 | Done (registry + compiler + LLM pipeline + lenses + cache + observability) |

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
│   └── admin/                        # Platform admin panel (eval QA, quality dashboards)
│       ├── src/app/(admin)/eval/     # Eval feed, dashboard, examples, patterns, turn detail
│       ├── src/app/api/v1/eval/      # Admin eval API routes
│       ├── src/app/api/auth/         # Admin auth (JWT + bcrypt, separate from tenant auth)
│       ├── src/components/           # AdminSidebar, EvalTurnCard, PlanViewer, SqlViewer, etc.
│       └── src/hooks/                # use-admin-auth, use-eval, use-tenants
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
│       ├── semantic/                 # @oppsera/module-semantic — IMPLEMENTED (AI insights)
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
  - **12 schema tables**: gl_accounts, gl_classifications, gl_journal_entries, gl_journal_lines, gl_journal_number_counters, gl_account_templates, gl_classification_templates, accounting_settings, gl_unmapped_events, accounting_close_periods, financial_statement_layouts, financial_statement_layout_templates
  - **4 mapping tables**: sub_department_gl_defaults, payment_type_gl_defaults, tax_group_gl_defaults, bank_accounts
  - **Migrations**: 0071-0075 (GL core, mappings, bank accounts, close periods), 0077 (financial statements), 0084 (order_lines GL columns: sub_department_id, tax_group_id)
  - **15 commands**: postJournalEntry, postDraftEntry, voidJournalEntry, updateAccountingSettings, lockAccountingPeriod, createGlAccount, updateGlAccount, createGlClassification, updateGlClassification, saveSubDepartmentDefaults, savePaymentTypeDefaults, saveTaxGroupDefaults, saveBankAccount, bootstrapTenantAccounting, updateClosePeriod, closeAccountingPeriod, saveStatementLayout, generateRetainedEarnings
  - **22 queries**: getAccountBalances, getJournalEntry, listJournalEntries, listGlAccounts, getTrialBalance, getGlDetailReport, getGlSummary, listUnmappedEvents, reconcileSubledger, listBankAccounts, getMappingCoverage, getCloseChecklist, listClosePeriods, getProfitAndLoss, getBalanceSheet, getSalesTaxLiability, getCashFlowSimplified, getPeriodComparison, getFinancialHealthSummary, listStatementLayouts, getSubDepartmentMappings, getItemsBySubDepartment
  - **2 adapters**: pos-posting-adapter (tender.recorded.v1 → GL), legacy-bridge-adapter (migration script)
  - **Helpers**: bootstrapTenantCoa, resolveMapping, generateJournalNumber, validateJournal, resolveNormalBalance, getAccountingSettings, catalogGlResolution (resolveRevenueAccountForSubDepartment, expandPackageForGL)
  - **~43 API routes** under `/api/v1/accounting/`
  - **154 tests** across 14 test files
  - Posting engine: double-entry validation, period locking, control account restrictions, idempotent posting via sourceReferenceId
  - COA bootstrap: template-based (golf/retail/restaurant/hybrid defaults), creates classifications → accounts → settings atomically
  - Financial statements: P&L (date range, comparative, location-filterable), Balance Sheet (as-of with retained earnings), Cash Flow (simplified), Period Comparison, Financial Health Summary
  - Sales tax liability report from GL
  - Close workflow: period status tracking, live checklist (drafts, unmapped, trial balance, AP/AR reconciliation)
  - POS adapter: tender → GL posting with subdepartment-resolved revenue, package component splitting, never blocks tenders, logs unmapped events
  - **Catalog→GL pipeline**: `order_lines.sub_department_id` + `tax_group_id` populated at addLineItem time, `tender.recorded.v1` event enriched with `lines[]` (subDepartmentId, taxGroupId, taxAmountCents, packageComponents), POS adapter splits package revenue across component subdepartments via `allocatedRevenueCents`
  - **GL Account Mapping Frontend**: `/accounting/mappings` page with 4-tab layout (Sub-Departments, Payment Types, Tax Groups, Unmapped Events)
    - Mapping coverage card: progress bars with mapped/total counts per category + overall percentage
    - Sub-department mappings: enriched query joining catalog_categories + GL defaults + GL accounts, supports both 2-level (departments) and 3-level (sub-departments) catalog hierarchies
    - Flat mode (2-level): departments rendered as a simple table with AccountPicker dropdowns
    - Grouped mode (3-level): collapsible department sections with sub-department rows
    - Item drill-down: expandable rows showing catalog items under each mappable category
    - AccountPicker filtering: revenue→`['revenue']`, cogs→`['expense']`, inventory→`['asset']`, clearing→`['asset', 'liability']`, tax→`['liability']`
    - Unmapped row highlighting with amber background
    - API routes: `GET /api/v1/accounting/mappings/coverage` (totals from catalog hierarchy), `GET /api/v1/accounting/mappings/sub-departments` (enriched with dept names + item counts + GL display strings), `GET /api/v1/accounting/mappings/sub-departments/[id]/items` (drill-down with cursor pagination)
    - Hooks: `useMappingCoverage`, `useSubDepartmentMappings`, `useSubDepartmentItems`, `useMappingMutations`
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

### Test Coverage
3080+ tests: 134 core + 68 catalog + 58 orders (52 + 6 add-line-item-subdept) + 37 shared + 100 customers + 522 web (80 POS + 66 tenders + 42 inventory + 15 reports + 19 reports-ui + 15 custom-reports-ui + 9 dashboards-ui + 178 semantic-routes + 24 accounting-routes + 24 accounting-gl-mappings + 23 ap-routes + 27 ar-routes) + 27 db + 99 reporting (27 consumers + 16 queries + 12 export + 20 compiler + 12 custom-reports + 12 cache) + 49 inventory-receiving (15 shipping-allocation + 10 costing + 5 uom-conversion + 10 receiving-ui + 9 vendor-management) + 276 semantic (62 golf-registry + 25 registry + 35 lenses + 30 pipeline + 23 eval-capture + 9 eval-feedback + 6 eval-queries + 52 compiler + 35 cache + 14 observability) + 45 admin (28 auth + 17 eval-api) + 199 room-layouts (65 store + 61 validation + 41 canvas-utils + 11 export + 11 helpers + 10 templates) + 154 accounting (22 posting + 5 void + 7 account-crud + 5 classification + 5 bank + 10 mapping + 8 sub-dept-mappings + 9 reports + 22 validation + 22 financial-statements + 33 integration-bridge + 9 catalog-gl-resolution + 12 pos-posting-adapter) + 60 ap (bill lifecycle + payment lifecycle) + 129 ar (23 lifecycle + 16 invoice-commands + 16 receipt-commands + 14 queries + 47 validation + 13 gl-posting) + 114 payments (35 validation + 17 gl-journal + 13 record-tender + 13 record-tender-event + 13 reverse-tender + 13 adjust-tip + 10 consumers) + 1011 fnb (28 core-validation + 26 session2 + 48 session3 + 64 session4 + 59 session5 + 69 session6 + 71 session7 + 38 session8 + 50 session9 + 53 session10 + 49 session11 + 77 session12 + 73 session13 + 91 session14 + 64 session15 + 100 session16 + 12 extract-tables)

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
  - **LLM Pipeline**: `runPipeline()` — intent resolution → compilation → execution → narrative. Anthropic adapter (Claude Haiku). Clarification short-circuit. Query cache (5min LRU, 200 entries). Observability metrics recording. Best-effort eval capture.
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
  - **Auth**: Email/password → JWT (HS256, 8h TTL) + HttpOnly cookie. `platformAdmins` table with bcrypt password hashing. 3 roles: viewer, admin, super_admin. `withAdminAuth(handler, minRole)` middleware.
  - **Eval Feed**: `/eval/feed` — paginated eval turns with filters (status, sortBy, search), `EvalTurnCard` component
  - **Turn Detail**: `/eval/turns/[turnId]` — full turn context (user message, LLM plan via `PlanViewer`, compiled SQL via `SqlViewer`, result sample table, user feedback, admin review form)
  - **Quality Dashboard**: `/eval/dashboard` — KPI cards + Recharts trend charts (hallucination rate, rating distribution, exec time, by-lens breakdown)
  - **Golden Examples**: `/eval/examples` — manage few-shot training data (filter by category/difficulty, delete)
  - **Patterns**: `/eval/patterns` — identify recurring problematic plan hashes with common verdicts/flags
  - **Components**: AdminSidebar, EvalTurnCard, QualityFlagPills, QualityKpiCard, VerdictBadge, RatingStars, PlanViewer, SqlViewer, TenantSelector
  - **API Routes**: 12 endpoints under `/api/v1/eval/` (feed, turns, review, promote, dashboard, examples, patterns, sessions, tenants, compare, aggregation trigger)
  - **Tests**: 45 tests (28 auth + 17 eval API)
  - **Entitlement**: `semantic` module added to core entitlements registry. Script: `tools/scripts/add-semantic-entitlement.ts` for existing tenants.
  - **Utility**: `scripts/switch-env.sh` (toggle local/remote Supabase)

### What's Next
- F&B POS frontend wiring (API routes for 103 commands + 63 queries, React hooks, floor plan integration, tab view, KDS station UI, expo view, payment flow, server/manager dashboards, close batch UI, settings pages)
- F&B POS migration (run fnb schema migration on dev DB)
- Accounting frontend (COA management, journal browser, ~~mapping UI~~, report viewers, statement viewers)
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
- Run migrations 0066-0084 on dev DB
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
173. **Accounting module has 26 tables total** — GL: gl_accounts, gl_classifications, gl_journal_entries, gl_journal_lines, gl_journal_number_counters, gl_account_templates, gl_classification_templates, accounting_settings, gl_unmapped_events, accounting_close_periods, financial_statement_layouts, financial_statement_layout_templates. Mappings: sub_department_gl_defaults, payment_type_gl_defaults, tax_group_gl_defaults, bank_accounts. AP: ap_bills, ap_bill_lines, ap_payments, ap_payment_allocations, ap_payment_terms. AR: ar_invoices, ar_invoice_lines, ar_receipts, ar_receipt_allocations. Vendor extensions: columns added to existing vendors table.
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
209. **F&B module is backend-only (no API routes yet)** — `packages/modules/fnb/` contains 103 commands and 63 queries but NO API routes, React hooks, or frontend components. The module exports pure TypeScript functions. API routes under `/api/v1/fnb/` and frontend wiring are future work.
210. **F&B tables sync from room-layouts snapshots** — `syncTablesFromFloorPlan` in `commands/sync-tables-from-floor-plan.ts` extracts table objects from a published `CanvasSnapshot` via `extractTablesFromSnapshot()`. It creates/updates/deactivates `fnb_tables` rows to match the floor plan. Tables are linked via `roomId` + `floorPlanObjectId`.
211. **F&B read models use `rm_fnb_` prefix** — all 7 reporting tables: `rm_fnb_server_performance`, `rm_fnb_table_turns`, `rm_fnb_kitchen_performance`, `rm_fnb_daypart_sales`, `rm_fnb_menu_mix`, `rm_fnb_discount_comp_analysis`, `rm_fnb_hourly_sales`. Same upsert-by-natural-key pattern as core `rm_` tables.
212. **F&B consumers expect enriched data, not raw events** — consumer functions like `handleFnbTabClosed` take typed input objects (`FnbTabClosedConsumerData`) not raw event payloads. The wiring layer (API/web app) is responsible for enriching event data before calling consumers.
213. **F&B permissions are separate from core RBAC** — 28 F&B-specific permissions (`pos_fnb.*`) across 10 categories (floor_plan, tabs, kds, payments, tips, menu, close_batch, reports, settings, gl). Role defaults defined in `FNB_ROLE_DEFAULTS` for 6 system roles. These complement, not replace, core system permissions.
214. **F&B close batch posts GL via `buildBatchJournalLines`** — the helper in `helpers/build-batch-journal-lines.ts` constructs double-entry journal lines from Z-report data: revenue by sub-department, tax collected, tender by type, tip payable. Uses the same GL mapping resolution pattern as the POS adapter.
215. **F&B hourly sales uses INTEGER cents, not NUMERIC dollars** — `rm_fnb_hourly_sales.salesCents` stores as INTEGER (like orders), unlike other `rm_fnb_*` tables that use NUMERIC(19,4) dollars. This matches the granularity needed for hourly breakdowns.
216. **F&B offline queue is typed but not yet wired** — `helpers/offline-queue-types.ts` defines the offline operation queue (command buffering, conflict resolution, replay) as TypeScript types. The actual WebSocket/offline infrastructure is future work.
217. **F&B UX screen map is a typed spec, not UI code** — `helpers/ux-screen-map.ts` encodes screen definitions, interaction flows, wireframes, and component reuse maps as TypeScript constants. These serve as contracts/specs for frontend implementation, not actual React components.

## Quick Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm test:coverage    # Run tests with coverage reporting
pnpm lint             # Lint all packages
pnpm type-check       # TypeScript check all packages
pnpm db:migrate       # Run DB migrations
pnpm db:seed          # Seed development data
```
