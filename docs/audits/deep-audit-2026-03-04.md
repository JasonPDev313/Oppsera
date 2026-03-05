# Deep Audit Report — 2026-03-04

Cross-module wiring, event consistency, money handling, schema drift, API routes, and module exports.

---

## CRITICAL — Fix Immediately

### 1. Missing `::int` cast causes data corruption in `set-tax-exempt`
**File:** `packages/modules/orders/src/commands/set-tax-exempt.ts:75`

```sql
-- BROKEN: returns string, causes string concatenation instead of addition
totalTax: sql<number>`coalesce(sum(${orderLineTaxes.amount}), 0)`

-- FIX: add ::int cast
totalTax: sql<number>`coalesce(sum(${orderLineTaxes.amount}), 0)::int`
```

When restoring taxes after removing tax exemption, `restoredTax` is a string at runtime. `lineSubtotal + restoredTax` becomes string concatenation (e.g., `1500 + "87"` = `"150087"`), corrupting `lineTotal` values.

---

### 2. GL posting events never fire — `order.line.comped.v1` and `order.line.voided.v1` are never published
**Consumers:** `accounting/adapters/comp-void-posting-adapter.ts`
**Missing publishers:** No command in `orders/src/commands/` emits these events.

The GL posting consumers for comps and line voids are permanently dead. Comp and void operations will never generate journal entries.

---

### 3. Smart tag evaluation string mismatches — tags silently never match

**Visit tags:** Publisher emits `customer_visit.recorded.v1` (underscore), but `tag-evaluation-consumer.ts:204` passes `customer.visit.recorded.v1` (dot) to the trigger filter. Smart tag rules configured for visit triggers will never evaluate.

**Membership tags:** Publisher emits `membership.created.v1`, but `tag-evaluation-consumer.ts:224` passes `customer.membership.created.v1` to the trigger filter. Same silent failure.

---

### 4. RLS missing on membership revenue recognition tables
**Migration:** `packages/db/migrations/0266_membership_dues_recognition.sql`

`membership_dues_recognition_schedule` and `membership_dues_recognition_entries` have `tenant_id` columns but **no RLS policies**. Financial recognition data is accessible across tenants.

---

## HIGH — Fix Soon

### 5. Catalog rollback route bypasses module, no events fired
**File:** `apps/web/src/app/api/v1/catalog/import/rollback/route.ts`

Raw SQL `DELETE` statements against catalog tables. No `catalog.item.archived.v1` events published, no audit logging, inventory items linked to deleted catalog items become orphaned.

### 6. Terminal tip route bypasses command pattern
**File:** `apps/web/src/app/api/v1/payments/terminal/tip/route.ts`

Directly orchestrates `CardPointeTerminalClient` instead of going through a module command. No audit logging, no idempotency protection.

### 7. `clientRequestId` dropped in GL account merge
**File:** `apps/web/src/app/api/v1/accounting/accounts/[id]/[action]/route.ts:51-54`

`body.clientRequestId` is not forwarded to `mergeGlAccounts`, breaking idempotency on retry.

### 8. `orderDiscounts.value` schema/type mismatch
**Schema:** `packages/db/src/schema/orders.ts:203` — `integer` column
**Input:** `orders/commands/apply-discount.ts:35` — stores raw dollar amount (e.g., `5.50`)

For fixed-dollar discounts, fractional values are silently truncated to integers.

---

## MEDIUM — Address in Normal Development

### 9. Schema drift — indexes in migrations but not in Drizzle schema

| Migration | Index | Missing From |
|---|---|---|
| `0269` | `idx_event_outbox_unpublished` (partial) | `core.ts:454` |
| `0271` | `idx_fnb_kitchen_tickets_kds_poll` (composite partial) | `fnb.ts:643-661` |
| `0243` | 3 performance indexes on `gl_unmapped_events` | `accounting.ts:253-258` |
| `0020` | `idx_orders_tenant_location_terminal` (partial) | `orders.ts:79-106` |

### 10. Orphan event: `inventory.movement.created.v1`
**File:** `instrumentation.ts:79` — subscribed but never published by any command.

### 11. `order.returned.v1` missing from contracts
Published in `create-return.ts:217`, consumed by multiple handlers, but not declared in `orders/events/contracts.ts` and has no `OrderReturnedDataSchema`.

### 12. `writeAccess: true` on read-only SQL test endpoint
**File:** `apps/web/src/app/api/v1/semantic/test-sql/route.ts:93`

Blocks VIEW-only users from read-only SQL testing.

### 13. `place-and-pay-fast.ts` has 18 `as any` casts
**File:** `apps/web/src/app/api/v1/orders/[id]/place-and-pay/place-and-pay-fast.ts`

Critical payment path with zero type safety on all Drizzle operations.

### 14. Float accumulation in GL balance checks
**Files:**
- `accounting/adapters/fnb-posting-adapter.ts:188-191` — sums dollar strings as floats
- `ap/commands/create-bill.ts:40-43` — sums bill line amounts as floats

Should accumulate in cents (integers) then convert back.

### 15. Missing exports from module barrels

| Module | Missing Export |
|---|---|
| `payments` | `getDebitAccountForTenderType`, `getRevenueAccountForDepartment` (dropped by selective re-export) |
| `membership` | `getMembershipSettings` query |
| `orders` | Event payload Zod schemas from `events/types.ts` |
| `payments` | Domain event types from `events/types.ts` |

---

## LOW — Track / Clean Up

### 16. Cross-module DB access (soft violations via `@oppsera/db`)

| Module | Reads From | Owned By |
|---|---|---|
| `catalog` | `inventoryItems` | `inventory` |
| `ap` | `receivingReceipts`, `receivingReceiptLines` | `inventory` |
| `ap` | `glAccounts` | `accounting` |
| `ar` | `customers` | `customers` |
| `accounting` | `tenders`, `paymentSettlements`, `tipPayouts` | `payments` |
| `inventory` | `semanticAlertRules`, `semanticAlertNotifications` | `semantic` |

No hard `@oppsera/module-*` import violations found.

### 17. Orphan events — published but no consumer (by design for future use)

- **25 spa events** (daily ops, turnovers, providers, resources, services, waitlist)
- **10 catalog events** (tax rates, modifiers, categories, location prices)
- **13 orders lifecycle events** (opened, line_added, line_removed, etc.)
- **8 room-layout events**
- **Many customer events** (created, updated, merged, privileges, membership plans)

### 18. Minor route issues

- `payments/failed/[id]/retry` uses `payments.transactions.create` permission instead of a retry-specific permission
- `orders/[id]/return` (POST) vs `orders/[id]/returns` (GET) — singular/plural naming inconsistency
- All `inventory/receiving/[id]/*` routes use fragile URL string parsing instead of Next.js params
- `accounting/import/validate/route.ts` — handler missing `ctx` parameter (works at runtime)

### 19. Dead schema tables (gap stubs)
`purchase_invoices`, `purchase_invoice_items`, `catalog_combos`, `catalog_combo_items`, `role_department_access`, `role_voucher_type_access`, `inter_club_payment_methods`, `inter_club_reconciliations`, `inter_club_reconciliation_batches` — all in `*-gaps.ts` files with zero code usage.

### 20. Missing indexes
- `inventory_items.item_type` — filtered in `listInventoryItems` but no index
- `receipt_charges.gl_account_code` — used in GL posting lookups, no index

### 21. Undocumented enum values
- `semanticAlertRules.ruleType = 'system'` used in `stock-alert-consumer.ts` but schema only documents `'threshold'`
- No CHECK constraints on `inventory_movements.movement_type` or `tenders.tender_type`

---

# F&B POS + Host Stand + Waitlist — End-to-End Audit

Full trace of every user flow from guest arrival through payment and close batch.

---

## CRITICAL — Broken Flows

### F1. Host stand uses legacy `seatFromWaitlist` — no tab created, no table locking
**Files:**
- `apps/web/src/app/(dashboard)/host/host-content.tsx:321` — `waitlistMut.seatGuest()`
- `apps/web/src/hooks/use-fnb-host.ts:551` — `POST /api/v1/fnb/host/waitlist/:id/seat`
- `packages/modules/fnb/src/commands/seat-from-waitlist.ts`

The host stand UI calls `seatGuest` → `POST /api/v1/fnb/host/waitlist/:id/seat` (legacy `seatFromWaitlist`), NOT `POST /api/v1/fnb/host/seat` (`atomicSeatParty`). The legacy path:

1. **Does NOT create a tab** — table goes `seated` but `current_tab_id` is null. The server must separately open a tab.
2. **Does NOT lock the table with `FOR UPDATE`** — reads availability with a plain SELECT, then upserts. Two hosts can seat the same table simultaneously (TOCTOU race).
3. **Does NOT insert `fnb_table_status_history`** — no audit trail for the status change.
4. **Does NOT insert `fnb_table_turn_log`** — turn-time predictions run on incomplete data.
5. **Does NOT write `tab_id` back to `fnb_waitlist_entries`** — waitlist-to-tab linkage is broken.
6. **Does NOT check table version** (no optimistic locking) — the upsert's `ON CONFLICT DO UPDATE` silently overwrites any concurrent change.

The correct path (`atomicSeatParty`) does all of the above atomically. It exists at `POST /api/v1/fnb/host/seat` but is never called from any frontend component.

**Fix:** Rewire `useWaitlistMutations.seatGuest` to call `POST /api/v1/fnb/host/seat` with `sourceType: 'waitlist'` and `sourceId: entryId`.

---

### F2. Five event consumer files (10 handlers) never wired to the bus — table auto-progression and waitlist auto-promotion fully broken
**File:** `apps/web/src/instrumentation.ts` (missing subscriptions)

These consumer implementations exist in `packages/modules/fnb/src/consumers/` but have zero `bus.subscribe()` calls:

| Consumer File | Handler | What's Broken |
|---|---|---|
| `handle-tab-status-for-table.ts` | `handleCourseSentForTableStatus` | Table never auto-progresses from `seated` → `ordered` when items are sent to kitchen |
| | `handleCourseFiredForTableStatus` | Table never shows `entrees_fired` status |
| | `handleCheckPresentedForTableStatus` | Table never shows `check_presented` on floor plan |
| | `handlePaymentCompletedForTableStatus` | Table never auto-progresses to `paid` |
| | `handleTabClosedForTableStatus` | Table never auto-transitions to `dirty` after tab close |
| `handle-table-available-for-waitlist.ts` | `handleTableAvailableForWaitlist` | **Waitlist auto-promotion never fires** — guests are never auto-notified when a table opens up |
| `handle-turn-for-aggregates.ts` | `handleTurnCompletedForAggregates` | `fnb_turn_time_aggregates` never refreshed — turn-time ML predictor runs on stale/empty data |
| `handle-guest-profile-update.ts` | `handleGuestProfileUpdate` | `fnb_guest_profiles` (visit count, spend, preferences) never updated |
| `host-consumers.ts` | `handleTabClosedForHost` | `fnb_table_turn_log` not updated on tab close, `fnb_wait_time_history` not fed |
| | `handleTurnCompletedForHost` | Host analytics read models never populated |

**Impact:** The floor plan shows static table statuses (only updated by manual actions, not by order lifecycle). Waitlist auto-seating is completely non-functional. Turn-time predictions and guest profiles are empty.

---

### F3. Reporting consumer payload mismatches — NaN/NULL corrupting read models
**File:** `apps/web/src/instrumentation.ts` (all subscriptions use `event.data as any`)

| Consumer | Expected Payload | Actual Event Payload | Broken Fields |
|---|---|---|---|
| `handleFnbDiscountComp` (3 events) | `{ businessDate, grossSalesCents, discountCents, compCents, voidCount }` | `CheckCompedPayload: { orderId, compAmountCents, reason }` | `businessDate=undefined`, all dollar fields=`undefined` → `(undefined/100).toFixed(4)` = `"NaN"` in DB |
| `handleFnbTicketBumped` | `{ stationId, businessDate, ticketTimeSeconds, itemCount, hour }` | `TicketBumpedPayload: { ticketId, locationId, tabId }` | 6 of 8 fields undefined → NULL/0 in `rm_fnb_kitchen_performance` |
| `handleFnbItemBumped` | `{ locationId, stationId, businessDate }` | `ItemBumpedPayload: { ticketItemId, ticketId, stationId, locationId }` | `businessDate=undefined` → NULL in read model |
| `handleFnbItemVoided` | `{ locationId, stationId, businessDate }` | `TicketItemStatusChangedPayload: { ticketItemId, oldStatus, newStatus }` | `stationId`, `businessDate` undefined |

All 19 consumer subscriptions use `as any` casts, suppressing compile-time detection.

---

### F4. `prepare-check` — non-atomic tab linkage, concurrent double-order race
**File:** `apps/web/src/app/api/v1/fnb/tabs/[id]/prepare-check/route.ts`

1. **Non-atomic linkage:** Steps 4-6 (openOrder → addLineItemsBatch → placeOrder) and step 7 (`UPDATE fnb_tabs SET primary_order_id`) are NOT in a transaction. Crash between them leaves an orphan order with `fnb_tabs.primary_order_id = NULL`.
2. **Concurrent double-prepare:** Two requests both read `primaryOrderId = null`, both create orders. The second `UPDATE` wins, the first order becomes a ghost with no tab linkage. `addLineItemsBatch` and `placeOrder` each have distinct `clientRequestId` values so only `openOrder` is idempotent on retry — the batch-add and place steps would re-execute, potentially doubling line items on the first order.

---

## HIGH — Fix Soon

### F5. `openTab` has no table version guard — silent overwrite race
**File:** `packages/modules/fnb/src/commands/open-tab.ts`

The `fnb_table_live_status` upsert (`INSERT ON CONFLICT DO UPDATE`) does not check or increment `version`. Two concurrent `openTab` calls for the same table both succeed — the second silently overwrites the first. The losing tab's `current_tab_id` link is erased. Compare to `atomicSeatParty` which uses `SELECT ... FOR UPDATE` + `WHERE version = N`.

### F6. `voidCheck` does not guard order state — can void paid/refunded orders
**File:** `packages/modules/fnb/src/commands/void-check.ts`

Raw SQL `UPDATE orders SET status='voided'` has no `WHERE status IN (...)` guard. A paid or refunded order can be blindly re-voided, incrementing the version and emitting a duplicate `fnb.payment.check_voided.v1` event.

### F7. `voidCheck` does not verify orderId belongs to the tab
**File:** `packages/modules/fnb/src/commands/void-check.ts`

The UPDATE hits `orders WHERE id = input.orderId AND tenant_id = ...` but never checks `fnb_tabs.primary_order_id = input.orderId`. A caller can void any order in the tenant as long as they own the tab (RBAC checks tab server, not order ownership).

### F8. `bulkCloseTabs` closes tabs with unpaid orders — ghost orders left behind
**File:** `packages/modules/fnb/src/commands/bulk-close-tabs.ts`

`CLOSEABLE_STATUSES` includes `check_requested` and `paying`. Tabs are force-closed but linked orders are not voided or cancelled. Orders remain in `placed`/`paying` status with no tab pointing to them. The payment module checks order status, not tab status, so a concurrent payment could complete on a now-closed tab.

### F9. `fnb.gl.posting_failed.v1` has no consumer
**File:** `packages/modules/fnb/src/events/types.ts`

Published when GL posting fails but no handler subscribes. Failed GL postings are silently lost with no operational alert. The only discovery mechanism is a manager manually checking batch status.

### F10. `seatReservation` does not update table live status
**File:** `packages/modules/fnb/src/commands/seat-reservation.ts`

Updates `fnb_reservations.status = seated` and inserts `fnb_table_turn_log`, but does NOT update `fnb_table_live_status`. The floor plan still shows the table as `available` even though the reservation is marked `seated`. The API route does not chain to `atomicSeatParty`.

### F11. `fnb.course.fired.v1` routed to `handleCourseSent` — duplicate ticket creation attempts
**File:** `apps/web/src/instrumentation.ts`

```ts
bus.subscribe('fnb.course.fired.v1', (event) => fnb.handleCourseSent(...), 'kds/course.fired');
```

Firing is semantically "kitchen start cooking now" for an already-sent course. Running `handleCourseSent` on a fired event attempts to create duplicate kitchen tickets. Idempotency via `clientRequestId` prevents DB duplicates, but the attempt adds overhead and creates confusing audit entries.

---

## MEDIUM — Address in Normal Development

### F12. Waitlist position collision under concurrency
**File:** `packages/modules/fnb/src/commands/host-add-to-waitlist.ts`

`MAX(position) + 1` computed without `FOR UPDATE` or `SERIALIZABLE` isolation. Concurrent inserts can produce duplicate position numbers. Self-corrects when any entry is seated (position CTE recompute), but the live waitlist briefly shows duplicates.

### F13. `atomicSeatParty` doesn't lock waitlist entry — race with `seatFromWaitlist`
**File:** `packages/modules/fnb/src/commands/atomic-seat-party.ts`

When `sourceType = 'waitlist'`, the entry is read with a plain `SELECT` (not `FOR UPDATE`), then updated. A concurrent `seatFromWaitlist` on the same entry (which DOES use `FOR UPDATE`) can interleave, producing conflicting status writes.

### F14. `WaitlistSidebarContent` passes empty `tableId` to `seatGuest`
**File:** `apps/web/src/components/fnb/floor/WaitlistSidebarContent.tsx:167`

```tsx
onSeat={() => waitlistMut.seatGuest({ id: entry.id, tableId: '' })}
```

Empty string `tableId` is passed to the API. The backend may fail with a validation error or seat without a table (creating a floating tab).

### F15. `prepare-check` modifier normalization silently defaults empty
**File:** `apps/web/src/app/api/v1/fnb/tabs/[id]/prepare-check/route.ts`

`m.modifierId ?? m.modifier_id ?? ''` and `m.priceAdjustment ?? m.price_adjustment ?? 0` silently default on missing fields. A modifier with a missing ID becomes `''`, which may break downstream catalog lookups. No warning logged.

### F16. GL batch sub-department aggregation scoped to location+date, not batch
**File:** `packages/modules/fnb/src/commands/post-batch-to-gl.ts`

The lazy-populate query for `salesBySubDepartment` filters by `tenant_id`, `location_id`, `business_date`, `tab.status='closed'` but NOT `close_batch_id`. Multiple batches for the same location+date would double-count revenue in journal lines.

### F17. Optional `clientRequestId` in `voidCheck` and `postBatchToGl`
**Files:** `void-check.ts`, `post-batch-to-gl.ts`

Both commands accept optional `clientRequestId`. Callers that omit it get no idempotency protection — retries produce duplicate outbox events.

### F18. `bulkCloseTabs` duplicate `tableId` values
**File:** `packages/modules/fnb/src/commands/bulk-close-tabs.ts`

`dirtyTableIds` array is not deduplicated. If two tabs share the same table (combined tables), the batch UPDATE processes the same row twice. Harmless but wasteful — should use `new Set()`.

### F19. Floor plan context sidebar waitlist shows stale data
**File:** `apps/web/src/components/fnb/floor/WaitlistSidebarContent.tsx`

Uses `useHostDashboard` hook which polls at 15s intervals. In a busy service, the waitlist panel in the POS sidebar can be 15 seconds behind the dedicated host stand view. No realtime trigger for `waitlist` channel on this specific component's data refresh.

---

## Flow Trace Summary — Happy Path vs Actual

### Guest Arrival via Waitlist (Expected)
```
1. Host adds guest          → hostAddToWaitlist ✅
2. Guest waits              → position tracking ✅
3. Table opens              → auto-notify guest ❌ (F2: consumer not wired)
4. Host notifies manually   → notifyWaitlistGuest ✅
5. Guest arrives            → host taps Seat
6. atomicSeatParty          → ❌ NOT CALLED (F1: uses legacy seatFromWaitlist)
   - Tab created            → ❌ NO (F1)
   - Table locked           → ❌ NO (F1)
   - Table status history   → ❌ NO (F1)
   - Turn log entry         → ❌ NO (F1)
   - Waitlist→tab linkage   → ❌ NO (F1)
7. Server opens tab manually → openTab ⚠️ (F5: no version guard)
8. Items added              → addTabItems ✅
9. Course sent to kitchen   → sendCourse ✅
10. Table auto → "ordered"  → ❌ (F2: consumer not wired)
11. Check presented         → presentCheck ✅
12. Table auto → "check"    → ❌ (F2: consumer not wired)
13. Payment → prepare-check → ⚠️ (F4: non-atomic, race-prone)
14. Payment completed       → ✅
15. Table auto → "paid"     → ❌ (F2: consumer not wired)
16. Tab closed              → closeTab ✅
17. Table auto → "dirty"    → ❌ (F2: consumer not wired)
18. Busser marks clean      → autoProgressTableStatus ✅
```

### Guest Arrival via Reservation
```
1. Reservation created      → hostCreateReservation ✅
2. Guest checks in          → checkInReservation ✅
3. Host seats               → seatReservation ⚠️ (F10: table status not updated)
   OR                       → seatGuest via waitlist path (wrong API)
4. Table shows available    → ❌ (F10: floor plan not updated)
5. Server opens tab manually → same issues as above
```

### Floor Plan Display Accuracy
```
Available → Seated:      ✅ (manual seat/openTab updates it)
Seated → Ordered:        ❌ (F2: auto-progression broken)
Ordered → Entrees Fired: ❌ (F2: auto-progression broken)
Any → Check Presented:   ❌ (F2: auto-progression broken)
Any → Paid:              ❌ (F2: auto-progression broken)
Any → Dirty:             ❌ (F2: auto-progression broken)
Dirty → Available:       ✅ (busser mark-clean works)
```

---

## Recommended Fix Priority

| # | Finding | Effort | Impact |
|---|---|---|---|
| F2 | Wire 10 missing event consumers in `instrumentation.ts` | Small (add ~20 `bus.subscribe` lines) | Unblocks table auto-progression, waitlist auto-promotion, guest profiles, analytics |
| F1 | Rewire host stand to use `atomicSeatParty` | Medium (change hook + dialog props) | Correct seating flow with tab creation, table locking, full audit trail |
| F3 | Fix reporting consumer payloads or enrich event payloads | Medium (align ~4 event/consumer pairs) | Correct reporting read models |
| F4 | Wrap `prepare-check` in a transaction or use `SELECT FOR UPDATE` on tab | Medium | Prevent orphan orders and double-prepare race |
| F6 | Add `WHERE status IN ('placed','in_progress')` to `voidCheck` UPDATE | Small | Prevent voiding paid orders |
| F8 | Void/cancel linked orders in `bulkCloseTabs` | Medium | Prevent ghost orders |
| F5 | Add version guard to `openTab` table status upsert | Small | Prevent silent table overwrite |
| F10 | Chain `seatReservation` to update `fnb_table_live_status` | Small | Fix floor plan for reservation flow |
