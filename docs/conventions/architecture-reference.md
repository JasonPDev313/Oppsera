# Architecture Reference — On-Demand

> Read this file when working on API routes, commands, queries, POS, events, or cross-module integrations.
> Referenced from CLAUDE.md — do NOT duplicate this content back into CLAUDE.md.

## Middleware Chain

Every API route uses `withMiddleware(handler, options)`:
```
authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler
```
Options: `{ entitlement: 'catalog', permission: 'catalog.view' }`
Special mode: `{ authenticated: true, requireTenant: false }` for pre-tenant endpoints (onboarding).

## Command Pattern (Write Operations)

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

## Query Pattern (Read Operations)

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

## Optimistic Locking (Mutable Aggregates)

```typescript
// For commands that mutate existing aggregates (orders, etc.)
const order = await fetchOrderForMutation(tx, tenantId, orderId, 'open', expectedVersion?);
// ... mutate ...
await incrementVersion(tx, order.id);
```

## API Response Shapes

```typescript
// Success (list): { data: [...], meta: { cursor, hasMore } }
// Success (single): { data: {...} }
// Success (create): { data: {...} } with status 201
// Error: { error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }
```

## Frontend Data Hooks

Custom hooks wrapping `apiFetch` with loading/error states. Pattern: `useFetch<T>(url)` returns `{ data, isLoading, error, mutate }`. Mutations use `useMutation<TInput, TResult>(fn)`.

## POS Dual-Mode Architecture

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

## Money: Dollars vs Cents

- **Catalog** stores prices/costs as `NUMERIC(12,2)` (dollars, string in TS)
- **Orders/Payments** store all amounts as `INTEGER` (cents, number in TS)
- **GL / AP / AR** store amounts as `NUMERIC(12,2)` (dollars, string in TS)
- **Receiving / Landed Cost** stores as `NUMERIC(12,4)` (dollars, 4-decimal precision)
- Convert at catalog→orders boundary: `Math.round(parseFloat(price) * 100)`
- Convert at POS→GL boundary: `(amountCents / 100).toFixed(2)`
- All order-layer arithmetic is integer-only — no floating point
- All GL/AP/AR arithmetic uses `Number()` conversion + `.toFixed(2)` at update time

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

## Cross-Module Decoupling Note

Cross-module deps were eliminated in the architecture decoupling pass. Shared helpers (`checkIdempotency`, `saveIdempotencyKey`, `fetchOrderForMutation`, `incrementVersion`, `calculateTaxes`, `CatalogReadApi`) now live in `@oppsera/core/helpers/`. Pure domain math with no external deps (`computePackageAllocations`) lives in `@oppsera/shared/src/utils/`. Order and catalog modules provide thin re-exports for backward compat. Event payloads are self-contained: `order.placed.v1` includes `customerId` and `lines[]`, `order.voided.v1` includes `locationId`/`businessDate`/`total`, `tender.recorded.v1` includes `customerId`, `lines[]` (with `subDepartmentId`, `taxGroupId`, `packageComponents`), and `paymentMethod` alias.
