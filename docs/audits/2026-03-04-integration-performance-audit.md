# OppsEra — Modular Monolith Integration & Performance Audit Report

**Date:** 2026-03-04
**Scope:** Full codebase integration audit — wiring, contracts, performance, reliability, security, build/deploy

---

## Executive Summary

The codebase is architecturally sound — clean module boundaries, proper event outbox pattern, defense-in-depth tenancy isolation, and strong auth middleware. However, the multi-agent development process has left **systemic wiring gaps, contract drift, and observability blind spots** that will cause silent failures in production.

**Top 5 Most Dangerous Issues:**
1. **Client-controlled `tenantId`** — the F&B waitlist join endpoint reads `tenantId` from the POST body with no auth, allowing cross-tenant writes (Critical security)
2. **3 critical event name mismatches** — spa package GL posting, customer visit tag evaluation, and membership tag evaluation are completely broken due to typos in `bus.subscribe()` (Critical data integrity)
3. **Event handler race condition** — `check-then-act` idempotency pattern allows duplicate GL entries / inventory deductions across Vercel instances (Critical data integrity)
4. **`withMiddleware` doesn't send errors to Sentry** — all 500 errors from 1,000+ API routes are invisible in monitoring (Critical observability)
5. **KDS N+1 query** — one DB query per kitchen ticket at 3s poll interval will exhaust connection pool during dinner service (Critical performance)

---

## Step 0 — Repo Map

### Foundation Packages

| Package | Purpose | Deps |
|---|---|---|
| `@oppsera/shared` | Types, Zod schemas, constants, utils | None |
| `@oppsera/db` | Drizzle schema (90+ files, 300+ tables), client, migrations | shared |
| `@oppsera/core` | Auth, RBAC, entitlements, events/outbox, audit, observability, cross-module bridges | shared, db |

### Domain Modules (19 implemented, 3 stubs)

| Module | Key | Tables | Status |
|---|---|---|---|
| catalog | `catalog` | 15 | Full |
| orders | `orders` | 7 | Full |
| payments | `payments` | 25+ | Full |
| customers | `customers` | 50+ | Full |
| inventory | `inventory` | 13 | Full |
| fnb | `pos_fnb` | 73 | Full |
| accounting | `accounting` | 39 | Full |
| reporting | `reporting` | 12 | Full |
| ap | `ap` | 6 | Full |
| ar | `ar` | 4 | Full |
| spa | `spa` | 30+ | Full |
| pms | `pms` | 53 | Full |
| semantic | `semantic` | 23 | Full |
| membership | `membership` | 20+ | Full |
| golf-reporting | `golf-reporting` | 10 | Full |
| import | `legacy_import` | — | Full |
| expenses | `expense_management` | — | Full |
| room-layouts | `room_layouts` | 3 | Full |
| project-costing | `project_costing` | 3 | Full |
| kds | `kds` | — | Stub |
| marketing | `marketing` | — | Stub |
| golf-ops | `golf_ops` | — | Stub |

### Apps

| App | Purpose |
|---|---|
| `apps/web` | Next.js 15 frontend + 1,074+ API routes |
| `apps/admin` | Platform admin panel |
| `apps/member-portal` | Self-service member portal |

### Event System

- **Publisher**: `publishWithOutbox()` → `event_outbox` table (transactional)
- **Worker**: `OutboxWorker` polls every 5s, batches of 5, `FOR UPDATE SKIP LOCKED`
- **Bus**: `InMemoryEventBus` with `processed_events` idempotency
- **DLQ**: `event_dead_letters` table (3x retry before dead-letter)
- **Cron fallback**: `/api/v1/internal/drain-outbox` every 1 minute
- **Registration**: All consumers wired in `apps/web/src/instrumentation.ts`
- **100+ consumers** spanning reporting, accounting, inventory, customers, fnb, pms, spa, golf, expenses, project-costing

### Auth Boundary

- JWT → `authenticate()` → DB user lookup → `resolveTenant()` → `resolveLocation()` → `requireEntitlement()` → `requirePermission()` → handler
- 24 module entitlements, 6 RBAC roles
- Cross-module bridges: 8 API interfaces in `@oppsera/core/helpers/`

### DB Access

- Drizzle client: lazy singleton, pool max 2, prepare false
- `withTenant()`: transaction + `set_config('app.current_tenant_id', ...)` + `lock_timeout 5s` + `statement_timeout 30s`
- RLS: `FORCE ROW LEVEL SECURITY` on all tenant tables, optimized `InitPlan` policies
- `guardedQuery`: semaphore + circuit breaker wrapping all critical queries

---

## Findings by Category

---

### Category 1: Wiring Failures (UI + API + Events)

#### 1.1 — UI Wiring Issues

| # | Severity | Issue | File |
|---|---|---|---|
| W1 | **Critical** | AP Bill form submits `vendorId = 'vendor_placeholder'` for every bill | `apps/web/src/app/(dashboard)/ap/bills/new/bill-form-content.tsx` |
| W2 | **Critical** | 5 AI Insights actions (mark read/dismiss/acted) call nonexistent POST sub-routes | `apps/web/src/hooks/use-ai-findings.ts`, `apps/web/src/hooks/use-ai-alerts.ts` |
| W3 | **Critical** | `GET .../digests/{id}/latest` route doesn't exist, hook always 404s | `apps/web/src/hooks/use-ai-digests.ts` |
| W4 | **High** | `/golf/analytics` fully built, zero nav links, completely unreachable | `apps/web/src/app/(dashboard)/golf/analytics/golf-analytics-content.tsx` |
| W5 | **High** | `/membership/billing` and `/membership/reports` unreachable | `apps/web/src/lib/navigation.ts` |
| W6 | **High** | AP "Save & Post" button is a no-op (TODO commented out) | `apps/web/src/app/(dashboard)/ap/bills/new/bill-form-content.tsx` |
| W7 | **High** | 7+ onboarding wizard steps have no `href` (dead links) | `apps/web/src/components/onboarding/phase-definitions.ts` |
| W8 | **Medium** | 7 Insights sub-pages only reachable from empty-state quick links | `apps/web/src/lib/navigation.ts` |

**W1 Detail — AP Bill Vendor Placeholder:**

The vendor picker input is a raw text field that hardcodes `vendorId = 'vendor_placeholder'` whenever any text is typed. No `useVendors` hook is imported or used. The validate function checks `if (!vendorId)` — this passes because `'vendor_placeholder'` is truthy.

```tsx
// line 160 — current broken code:
onChange={(e) => {
  setVendorName(e.target.value);
  setVendorId(e.target.value ? 'vendor_placeholder' : '');
}}
```

**Fix:** Import `useVendors` from `@/hooks/use-vendors` (which exists and calls `GET /api/v1/vendors`) and replace the text input with a proper combobox/autocomplete that sets a real `vendorId` from the returned vendor list.

**W2 Detail — AI Insights Nonexistent Routes:**

The client calls POST to sub-path endpoints (`/read`, `/dismiss`, `/acted`) that don't exist. The API only exposes a single `PATCH /[id]` route that accepts `{ isRead, isDismissed, actionTaken }`.

```typescript
// Client (wrong):
await apiFetch(`/api/v1/semantic/findings/${findingId}/read`, { method: 'POST' });
await apiFetch(`/api/v1/semantic/findings/${findingId}/dismiss`, { method: 'POST' });
await apiFetch(`/api/v1/semantic/findings/${findingId}/acted`, { method: 'POST' });
```

**Fix:** Use the existing PATCH:

```typescript
await apiFetch(`/api/v1/semantic/findings/${findingId}`, {
  method: 'PATCH',
  body: JSON.stringify({ isRead: true }),
});
```

**W6 Detail — AP "Save & Post" No-Op:**

```typescript
const handleSubmit = async (autoPost: boolean) => {
  const result = await createBill.mutateAsync({ ... });
  if (autoPost) {
    // TODO: post immediately after creation
    // NO-OP — bill is saved but NOT posted
  }
};
```

**Fix:** After `createBill` returns, call the post endpoint:

```typescript
if (autoPost) {
  await apiFetch(`/api/v1/ap/bills/${result.id}/post`, { method: 'POST' });
}
```

The API route `POST /api/v1/ap/bills/[id]/post` already exists.

#### 1.2 — Event Wiring Issues

| # | Severity | Issue | Publisher → Consumer |
|---|---|---|---|
| E1 | **Critical** | `spa.package.purchased.v1` ≠ `spa.package.sold.v1` — spa GL posting dead | Accounting subscribes wrong name |
| E2 | **Critical** | `customer.visit.recorded.v1` ≠ `customer_visit.recorded.v1` — tag eval dead | Dot vs underscore |
| E3 | **Critical** | `customer.membership.created.v1` ≠ `membership.created.v1` — tag eval dead | Publisher uses different prefix |
| E4 | **High** | `spa.commission.paid.v1` — event is never actually emitted (returns `events: []`) | `calculate-commissions.ts` |
| E5 | **High** | `catalog.item.archived/unarchived.v1` — handlers exported but never wired in instrumentation | inventory consumers exist but no `bus.subscribe` |
| E6 | **High** | `order.placed.v1` schema missing `billingAccountId` — AR charge relies on undeclared field | Contract drift |
| E7 | **Moderate** | `inventory.low_stock.v1` and `inventory.negative.v1` — no consumers at all | Stock alerts fire into void |
| E8 | **Moderate** | `order.returned.v1` — customers module has no consumer, lifetime spend never decremented | Customer LTV inflation |

**E1 Detail — Spa Package GL Posting Dead:**

```
Publisher (manage-packages.ts): buildEventFromContext(ctx, SPA_EVENTS.PACKAGE_SOLD, ...) → 'spa.package.sold.v1'
Consumer (instrumentation.ts):  bus.subscribe('spa.package.purchased.v1', ...)  ← WRONG NAME
```

Impact: Spa package sales are never posted to GL. The deferred revenue entry for package liabilities is silently dropped every time a spa package is sold.

**E2 Detail — Customer Visit Tag Evaluation Dead:**

```
Publisher (record-visit.ts):     buildEventFromContext(ctx, 'customer_visit.recorded.v1', ...)
Consumer (instrumentation.ts):  bus.subscribe('customer.visit.recorded.v1', ...)  ← DOT vs UNDERSCORE
```

Impact: Smart tags configured to trigger on customer visits never re-evaluate.

**E5 Detail — Catalog Archive/Unarchive Not Wired:**

The inventory module exports `handleCatalogItemArchived` and `handleCatalogItemUnarchived` from `inventory/src/events/consumers.ts` and declares them in `contracts.ts` as consumed events — but no `bus.subscribe()` call exists in `instrumentation.ts`.

Impact: When a catalog item is archived, its corresponding inventory items remain `active` in all locations.

**Fix:**

```typescript
// In instrumentation.ts 'Inventory consumers' block:
bus.subscribe('catalog.item.archived.v1', inventory.handleCatalogItemArchived);
bus.subscribe('catalog.item.unarchived.v1', inventory.handleCatalogItemUnarchived);
```

---

### Category 2: Cross-Module Contract Drift

| # | Contract | Producer | Consumer | Mismatch | Risk |
|---|---|---|---|---|---|
| C1 | Tender type enums | payments, import, reporting | reconciliation, accounting | 3 divergent type sets — `'card'` classified as "other" in recon but "card" in reporting | **High** |
| C2 | `GatewayResult` field loss | payments facade (10 fields) | core bridge (strips `retryable`, `userMessage`, `suggestedAction`) | POS can't show decline reasons | **High** |
| C3 | `CatalogReadApi` dual impl | core default + catalog module | Any caller | Two identical classes that can diverge silently | **Med** |
| C4 | `getUnmatchedTenders` filter | SQL: `IN ('card', 'gift_card')` | accounting UI | Misses `credit_card`, `debit_card`, `ach` | **Med** |
| C5 | Settlement amounts units | Header = dollars (NUMERIC) | Lines = cents (INTEGER) | Same interface, different units, no annotation | **Low** |

**C1 Detail — Tender Type Enum Fragmentation:**

Three divergent canonical sets exist in parallel:
- `import/validation.ts`: `['cash', 'card', 'gift_card', 'house_account', 'check', 'online', 'other']` — no `ach`, no `credit_card`/`debit_card`
- `reporting/consumers/tender-recorded.ts`: `['cash', 'card', 'credit_card', 'debit_card', 'gift_card', 'house_account', 'ach']` — includes `ach`
- `payments/reconciliation/index.ts` `getTendersSummary`: groups `credit_card`+`debit_card` as card, but NOT `card` itself

Any tender stored with `tenderType='card'` is misclassified as "other" in the reconciliation summary but classified as "card" in reporting.

**Fix:** Define a single `TENDER_TYPES` enum in `@oppsera/shared`. All modules import from the single source. Fix `getTendersSummary` to include `'card'` in the card bucket alongside `'credit_card'`/`'debit_card'`.

**C2 Detail — GatewayResult Field Loss:**

`PaymentIntentResult` has 10 fields not in `GatewayResult`: `retryable`, `userMessage`, `suggestedAction`, `declineCategory`, `avsResult`, `cvvResult`, `tenantId`, `locationId`, `currency`, `orderId`. The bootstrap silently discards them. POS code calling `PaymentsGatewayApi` cannot access `retryable` or `userMessage` to show decline messages.

**Fix:** Add `retryable`, `userMessage`, `suggestedAction`, `declineCategory` to `GatewayResult` in `payments-gateway-api.ts`.

---

### Category 3: Performance & Scalability

| # | Severity | Issue | File | Fix |
|---|---|---|---|---|
| P1 | **Critical** | KDS `getKdsView` N+1: one SELECT per ticket × 3s poll | `packages/modules/fnb/src/queries/get-kds-view.ts:117` | Batch items with `WHERE ticket_id IN (...)` |
| P2 | **High** | `bulk-close-tabs`: N×2 sequential UPDATEs in transaction | `packages/modules/fnb/src/commands/bulk-close-tabs.ts:43` | Batch with `inArray` |
| P3 | **High** | `add-tab-items`: one INSERT per item in loop | `packages/modules/fnb/src/commands/add-tab-items.ts:89` | `.values([...])` batch |
| P4 | **High** | Missing composite index on `fnb_kitchen_tickets(tenant, location, date, status)` | Migration gap | New migration with partial index |
| P5 | **High** | `poll-ach-funding`: nested loops with sequential DB ops + external HTTP inside one transaction | `packages/modules/payments/src/jobs/poll-ach-funding.ts:159` | Break into per-MID transactions |
| P6 | **Medium** | `listOrders` correlated subquery for paymentMethod filter | `packages/modules/orders/src/queries/list-orders.ts:78` | Convert to JOIN or add index |
| P7 | **Medium** | `listInventoryItems lowStockOnly` post-filters in JS (empty pages) | `packages/modules/inventory/src/queries/list-inventory-items.ts:82` | Push filter to SQL CTE |
| P8 | **Medium** | `listTenders` returns full wide rows including JSONB blobs | `packages/modules/payments/src/queries/list-tenders.ts:39` | Explicit column selection |
| P9 | **Medium** | `setInterval` in 3 server-side files (memory growth on Vercel) | semantic metrics, rate limiter, workflow engine | Inline eviction guards |
| P10 | **Medium** | KDS + Expo dual polling streams (4+ polls/3s per kitchen) | `apps/web/src/hooks/use-fnb-kitchen.ts` | Deduplicate via realtime |

**P1 Detail — KDS N+1:**

```typescript
// Current: one query per ticket
for (const t of tickets) {
  const itemRows = await tx.execute(
    sql`SELECT ... FROM fnb_kitchen_ticket_items
        WHERE ticket_id = ${t.id as string}
          AND station_id = ${input.stationId}
          AND item_status NOT IN ('served', 'voided')
        ORDER BY priority_level DESC ...`
  );
}
```

A busy kitchen station with 20 open tickets fires 21 sequential DB round-trips inside a single `withTenant` transaction. At `pollIntervalMs = 3000ms` across N kitchen screens, this creates severe connection pool pressure.

**Fix:** Replace the per-ticket loop with a single batch query:

```sql
SELECT kti.*
FROM fnb_kitchen_ticket_items kti
WHERE kti.ticket_id IN (<ticketIds>)
  AND kti.station_id = $stationId
  AND kti.item_status NOT IN ('served', 'voided')
ORDER BY kti.ticket_id, kti.priority_level DESC, kti.seat_number, kti.id
```

Then group client-side by `ticket_id`. This reduces N+1 → 2 queries total.

**P4 Detail — Missing KDS Index:**

The `getKdsView` query filters on `(tenant_id, location_id, business_date, status)` but existing indexes only cover 3 of the 4 columns each.

**Fix:** Add migration:

```sql
CREATE INDEX IF NOT EXISTS idx_fnb_kitchen_tickets_tenant_loc_date_status
  ON fnb_kitchen_tickets (tenant_id, location_id, business_date, status)
  WHERE status IN ('pending', 'in_progress');
```

**P5 Detail — ACH Polling Holds Connection Across External HTTP:**

```typescript
for (const ma of merchantAccounts) {
  for (const fundingDate of dates) {
    for (const ftxn of fundingData.fundingTransactions) {
      // 2 sequential SELECTs per transaction inside withTenant
    }
  }
}
```

For a merchant with 100 ACH transactions, this is up to 600 sequential DB round-trips holding one connection across external HTTP calls.

**Fix:** Move external HTTP calls outside `withTenant`. Batch lookups via `inArray`. Use separate smaller transactions per MID+date pair.

#### Cheap Wins (Under 90 Minutes Each)

| Priority | Fix | File | Effort |
|---|---|---|---|
| 1 | Add `idx_fnb_kitchen_tickets_tenant_loc_date_status` partial index | New migration SQL file | 15 min |
| 2 | Add `idx_tenders_tenant_type_order` index for paymentMethod filter | Append to existing migration | 10 min |
| 3 | Batch `tx.insert(fnbTabItems).values([...])` — replace loop in `add-tab-items.ts` | `add-tab-items.ts` line 89–113 | 20 min |
| 4 | Batch `tx.update(...).where(inArray(...))` in `bulk-close-tabs.ts` | `bulk-close-tabs.ts` lines 55–83 | 25 min |
| 5 | Replace `tx.select().from(tenders)` with explicit column selection in `list-tenders.ts` | `list-tenders.ts` line 39 | 15 min |
| 6 | Parallelize `orderLineTaxes` fetch with existing `Promise.all` in `get-order.ts` | `get-order.ts` line 91 | 10 min |
| 7 | Add inline eviction guards to `semantic-rate-limiter.ts` and `metrics.ts` write paths | 2 files | 20 min |

---

### Category 4: Reliability / Failure Modes

| # | Severity | Issue | File |
|---|---|---|---|
| R1 | **Critical** | Event handler idempotency is check-then-act (race → duplicate GL/inventory) | `packages/core/src/events/in-memory-bus.ts:106` |
| R2 | **Critical** | `withMiddleware` catch block has no `captureException` — 500s invisible in Sentry | `packages/core/src/auth/with-middleware.ts:230` |
| R3 | **High** | `POSErrorBoundary` doesn't report to Sentry | `apps/web/src/components/pos/pos-error-boundary.tsx` |
| R4 | **High** | No per-section error boundaries (KDS, Accounting, SPA, PMS crash → all modules down) | `(dashboard)/` layout |
| R5 | **High** | `sendEmail` + Twilio SMS have no `AbortController` / timeout | `packages/core/src/email/send-email.ts:23` |
| R6 | **High** | Outbox worker logs lack `correlationId`/`tenantId` — untraceable failures | `packages/core/src/events/outbox-worker.ts:212` |
| R7 | **Medium** | Dashboard error boundary doesn't report to Sentry | `apps/web/src/app/(dashboard)/error.tsx` |
| R8 | **Medium** | F&B floor plan cache not invalidated after tab transfer (stale for 15s) | `use-fnb-tab.ts` |

**R1 Detail — Race Condition in Event Handler Idempotency:**

`checkProcessed` → handler → `markProcessed` is a check-then-act pattern without a database lock or atomic operation. Two Vercel instances can receive the same event from the outbox (e.g., after a stale recovery), both pass the `checkProcessed` gate, and both execute the handler — resulting in duplicate GL entries, double inventory deductions, etc.

```typescript
// BEFORE — both instances read false here simultaneously
const alreadyProcessed = await this.checkProcessed(event.eventId, consumerName);
if (alreadyProcessed) return;
await handler(event);  // ← both instances reach here
await this.markProcessed(event.eventId, consumerName);
```

**Fix:** Claim-before-execute pattern:

```typescript
// AFTER — atomic claim
const claimed = await db.insert(processedEvents)
  .values({ id: generateUlid(), eventId: event.eventId, consumerName, processedAt: new Date() })
  .onConflictDoNothing()
  .returning({ id: processedEvents.id });
if (claimed.length === 0) return; // another instance already processing
await handler(event); // safe: only one instance reaches here
```

**R2 Detail — withMiddleware Missing Sentry:**

```typescript
// Current catch block — no Sentry call:
const rawMsg = error instanceof Error ? error.message : String(error);
console.error('Unhandled error in route handler:', rawMsg, error);
// returns 500 response — captureException() is NEVER called
```

All unhandled 500 errors from `withMiddleware`-wrapped routes (1,000+ routes) are invisible in Sentry.

**R5 Detail — sendEmail No Timeout:**

The `sendEmail` function calls `fetch(RESEND_API_URL, ...)` with no `AbortController`. If Resend hangs, the call blocks for the full 60-second serverless timeout.

**Fix:**

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10_000);
try {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: controller.signal,
  });
} finally {
  clearTimeout(timer);
}
```

---

### Category 5: Multi-Tenant + Security

| # | Severity | Issue | File |
|---|---|---|---|
| S1 | **Critical** | Waitlist join: `tenantId` from unauthenticated POST body → cross-tenant writes | `apps/web/src/app/api/v1/fnb/host/guest/waitlist/join/route.ts` |
| S2 | **High** | Semantic eval queries use plain `db` without `withTenant` (no RLS context) | `packages/modules/semantic/src/evaluation/queries.ts` |
| S3 | **High** | Safety engine tables have zero tenant scoping | `packages/modules/semantic/src/evaluation/safety-engine.ts` |
| S4 | **High** | Cross-tenant voucher/session expiry crons bypass RLS | `packages/modules/payments/src/commands/expire-vouchers.ts` |
| S5 | **Med-High** | `test-sql` endpoint weak regex validation, bypasses pipeline SQL validator | `apps/web/src/app/api/v1/semantic/test-sql/route.ts` |
| S6 | **Medium** | Admin eval turn detail: no tenant ownership check (IDOR) | admin eval routes |
| S7 | **Medium** | Impersonation void/refund limits not enforced in all code paths | `packages/core/src/auth/impersonation-safety.ts` |
| S8 | **Medium** | `sendDefaultPii: true` in client Sentry config | `apps/web/src/instrumentation-client.ts` |

**S1 Detail — Client-Controlled Tenant Context (Critical):**

```typescript
// Line 44 — body.tenantId comes from the raw POST body, no auth
if (!body.locationId || !body.tenantId) { ... }
const { tenantId, locationId } = body;
```

The route has no `withMiddleware` wrapper at all — it exports a raw `async function POST(req: NextRequest)`. The `withTenant(tenantId, ...)` call that follows sets the RLS variable using the attacker-supplied value.

**Attack Scenario:** Attacker POSTs `{"tenantId":"victim-tenant-id","locationId":"victim-loc-id","guestName":"spam","partySize":99}` — repeated thousands of times — polluting the victim's waitlist.

**Fix:**

```typescript
// Resolve tenantId server-side from opaque location code:
const location = await db.query.locations.findFirst({
  where: eq(locations.slug, body.locationSlug),
  columns: { id: true, tenantId: true },
});
if (!location) return NextResponse.json({ error: { code: 'INVALID_LOCATION' } }, { status: 400 });
const { tenantId } = location;
const locationId = location.id;
```

**S2 Detail — Semantic Eval Queries Bypass RLS:**

`getEvalFeed`, `getQualityDashboard`, `getProblematicPatterns`, `getComparativeAnalysis` all accept `tenantId: string | null` and use plain `db` without `withTenant()`. No RLS session context is established. When `tenantId` is `null` (admin mode), the query has no tenant filter at all.

`getEvalTurnDetail` fetches by ID only — no tenant filter and no `withTenant`:

```typescript
export async function getEvalTurnDetail(evalTurnId: string): Promise<EvalTurn | null> {
  const [row] = await db.select().from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.id, evalTurnId))  // no tenantId check
    .limit(1);
}
```

**Fix:** Use `withTenant` for tenant-scoped calls, add `tenantId` assertion for admin paths.

**S4 Detail — Cross-Tenant Voucher Expiry:**

`expireVouchers()` processes vouchers across all tenants using plain `db` with no `withTenant()`. If RLS is bypassed (table owner role), all tenants' vouchers are updated.

**Fix:** Fetch distinct tenant IDs first, then loop with `withTenant()` per tenant.

---

### Category 6: Build / Deploy / CI

| # | Severity | Issue | File |
|---|---|---|---|
| B1 | **P0** | `@oppsera/db/schema` import not in exports map → admin backup/restore breaks in strict ESM | `packages/db/package.json` |
| B2 | **P0** | `@oppsera/core/usage/tracker` dynamic import not resolvable outside bundler | `packages/core/package.json` |
| B3 | **P1** | `turbo.json` build env missing 8 `NEXT_PUBLIC_*` vars → stale Vercel builds | `turbo.json` |
| B4 | **P1** | Duplicate `instrumentation-client.ts` (root + src) — root is dead code | `apps/web/` |
| B5 | **P1** | Duplicate `instrumentation.ts` (root + src) — root stub is dead code | `apps/web/` |
| B6 | **P2** | 5 env vars missing from `.env.example` | `.env.example` |
| B7 | **P2** | `next.config.ts` `transpilePackages` only lists 3 of 22 workspace packages | `apps/web/next.config.ts` |

**B1 Fix — `packages/db/package.json`:**

```json
"./schema": "./src/schema/index.ts",
"./schema/*": "./src/schema/*.ts"
```

**B2 Fix — `packages/core/package.json`:**

```json
"./events/*": "./src/events/*.ts",
"./audit/*": "./src/audit/*.ts",
"./helpers/*": "./src/helpers/*.ts",
"./entitlements/*": "./src/entitlements/*.ts",
"./usage/*": "./src/usage/*.ts"
```

**B3 Fix — `turbo.json` build env:**

Add: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_FNB_REALTIME`, `NEXT_PUBLIC_GUEST_PAY_LIVE`, `NEXT_PUBLIC_MEMBER_PORTAL_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PORTAL_URL`, `NEXT_PUBLIC_ADMIN_URL`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

---

## Top 20 Fix List (Ranked by Impact)

| Rank | Fix | Category | Effort | Files |
|---|---|---|---|---|
| **1** | Fix waitlist endpoint: resolve `tenantId` server-side from location code, not POST body | Security | 30min | `fnb/host/guest/waitlist/join/route.ts` |
| **2** | Fix 3 event name mismatches in `instrumentation.ts` (spa/customer visit/membership) | Events | 15min | `apps/web/src/instrumentation.ts` |
| **3** | Make event handler idempotency atomic: insert-before-execute pattern | Reliability | 1hr | `in-memory-bus.ts` |
| **4** | Add `captureException` to `withMiddleware` catch block | Reliability | 10min | `with-middleware.ts` |
| **5** | Fix KDS N+1: batch items query with `WHERE ticket_id IN (...)` | Performance | 3hr | `get-kds-view.ts` |
| **6** | Add `captureException` to `POSErrorBoundary` and `DashboardError` | Reliability | 15min | 2 files |
| **7** | Add composite index `(tenant_id, location_id, business_date, status)` on `fnb_kitchen_tickets` | Performance | 15min | New migration |
| **8** | Wire `catalog.item.archived/unarchived.v1` consumers in instrumentation | Events | 10min | `instrumentation.ts` |
| **9** | Emit `spa.commission.paid.v1` event from pay-commissions command | Events | 30min | `calculate-commissions.ts` |
| **10** | Fix AP bill form: replace `vendor_placeholder` with real vendor picker | Wiring | 1hr | `bill-form-content.tsx` |
| **11** | Fix AI Insights hooks: use PATCH instead of nonexistent POST sub-routes | Wiring | 30min | `use-ai-findings.ts`, `use-ai-alerts.ts` |
| **12** | Unify tender type enum: single `TENDER_TYPES` in `@oppsera/shared` | Contracts | 2hr | shared + 4 modules |
| **13** | Add `AbortController` + 10s timeout to `sendEmail` and Twilio gateways | Reliability | 30min | `send-email.ts`, 2 SMS files |
| **14** | Batch INSERTs in `add-tab-items.ts` (`.values([...])`) | Performance | 20min | `add-tab-items.ts` |
| **15** | Batch UPDATEs in `bulk-close-tabs.ts` (`inArray`) | Performance | 25min | `bulk-close-tabs.ts` |
| **16** | Fix `@oppsera/db` + `@oppsera/core` package.json exports maps | Build | 20min | 2 `package.json` files |
| **17** | Add missing `NEXT_PUBLIC_*` vars to `turbo.json` build env | Build | 10min | `turbo.json` |
| **18** | Add `retryable`, `userMessage`, `suggestedAction` to `GatewayResult` bridge type | Contracts | 1hr | `payments-gateway-api.ts` |
| **19** | Wrap semantic eval queries in `withTenant` for tenant-scoped calls | Security | 2hr | `evaluation/queries.ts` |
| **20** | Delete duplicate root `instrumentation.ts` + `instrumentation-client.ts` | Build | 5min | 2 files |

---

## Patch Snippets for Highest-Impact Issues

### Patch 1: Fix Event Name Mismatches (15 minutes)

```typescript
// apps/web/src/instrumentation.ts — 3 changes:

// BEFORE (line ~278):
bus.subscribe('spa.package.purchased.v1', accounting.handleSpaPackagePurchaseForAccounting);
// AFTER:
bus.subscribe('spa.package.sold.v1', accounting.handleSpaPackagePurchaseForAccounting);

// BEFORE (line ~384):
bus.subscribe('customer.visit.recorded.v1', customers.handleTagEvaluationOnVisitRecorded);
// AFTER:
bus.subscribe('customer_visit.recorded.v1', customers.handleTagEvaluationOnVisitRecorded);

// BEFORE (line ~385):
bus.subscribe('customer.membership.created.v1', customers.handleTagEvaluationOnMembershipChanged);
// AFTER:
bus.subscribe('membership.created.v1', customers.handleTagEvaluationOnMembershipChanged);
```

### Patch 2: Atomic Event Idempotency (1 hour)

```typescript
// packages/core/src/events/in-memory-bus.ts — replace check-then-act:

// BEFORE:
const alreadyProcessed = await this.checkProcessed(event.eventId, consumerName);
if (alreadyProcessed) return;
// ... handler executes ...
await this.markProcessed(event.eventId, consumerName);

// AFTER — claim-before-execute:
const claimed = await db.insert(processedEvents)
  .values({ id: generateUlid(), eventId: event.eventId, consumerName, processedAt: new Date() })
  .onConflictDoNothing()
  .returning({ id: processedEvents.id });
if (claimed.length === 0) return; // another instance already processing
await handler(event); // safe: only one instance reaches here
```

### Patch 3: `withMiddleware` Sentry Fix (10 minutes)

```typescript
// packages/core/src/auth/with-middleware.ts — in catch block:
import { captureException } from '../observability/sentry-context';

// Add before the return NextResponse.json({ error: ... }, { status: 500 }):
captureException(error, {
  path: new URL(request.url).pathname,
  method: request.method,
  tenantId: _trackTenantId || undefined,
});
```

### Patch 4: Waitlist Endpoint Security Fix (30 minutes)

```typescript
// apps/web/src/app/api/v1/fnb/host/guest/waitlist/join/route.ts
// BEFORE:
const { tenantId, locationId } = body;  // from POST body — UNSAFE

// AFTER — resolve from opaque location code:
const location = await db.query.locations.findFirst({
  where: eq(locations.slug, body.locationSlug),
  columns: { id: true, tenantId: true },
});
if (!location) return NextResponse.json({ error: { code: 'INVALID_LOCATION' } }, { status: 400 });
const { tenantId } = location;
const locationId = location.id;
```

### Patch 5: KDS Batch Query Fix (3 hours)

```typescript
// packages/modules/fnb/src/queries/get-kds-view.ts
// BEFORE: N+1 loop per ticket
// AFTER: Single batch query
const ticketIds = tickets.map(t => t.id);
const allItems = ticketIds.length > 0
  ? await tx.execute(sql`
      SELECT * FROM fnb_kitchen_ticket_items
      WHERE ticket_id IN ${sql`(${sql.join(ticketIds.map(id => sql`${id}`), sql`, `)})`}
        AND station_id = ${input.stationId}
        AND item_status NOT IN ('served', 'voided')
      ORDER BY ticket_id, priority_level DESC, seat_number, id
    `)
  : [];
// Group by ticket_id client-side
const itemsByTicket = new Map<string, typeof allItems>();
for (const item of allItems) {
  const arr = itemsByTicket.get(item.ticket_id) || [];
  arr.push(item);
  itemsByTicket.set(item.ticket_id, arr);
}
```

---

## Verification Plan

### Smoke Tests (Manual, 30 minutes)

1. **Event wiring**: Place an order → verify reporting read model updated, GL entry posted, inventory decremented
2. **Spa package**: Sell a spa package → verify `accounting.journal_entries` has a deferred revenue entry (currently broken)
3. **Customer tag eval**: Record a customer visit → verify smart tags re-evaluate (currently broken)
4. **AP bill**: Create an AP bill via UI → verify `vendorId` is a real ULID, not `vendor_placeholder`
5. **AI Insights**: Mark a finding as read → verify it stays read on refresh (currently broken)
6. **KDS**: Open 3 KDS stations → verify pool connections don't exceed `max: 2` per instance
7. **Waitlist**: Try POST with arbitrary `tenantId` → verify rejection after fix

### Load Test Plan (KDS Focus)

```
Tool: k6 or artillery
Target: GET /api/v1/fnb/kds/stations/{stationId}/view
Scenario: 4 KDS stations polling every 3s, 30 active tickets per station
Duration: 5 minutes
Success criteria:
  - p95 latency < 200ms
  - No 500 errors
  - DB pool_exhausted_count = 0
  - No "guardedQuery blocked" log entries
```

---

## Recommended CI Pipeline Order

```
1. Install (pnpm install --frozen-lockfile)
2. Type-check (pnpm type-check)            ← catches export map issues before build
3. Lint (pnpm lint)                         ← fast, no build needed
4. Test (pnpm test)                         ← depends on ^build per turbo.json
5. Build (pnpm build)                       ← turbo handles dep ordering
6. Migration drift check (diff _journal.json vs migrations/*.sql count)
7. Env var audit (check all NEXT_PUBLIC_* used in code exist in Vercel env)
```

## Pre-Merge Gate Checklist

```
[ ] pnpm type-check passes with zero errors
[ ] pnpm lint passes (or only pre-existing suppressions remain)
[ ] pnpm test passes
[ ] Any new NEXT_PUBLIC_* env var is added to:
      - .env.example
      - turbo.json build.env array
[ ] Any new migration file:
      - Has a matching entry in _journal.json with the correct idx
      - Uses IF NOT EXISTS / IF EXISTS for idempotent DDL
      - idx is next after current highest (check _journal.json first)
[ ] No new cross-module imports: packages/modules/* must not import @oppsera/module-*
[ ] No @oppsera/db imports in files under apps/web/src/components/ (client components)
[ ] No new process.env.ANYTHING without NEXT_PUBLIC_ prefix in 'use client' components
[ ] New package exports are added to the relevant package.json exports map
[ ] No fire-and-forget DB calls (no await-less db.* calls in API routes)
[ ] No new setInterval calls in any server/API code
```

---

## Module Integration Matrix

| | catalog | orders | payments | customers | inventory | fnb | accounting | reporting | pms | spa | membership | ar | ap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **catalog** | — | Bridge | — | — | Event | — | — | — | — | Bridge | — | — | — |
| **orders** | Bridge | — | — | Event | Event | Bridge | Event | Event | — | — | — | — | — |
| **payments** | — | Event | — | — | — | Bridge | Event | Event | Bridge | — | — | — | — |
| **customers** | — | Event | Event | — | — | — | Event | — | — | — | Event❌ | — | — |
| **inventory** | Event | Event | — | — | — | — | Event | Event | — | — | — | — | — |
| **fnb** | Bridge | Bridge | Bridge | — | — | — | Event | Event | — | — | — | — | — |
| **accounting** | — | Event | Event | Event | Event | Event | — | — | Event | Event❌ | Event | Event | Internal |
| **reporting** | — | Event | Event | — | Event | Event | — | — | Event | — | Event | Event | — |
| **pms** | — | — | Event | Bridge | — | — | Event | Event | — | — | — | — | — |
| **spa** | Bridge | — | — | — | — | — | Event❌ | Event | — | — | — | — | — |
| **membership** | — | — | — | — | — | — | Event | Event | — | — | — | — | — |

**Legend**: `Event` = wired via outbox, `Bridge` = via core helper API, `Event❌` = **BROKEN** (name mismatch or missing emit), `Internal` = AP posts GL inline

**Broken wiring** (3 cells marked `❌`):
- `spa` → `accounting`: spa package GL posting dead (`spa.package.purchased.v1` ≠ `spa.package.sold.v1`)
- `accounting` → `spa`: spa commission payout event never emitted (`events: []`)
- `customers` → `membership`: tag eval dead (`customer.membership.created.v1` ≠ `membership.created.v1`)
