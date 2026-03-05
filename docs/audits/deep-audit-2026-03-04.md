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
