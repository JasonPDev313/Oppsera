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
| F&B POS (dual-mode, shares orders module) | pos_fnb | V1 | Done (frontend) |
| Restaurant KDS | kds | V2 | Planned |
| Golf Reporting | golf_reporting | V1 | Done (read models + consumers + frontend) |
| Room Layouts | room_layouts | V1 | Done (editor + templates + versioning) |
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
│       ├── reporting/                # @oppsera/module-reporting — IMPLEMENTED (queries + consumers + CSV)
│       ├── golf-reporting/           # @oppsera/module-golf-reporting — IMPLEMENTED (golf analytics)
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

**NOTE**: Cross-module deps were eliminated in the architecture decoupling pass. Shared helpers (`checkIdempotency`, `saveIdempotencyKey`, `fetchOrderForMutation`, `incrementVersion`, `calculateTaxes`, `CatalogReadApi`) now live in `@oppsera/core/helpers/`. Order and catalog modules provide thin re-exports for backward compat. Event payloads are self-contained: `order.placed.v1` includes `customerId` and `lines[]`, `order.voided.v1` includes `locationId`/`businessDate`/`total`, `tender.recorded.v1` includes `customerId`.

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

### Test Coverage
1198 tests: 134 core + 68 catalog + 52 orders + 22 shared + 100 customers + 246 web (80 POS + 66 tenders + 42 inventory + 15 reports + 19 reports-ui + 15 custom-reports-ui + 9 dashboards-ui) + 27 db + 99 reporting (27 consumers + 16 queries + 12 export + 20 compiler + 12 custom-reports + 12 cache) + 49 inventory-receiving (15 shipping-allocation + 10 costing + 5 uom-conversion + 10 receiving-ui + 9 vendor-management) + 199 room-layouts (65 store + 61 validation + 41 canvas-utils + 11 export + 11 helpers + 10 templates) + 202 other (business-logic unit tests)

### What's Built (Infrastructure)
- **Observability**: Structured JSON logging, request metrics, DB health monitoring (pg_stat_statements), job health, alert system (Slack webhooks, P0-P3 severity, dedup), on-call runbooks, migration trigger assessment
- **Admin API**: `/api/health` (public, minimal), `/api/admin/health` (full diagnostics), `/api/admin/metrics/system`, `/api/admin/metrics/tenants`, `/api/admin/migration-readiness`
- **Container Migration Plan**: Docker multi-stage builds, docker-compose, Terraform (AWS ECS Fargate + RDS + ElastiCache), CI/CD (GitHub Actions), deployment config abstraction, feature flags, full Vercel/Supabase limits audit with 2026 pricing, cost projections, migration trigger framework (16/21 pre-migration checklist items complete)
- **Security Hardening**: Security headers (CSP, HSTS, X-Frame-Options, etc.), in-memory sliding window rate limiter on all auth endpoints, auth event audit logging (login/signup/logout), env-var-driven DB pool + prepared statement config. Full audit at `infra/SECURITY_AUDIT.md`
- **Legacy Migration Pipeline**: 14 files in `tools/migration/` (~4,030 lines) — config, ID mapping, transformers, validators, pipeline, cutover/rollback, monitoring
- **Load Testing**: k6 scenarios for auth, catalog, orders, inventory, customers (in `load-tests/`)
- **Business Logic Tests**: 30 test files in `test/` covering all domain invariants

### What's Next
- Vendor Management remaining API routes (search, deactivate/reactivate, catalog CRUD endpoints)
- Purchase Orders module Phases 2-6 (commands, queries, API routes, frontend) — schema done
- Receiving module frontend polish (barcode scan on receipt lines, cost preview panel, void receipt UI)
- Settings → Dashboard tab (widget toggles, notes editor)
- Install `@sentry/nextjs` and uncomment Sentry init in `instrumentation.ts`
- Ship logs to external aggregator (Axiom/Datadog/Grafana Cloud)
- Remaining security items: CORS for production, email verification, account lockout, container image scanning (see `infra/SECURITY_AUDIT.md` checklist)
- Run migrations 0066-0067 on dev DB

## Critical Gotchas (Quick Reference)

1. **`z.input<>` not `z.infer<>`** for function params when schema has `.default()` — see CONVENTIONS.md §19
2. **`export type` doesn't create local bindings** — add separate `import type` for same-file use — see §20
3. **Money: catalog=dollars (NUMERIC), orders=cents (INTEGER)** — convert with `Math.round(parseFloat(price) * 100)` — see §21
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
119. **Room Layout editor uses 3-layer Konva architecture** — GridLayer (cached, not redrawn per frame), ObjectLayer (filtered by layer visibility, sorted by zIndex), UI Layer (Transformer + SelectionBox). All in `apps/web/src/components/room-layouts/editor/canvas/`.
120. **Room Layout store stage ref is module-level** — `setEditorStageRef()` / `getEditorStageRef()` live outside the Zustand store to avoid serialization issues. CanvasArea registers in a useEffect, EditorShell reads for PNG export.
121. **Room Layout objects store position in feet, dimensions in pixels** — `x`/`y` are in feet (room coordinate system), `width`/`height` are in pixels. Convert with `scalePxPerFt`. Konva renders at `x * scalePxPerFt`, `y * scalePxPerFt`.
122. **Room Layout templates use SVG thumbnails** — `TemplateThumbnail` renders a lightweight SVG preview, not a full Konva mini-stage. `computeFitScale` ensures the room fits within the thumbnail dimensions.
123. **Room Layout validation is warning-based** — out-of-bounds objects and missing table numbers are warnings, not errors. Only duplicate IDs and missing required fields are errors. `validateForPublish` returns both levels.
124. **Room Layout error boundary preserves data** — `CanvasErrorBoundary` wraps only the Konva `<Stage>`. On canvas crash, Zustand state (snapshot) is preserved. "Reload Editor" button resets the error boundary without losing data.
125. **Room Layout dialogs are portal-based** — all dialogs (SaveAsTemplate, ApplyTemplate, ModeManager, VersionHistory, CreateRoom) use `createPortal(... , document.body)` with z-50, matching the POS dialog pattern.
126. **Room Layout publish always saves draft first** — `handlePublish` in `editor-content.tsx` always calls `saveDraftApi()` before `publishVersionApi()`, regardless of `isDirty` state. After autosave sets `isDirty=false`, `draftVersionId` could be null (e.g., after a prior publish). Without the forced save, publish fails with "No draft version to publish".
127. **Room Layout template creation requires dimensions** — `createTemplateSchema` requires `widthFt` and `heightFt`. The SaveAsTemplateDialog reads these from `useEditorStore`. `createRoomFromTemplateApi` is a two-step process: create blank room with template dimensions → apply template snapshot.
128. **Room Layout `applyTemplateApi` sends roomId in body** — the API route is `POST /api/v1/room-layouts/templates/:templateId/apply` with `{ roomId }` in the request body (not in the URL path). The route extracts `templateId` from the URL.
129. **Room Layout editor fetches on mount** — `editor-content.tsx` calls `fetchEditor()` in a `useEffect` on mount. The `useRoomEditor` hook returns `{ data, isLoading, error, mutate: fetchEditor }` — only one call, never duplicate hook instances.
130. **Room Layout components use `bg-surface` exclusively** — no `bg-white` or `dark:` prefixed classes in any room layout component. All backgrounds use `bg-surface` for theme-aware rendering. Hover states use opacity-based colors (`hover:bg-gray-200/50`, `hover:bg-red-500/10`). Warning banners use `bg-yellow-500/10 border-yellow-500/40`. This matches the inverted gray scale pattern (gotcha #39).
131. **Room Layout actions dropdown needs no overflow-x-auto** — the room list table container must NOT have `overflow-x-auto`, as it clips the absolutely-positioned actions dropdown menu. The table is narrow enough to not need horizontal scrolling.

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
