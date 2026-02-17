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

## Modules

| Module | Key | Phase | Status |
|---|---|---|---|
| Platform Core (auth, RBAC, entitlements, events, audit) | platform_core | V1 | Done |
| Product Catalog (items, categories, modifiers, pricing, tax) | catalog | V1 | Done |
| Retail POS (orders, line items, discounts, tax calc) | orders | V1 | Done (backend + frontend) |
| Payments / Tenders | payments | V1 | Done (cash V1) |
| Inventory | inventory | V1 | Done (movements ledger + events) |
| Customer Management | customers | V1 | Planned |
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
│   ├── src/hooks/                    # React hooks (use-auth, use-catalog, use-pos, etc.)
│   ├── src/lib/                      # Utilities (api-client)
│   └── src/types/                    # Frontend type definitions (catalog.ts, pos.ts)
├── packages/
│   ├── shared/                       # @oppsera/shared — types, Zod schemas, utils, constants
│   ├── core/                         # @oppsera/core — auth, RBAC, events, audit, entitlements
│   ├── db/                           # @oppsera/db — Drizzle client, schema, migrations, seed
│   └── modules/
│       ├── catalog/                  # @oppsera/module-catalog — IMPLEMENTED
│       ├── orders/                   # @oppsera/module-orders — IMPLEMENTED
│       ├── payments/                 # @oppsera/module-payments — IMPLEMENTED (cash V1)
│       ├── inventory/                # @oppsera/module-inventory — IMPLEMENTED (movements ledger + events)
│       ├── customers/                # @oppsera/module-customers — scaffolded
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
@oppsera/module-catalog ← shared, db, core (Drizzle, Zod)
@oppsera/module-orders   ← shared, db, core, module-catalog (Drizzle, Zod)
@oppsera/module-payments ← shared, db, core, module-orders (Drizzle, Zod)
@oppsera/module-inventory ← shared, db, core (Drizzle, Zod)
@oppsera/web             ← shared, core, db, module-catalog, module-orders, module-payments, module-inventory (Next.js, React)
```

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
  // Optional: idempotency check for POS-facing commands
  if (input.clientRequestId) {
    const cached = await checkIdempotency(ctx.tenantId, input.clientRequestId);
    if (cached) return cached;
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // validate references, insert row
    const [created] = await tx.insert(table).values({...}).returning();
    const event = buildEventFromContext(ctx, 'module.entity.created.v1', {...});
    return { result: created!, events: [event] };
  });

  // Save idempotency key after success
  if (input.clientRequestId) {
    await saveIdempotencyKey(ctx.tenantId, input.clientRequestId, result);
  }

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
order.placed.v1          → inventory (deduct stock, type-aware)
order.voided.v1          → inventory (reverse stock) + tenders (reverse payments)
tender.recorded.v1       → orders (mark paid when fully paid)
```

### Internal Read APIs (Sync Cross-Module)
For synchronous lookups during transactions (not eventual consistency):
```typescript
const catalogApi = getCatalogReadApi();
const posItem = await catalogApi.getItemForPOS(tenantId, itemId, locationId);
// Returns: { id, sku, barcode, name, itemType, unitPriceCents, taxInfo, metadata }
```
Internal APIs are read-only, use singleton getter/setter, and are the only exception to events-only cross-module rule.

## Current State

Milestones 0-8 (Sessions 1-15) complete. See CONVENTIONS.md for detailed code patterns.

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

### Test Coverage
459 tests: 134 core + 68 catalog + 52 orders + 22 shared + 183 web (75 POS + 66 tenders + 42 inventory)

### What's Next
- Customer Management module (Session 16)

## Critical Gotchas (Quick Reference)

1. **`z.input<>` not `z.infer<>`** for function params when schema has `.default()` — see CONVENTIONS.md §19
2. **`export type` doesn't create local bindings** — add separate `import type` for same-file use — see §20
3. **Money: catalog=dollars (NUMERIC), orders=cents (INTEGER)** — convert with `Math.round(parseFloat(price) * 100)` — see §21
4. **postgres.js returns RowList** — use `Array.from(result as Iterable<T>)`, never `.rows`
5. **Append-only tables** — `inventory_movements`, `audit_log`, `payment_journal_entries` are never updated/deleted
6. **Receipt snapshots are immutable** — frozen at `placeOrder`, never regenerated
7. **POS commands need idempotency** — all POS-facing writes must support `clientRequestId`
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
