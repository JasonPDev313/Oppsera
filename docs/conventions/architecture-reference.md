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
order.placed.v1          → inventory (deduct stock, type-aware) + customers (AR charge if house account, update visit/spend stats) + KDS (create kitchen tickets if FnB)
order.voided.v1          → inventory (reverse stock) + tenders (reverse payments) + customers (AR void reversal) + reporting (adjust read models)
tender.recorded.v1       → orders (mark paid when fully paid) + customers (AR payment + FIFO allocation if house account) + accounting (GL posting with subdepartment-resolved revenue)
tender.reversed.v1       → reporting (adjust read model aggregates)
fnb.course.sent.v1       → KDS (create kitchen tickets per station via routing engine)
spa.appointment.completed.v1 → reporting (spa revenue read models)
inventory.movement.created.v1 → stock alerts (emit low_stock/negative events when thresholds crossed)
```

### Serialized DB Operations Pattern
When a command creates multiple DB records in a loop, serialize with `for...of` instead of `Promise.all()` to prevent pool exhaustion:
```typescript
// CORRECT — serialized (pool-safe)
for (const line of lines) {
  await createKitchenTicket(ctx, { ...line });
}
// WRONG — concurrent (exhausts pool with max:2)
await Promise.all(lines.map(line => createKitchenTicket(ctx, { ...line })));
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

## Audit Logging (Mandatory)

Every command that mutates data MUST call `auditLog()` after the transaction:
```typescript
async function createThing(ctx: RequestContext, input: ValidatedInput) {
  const result = await publishWithOutbox(ctx, async (tx) => { ... });
  await auditLog(ctx, 'module.entity.created', 'entity_type', result.id);
  return result;
}
```
Helpers in `packages/core/src/audit/helpers.ts`. Context utilities in `packages/core/src/auth/context.ts`.

## Cross-Module Decoupling Note

Cross-module deps were eliminated in the architecture decoupling pass. Shared helpers (`checkIdempotency`, `saveIdempotencyKey`, `fetchOrderForMutation`, `incrementVersion`, `calculateTaxes`, `CatalogReadApi`) now live in `@oppsera/core/helpers/`. Pure domain math with no external deps (`computePackageAllocations`) lives in `@oppsera/shared/src/utils/`. Order and catalog modules provide thin re-exports for backward compat. Event payloads are self-contained: `order.placed.v1` includes `customerId` and `lines[]`, `order.voided.v1` includes `locationId`/`businessDate`/`total`, `tender.recorded.v1` includes `customerId`, `lines[]` (with `subDepartmentId`, `taxGroupId`, `packageComponents`), and `paymentMethod` alias.

## Middleware Reference (withMiddleware)

Full chain: bot detection → rate limit → auth → tenant → location (LRU 2K/60s) → requireLocation → active role → entitlement → permission (15s cache) → replay guard → step-up auth → impersonation DELETE block → handler → deferred work flush.

Key options: `{ public, authenticated, permission, entitlement, writeAccess, cache, replayGuard, stepUp, botDetection, requireLocation, rateLimit }`. See §223 in CONVENTIONS_FULL.md for full reference.

Rate limit presets: `auth` (20/15min), `authStrict` (5/15min), `api` (100/min), `apiWrite` (30/min), `publicRead` (30/min), `publicWrite` (5/min). Auto-selected if not specified.

Global 25s timeout wrapping entire chain → 504.

## Deferred Work Pattern

`deferWork(ctx, fn)` enqueues post-response work via Next.js `after()`. Use `auditLogDeferred()` instead of `await auditLog()` for non-critical post-commit work. Flushes on both success and error paths. Vercel-safe (no setInterval).

## Cron Route Pattern

```typescript
export async function GET(req: NextRequest) {
  // 1. Validate CRON_SECRET bearer token
  // 2. Acquire distributed lock: withDistributedLock(LOCK_KEYS.X, ttlMs, fn)
  // 3. Return { skipped } if lock returns null
  // 4. Dynamic import module: const { fn } = await import('@oppsera/module-x')
  // 5. Sequential processing with time budget guard (55s for Vercel Pro)
  // 6. Return results summary
}
```

Lock TTL: slightly under cron interval (15-min cron → 14-min TTL). Sequential processing to respect pool max: 2.

## F&B Realtime V2

Server: `broadcastFnb(ctx, ...events)` — single Supabase Realtime HTTP POST (stateless, Vercel-safe). Called after tx commits with `.catch(() => {})`.

Client: `useFnbRealtime(channels)` hook with channel registry. Feature-flagged: `NEXT_PUBLIC_FNB_REALTIME=true`. Polling always runs as safety net. `debouncedNotify()` coalesces within 150ms.

Topics: `tables → floor+dashboard`, `waitlist → dashboard`, `kds → kds+expo`, `tabs → tab+dashboard`, `guest_pay → guest_pay`.

## Orchestration Layer Cross-Module Queries

`apps/web` API routes (orchestration layer) are the ONLY place where cross-module DB queries are permitted. Modules still must never import each other. Example: POS catalog endpoint cross-joins catalog + inventory + F&B for enrichment, with non-critical try/catch per enrichment.

## Event Dispatch — Inline (Awaited), Never Fire-and-Forget

`publishWithOutbox` uses `await Promise.allSettled()` for inline dispatch. The bus claims events in `processed_events` BEFORE the handler runs — fire-and-forget risks Vercel freezing mid-handler, leaving events permanently claimed but unprocessed. If all handler retries fail, the bus unclaims the event (deletes from `processed_events`) so the outbox worker can redispatch.

## Tenant ID Defense-in-Depth

Every `UPDATE`/`DELETE` WHERE clause MUST include `tenantId` alongside the primary key. Even with RLS, this catches misconfigurations, service-role bypasses, and background worker contexts.

## Advisory Locks for Aggregate Serialization

`SELECT MAX(col) ... FOR UPDATE` is invalid (no rows to lock). Use `pg_advisory_xact_lock(hashtext(compound_key))` — transaction-scoped, auto-released on commit.

## Hook Return Stabilization

Custom hooks returning object literals MUST wrap in `useMemo`. Inline functions extracted to `useCallback` first. Critical for broadly-consumed hooks (`useAuth`, `useEntitlements`).

## KDS Bump Two-Phase State Machine

`pending/in_progress → ready → served`. First bump = ready (kitchen done), second bump = served (expo confirmed). WHERE-clause optimistic lock on `itemStatus` prevents concurrent double-bumps.
