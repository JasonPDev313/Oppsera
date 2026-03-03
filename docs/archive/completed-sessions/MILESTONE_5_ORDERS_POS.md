# Milestone 5: Orders + POS — Sessions 12–13

> **The first revenue-generating module. A cashier can ring up a sale.**

---

## How to Use This Prompt

Update your `PROJECT_BRIEF.md` → "Current Project State" to reflect Milestones 0–4 complete, then paste the session you're working on.

---

# SESSION 12: Orders Module — Backend

## Context

The Catalog module is complete (Milestone 3) and provides the internal read API for price lookups. The Onboarding flow is complete (Milestone 4). Now we build the Orders module — the core transaction engine for POS.

An order in OppsEra is a container for line items that goes through a lifecycle: `open → placed → paid → voided`. This session builds the backend; Session 13 builds the POS frontend.

## Part 1: Drizzle Schema — 3 Tables + 1 Helper

Create `packages/modules/orders/schema.ts`:

### Table 1: `orders`

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `locationId` | text | NOT NULL, FK → locations.id |
| `orderNumber` | text | NOT NULL (location-scoped sequential: "0001", "0002", etc.) |
| `status` | text | NOT NULL, default 'open' (enum: open, placed, paid, voided, refunded) |
| `source` | text | NOT NULL, default 'pos' (enum: pos, online, admin) |
| `customerId` | text | nullable (FK → customers table, built in M7) |
| `subtotal` | integer | NOT NULL, default 0 (cents) |
| `taxTotal` | integer | NOT NULL, default 0 (cents) |
| `discountTotal` | integer | NOT NULL, default 0 (cents) |
| `total` | integer | NOT NULL, default 0 (cents) |
| `notes` | text | nullable |
| `metadata` | jsonb | nullable |
| `placedAt` | timestamptz | nullable (set when status changes to 'placed') |
| `paidAt` | timestamptz | nullable (set when fully paid) |
| `voidedAt` | timestamptz | nullable |
| `voidReason` | text | nullable |
| `createdAt` | timestamptz | NOT NULL, default now() |
| `updatedAt` | timestamptz | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |
| `updatedBy` | text | NOT NULL |

Indexes:
- `unique(tenantId, locationId, orderNumber)`
- index on `(tenantId, locationId, status)`
- index on `(tenantId, locationId, createdAt DESC)`
- index on `(tenantId, customerId)` WHERE customerId IS NOT NULL

### Table 2: `order_lines`

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `locationId` | text | NOT NULL, FK → locations.id |
| `orderId` | text | NOT NULL, FK → orders.id |
| `catalogItemId` | text | NOT NULL |
| `catalogItemName` | text | NOT NULL (denormalized — snapshot at time of sale) |
| `catalogItemSku` | text | nullable (denormalized) |
| `qty` | integer | NOT NULL, default 1 |
| `unitPrice` | integer | NOT NULL (cents — effective price at time of sale) |
| `lineSubtotal` | integer | NOT NULL (cents — qty * unitPrice) |
| `lineTax` | integer | NOT NULL, default 0 (cents) |
| `lineTotal` | integer | NOT NULL (cents — lineSubtotal + lineTax) |
| `taxRate` | integer | NOT NULL, default 0 (basis points — snapshot) |
| `modifiers` | jsonb | nullable (array of { name, priceAdjustment } — snapshot) |
| `notes` | text | nullable |
| `createdAt` | timestamptz | NOT NULL, default now() |

Indexes:
- index on `(orderId)`
- index on `(tenantId, catalogItemId)`

### Table 3: `order_discounts`

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `orderId` | text | NOT NULL, FK → orders.id |
| `type` | text | NOT NULL (enum: 'percentage', 'fixed') |
| `value` | integer | NOT NULL (percentage: basis points e.g. 1000 = 10%; fixed: cents) |
| `amount` | integer | NOT NULL (cents — the actual discount amount applied) |
| `reason` | text | nullable |
| `createdBy` | text | NOT NULL |
| `createdAt` | timestamptz | NOT NULL, default now() |

### Helper Table: `order_counters`
For generating sequential order numbers per location:

| Column | Type | Constraints |
|--------|------|------------|
| `tenantId` | text | NOT NULL |
| `locationId` | text | NOT NULL |
| `lastNumber` | integer | NOT NULL, default 0 |
| PK | | composite (tenantId, locationId) |

## Part 2: Migration + RLS

Generate migration for all 4 tables. Add RLS policies (4 per table: SELECT, INSERT, UPDATE, DELETE) on orders, order_lines, order_discounts, and order_counters.

## Part 3: Zod Validation Schemas

Create `packages/modules/orders/validation.ts`:

```typescript
// Opening an order (creating a new empty order)
openOrderSchema: { source?: 'pos' | 'online' | 'admin', notes?: string, customerId?: string }

// Adding a line item
addLineItemSchema: {
  catalogItemId: string (ULID),
  qty: number (integer, >= 1),
  modifiers?: Array<{ modifierId: string, name: string, priceAdjustment: number }>,
  notes?: string
}

// Removing a line item
removeLineItemSchema: { lineItemId: string (ULID) }

// Applying a discount
applyDiscountSchema: {
  type: 'percentage' | 'fixed',
  value: number (> 0),
  reason?: string
}

// Placing an order (finalizing — calculates tax and locks it)
placeOrderSchema: {} // no body needed, just the order ID from URL

// Voiding an order
voidOrderSchema: { reason: string (min 1, max 500) }
```

## Part 4: Order Number Generation

Create a helper that generates sequential order numbers per location:

```typescript
async function getNextOrderNumber(tx: DrizzleTransaction, tenantId: string, locationId: string): Promise<string> {
  // Upsert the counter and get the next number atomically
  const result = await tx.execute(sql`
    INSERT INTO order_counters (tenant_id, location_id, last_number)
    VALUES (${tenantId}, ${locationId}, 1)
    ON CONFLICT (tenant_id, location_id)
    DO UPDATE SET last_number = order_counters.last_number + 1
    RETURNING last_number
  `);
  
  return String(result.rows[0].last_number).padStart(4, '0');
}
```

This gives location-scoped sequential numbers: 0001, 0002, 0003...
The SELECT ... FOR UPDATE ensures no duplicates under concurrency.

## Part 5: Tax Calculation

Create `packages/modules/orders/tax.ts`:

```typescript
/**
 * Calculate tax for a line item using the catalog's tax category rate.
 * 
 * @param lineSubtotal - in cents
 * @param taxRate - in basis points (825 = 8.25%)
 * @returns tax amount in cents (rounded to nearest cent)
 */
export function calculateLineTax(lineSubtotal: number, taxRate: number): number {
  if (taxRate === 0) return 0;
  return Math.round(lineSubtotal * taxRate / 10000);
}
```

## Part 6: Order Totals Recalculation

Create a pure function that recalculates order totals from lines and discounts:

```typescript
interface OrderTotals {
  subtotal: number;   // sum of line subtotals (cents)
  taxTotal: number;   // sum of line taxes (cents)
  discountTotal: number; // sum of discount amounts (cents)
  total: number;      // subtotal + taxTotal - discountTotal (cents)
}

export function recalculateOrderTotals(
  lines: Array<{ lineSubtotal: number; lineTax: number }>,
  discounts: Array<{ amount: number }>,
): OrderTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
  const taxTotal = lines.reduce((sum, l) => sum + l.lineTax, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = Math.max(0, subtotal + taxTotal - discountTotal);
  return { subtotal, taxTotal, discountTotal, total };
}
```

## Part 7: Command Implementations

### `openOrder`
1. Validate with `openOrderSchema`
2. Generate order number via `getNextOrderNumber`
3. Use `publishWithOutbox`:
   - Insert order row (status: 'open', all totals: 0)
   - Emit `order.opened.v1`
4. Audit log
5. Return the order with its order number

### `addLineItem`
1. Validate with `addLineItemSchema`
2. Fetch the order (must exist, must be status 'open')
3. Fetch catalog item via internal API: `catalogApi.getItemForPOS(tenantId, locationId, catalogItemId)`
   - This returns the effective price (with location override) and tax rate
4. Calculate modifier price adjustments (sum of priceAdjustment from selected modifiers)
5. `unitPrice = effectivePrice + modifierAdjustments`
6. `lineSubtotal = unitPrice * qty`
7. `lineTax = calculateLineTax(lineSubtotal, taxRate)`
8. `lineTotal = lineSubtotal + lineTax`
9. Use `publishWithOutbox`:
   - Insert order_line row with all calculated values
   - Denormalize: snapshot item name, SKU, modifiers, tax rate (in case catalog changes later)
   - Recalculate and update order totals
   - Emit `order.line_added.v1`
10. Audit log
11. Return the updated order with all lines

### `removeLineItem`
1. Validate
2. Fetch the order (must be status 'open')
3. Fetch the line item (must belong to this order)
4. Use `publishWithOutbox`:
   - Delete the order_line row
   - Recalculate and update order totals
   - Emit `order.line_removed.v1`
5. Audit log
6. Return the updated order

### `applyDiscount`
1. Validate with `applyDiscountSchema`
2. Fetch the order (must be status 'open')
3. Calculate discount amount:
   - If type 'percentage': `amount = Math.round(order.subtotal * value / 10000)` (value in basis points)
   - If type 'fixed': `amount = value` (already in cents)
4. Use `publishWithOutbox`:
   - Insert order_discount row
   - Recalculate and update order totals
   - Emit `order.discount_applied.v1`
5. Audit log
6. Return the updated order

### `placeOrder`
1. Fetch the order (must be status 'open')
2. Verify order has at least one line item
3. Use `publishWithOutbox`:
   - Final recalculation of totals (in case anything was missed)
   - Update status to 'placed', set placedAt to now()
   - Emit `order.placed.v1` — THIS IS THE CRITICAL EVENT that triggers inventory deduction and other downstream effects
4. Audit log
5. Return the finalized order

**Important: `order.placed.v1` event data should include:**
```json
{
  "orderId": "...",
  "orderNumber": "0042",
  "locationId": "...",
  "status": "placed",
  "totals": { "subtotal": 4200, "taxTotal": 252, "discountTotal": 0, "total": 4452 },
  "lines": [
    {
      "catalogItemId": "...",
      "catalogItemName": "Classic Burger",
      "qty": 2,
      "unitPrice": 1499,
      "lineSubtotal": 2998,
      "lineTax": 180,
      "isTrackInventory": true
    }
  ],
  "customerId": null
}
```

Include `isTrackInventory` in each line so the Inventory module knows which items to deduct.

### `voidOrder`
1. Validate with `voidOrderSchema`
2. Fetch the order (must be status 'placed' or 'paid')
3. Use `publishWithOutbox`:
   - Update status to 'voided', set voidedAt, voidReason
   - Emit `order.voided.v1`
4. Audit log
5. Return the voided order

## Part 8: Event Definitions

```typescript
// Events emitted by the Orders module:
'order.opened.v1'           — data: { orderId, orderNumber, locationId, source }
'order.line_added.v1'       — data: { orderId, lineId, catalogItemId, qty, unitPrice, lineTotal }
'order.line_removed.v1'     — data: { orderId, lineId, catalogItemId }
'order.discount_applied.v1' — data: { orderId, discountId, type, value, amount }
'order.placed.v1'           — data: { orderId, orderNumber, locationId, totals, lines[], customerId }
'order.voided.v1'           — data: { orderId, orderNumber, reason, totals }

// Events consumed by the Orders module:
'tender.recorded.v1' — when a tender is recorded against an order, update order status to 'paid'
  (handler: check if total tenders >= order total, if so set status = 'paid', set paidAt)
```

Register event consumers and contracts.

## Part 9: Queries

Create `packages/modules/orders/queries/`:

### `listOrders`
```typescript
interface ListOrdersParams {
  tenantId: string;
  locationId?: string;   // filter by location
  status?: string;       // filter by status
  customerId?: string;   // filter by customer
  from?: string;         // date range start
  to?: string;           // date range end
  cursor?: string;
  limit?: number;        // default 50
}
```
Returns orders with basic info (no lines). Sorted by createdAt DESC.

### `getOrder`
Returns a single order with all lines and discounts. Include:
- Order header (all fields)
- Lines array (with denormalized item info)
- Discounts array
- Tenders array (empty for now — Milestone 6 will populate)

### `getOrderByNumber`
Look up by orderNumber + locationId (for receipt printing, customer lookup).

## Part 10: API Routes

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| GET | `/api/v1/orders` | `orders.view` | listOrders |
| POST | `/api/v1/orders` | `orders.create` | openOrder |
| GET | `/api/v1/orders/[orderId]` | `orders.view` | getOrder |
| POST | `/api/v1/orders/[orderId]/lines` | `orders.create` | addLineItem |
| DELETE | `/api/v1/orders/[orderId]/lines/[lineId]` | `orders.create` | removeLineItem |
| POST | `/api/v1/orders/[orderId]/discounts` | `orders.create` | applyDiscount |
| POST | `/api/v1/orders/[orderId]/place` | `orders.create` | placeOrder |
| POST | `/api/v1/orders/[orderId]/void` | `orders.void` | voidOrder |

All routes use entitlement: `'pos_retail'`.

## Part 11: Tests

1. `openOrder` — creates order with status 'open', sequential number
2. `addLineItem` — adds line with correct price from catalog, tax calculated
3. `addLineItem` with modifiers — price adjustments applied correctly
4. `addLineItem` — order totals recalculated
5. `removeLineItem` — line removed, totals recalculated
6. `applyDiscount` percentage — correct amount calculated from subtotal
7. `applyDiscount` fixed — exact amount applied
8. `placeOrder` — status changes to 'placed', emits `order.placed.v1`
9. `placeOrder` on empty order — rejected (needs at least one line)
10. `voidOrder` — status changes to 'voided', reason recorded
11. `voidOrder` on open order — rejected (must be placed first)
12. Order number sequence — two orders at same location get sequential numbers
13. Order number per location — different locations have independent sequences
14. Tax calculation — 8.25% on $14.99 = correct cents
15. Totals recalculation — pure function tested with various inputs
16. `order.placed.v1` event — contains all required data including lines
17. Event consumer: `tender.recorded.v1` → marks order as paid
18. API: GET /api/v1/orders → returns list with pagination
19. API: permission enforcement — viewer can GET, cannot POST
20. RLS: tenant A cannot see tenant B's orders

## Verification Checklist — Session 12

- [ ] 4 tables created with RLS
- [ ] 6 commands implemented with publishWithOutbox pattern
- [ ] Sequential order numbers per location
- [ ] Tax calculation correct (basis points)
- [ ] Totals always consistent with lines + discounts
- [ ] 6 event types emitted, 1 consumed
- [ ] 8 API routes working
- [ ] 20 tests pass
- [ ] Catalog internal API used for price lookups (no direct catalog DB access)

---

# SESSION 13: POS Frontend

## Context

Session 12 is complete — the Orders module has all backend logic. Now build the POS interface.

## Part 1: POS Page Layout

Create `apps/web/app/(dashboard)/pos/page.tsx`:

**Two-panel split layout:**
- **Left panel (65% width)**: Product grid — shows catalog items as clickable tiles
- **Right panel (35% width)**: Cart — current order with line items, totals, and action buttons

The POS is optimized for touch screens (large tap targets) and speed.

## Part 2: Product Grid (Left Panel)

- Fetch catalog items via `GET /api/v1/catalog/items?isActive=true&limit=200`
- Display as a grid of cards (4 columns desktop, 2 columns tablet, 1 column mobile)
- Each card shows: item name, price (formatted), category color indicator
- Category filter tabs across the top (fetch from catalog categories)
- Search bar above the grid
- Tap a card → if item has modifier groups, show modifier selection popup. Otherwise, add directly to cart.

**Modifier Selection Popup:**
- Modal that appears when tapping an item with modifier groups
- For each modifier group: show the group name, selection type (single/multi), required badge
- Radio buttons for 'single' selection, checkboxes for 'multi'
- Pre-select any default modifiers
- Show price adjustment next to each modifier (+$1.50)
- "Add to Order" button at the bottom with the calculated total for this item

## Part 3: Cart (Right Panel)

- Shows the current order's line items
- Each line: item name, qty, unit price, line total, remove button (X)
- If modifiers: show them below the item name in smaller text
- Quantity adjustment: +/- buttons on each line
- Running totals at the bottom: Subtotal, Tax, Discount (if any), **Total** (bold, large)
- Action buttons:
  - "Discount" button → opens discount dialog
  - "Place Order" button (primary, large, indigo) → calls placeOrder
  - "Void" button (small, red text) → opens confirm dialog with reason input

**When cart is empty:**
- Show a friendly empty state: "Start by tapping a product"

## Part 4: Discount Dialog

- Modal with two tabs: "Percentage" and "Fixed Amount"
- Percentage tab: input for percentage (e.g., "10"), preview of amount
- Fixed tab: CurrencyInput for dollar amount
- Optional reason field
- "Apply Discount" button
- Shows in the cart as a negative line: "10% Discount: -$4.45"

## Part 5: Place Order Flow

When "Place Order" is tapped:
1. Call `POST /api/v1/orders/{orderId}/place`
2. Show brief success state (green checkmark, "Order #0042 placed!")
3. After 1.5 seconds, clear the cart and show the empty state (ready for next order)
4. The Tender dialog (cash/card payment) is built in Milestone 6 — for now, placing the order is the final step

**Important UX:** The POS must feel fast. Use optimistic updates where safe:
- Adding items to cart: update the UI immediately, then confirm with the API
- Place order: show loading state on the button, disable double-clicks

## Part 6: Order History

Create `apps/web/app/(dashboard)/orders/page.tsx`:

Replace the placeholder with a real orders list:
- DataTable with columns: Order #, Date/Time, Status (badge), Items (count), Total, Source
- Filters: status dropdown, date range, location
- Click a row → navigate to order detail page
- Sorted by createdAt DESC (most recent first)

Create `apps/web/app/(dashboard)/orders/[orderId]/page.tsx`:

Order detail page:
- Order header: order number, status badge, date/time, source, created by
- Line items table: item name, SKU, qty, unit price, tax, line total, modifiers
- Discounts section (if any)
- Tenders section (empty for now — "No payments recorded")
- Totals summary: subtotal, tax, discounts, total
- Actions: "Void Order" button (if status is 'placed' or 'paid')

## Part 7: POS Data Hooks

Create hooks in `apps/web/hooks/`:

### `usePOS`
```typescript
function usePOS(locationId: string) {
  // Manages the current order state
  // - currentOrder: Order | null
  // - openOrder(): creates a new order
  // - addItem(catalogItemId, qty, modifiers?): adds line item
  // - removeItem(lineId): removes line item
  // - applyDiscount(type, value, reason?): applies discount
  // - placeOrder(): finalizes the order
  // - voidOrder(reason): voids the order
  // - clearOrder(): resets to empty state (after place/void)
  // - isLoading: boolean
}
```

### `useCatalogForPOS`
```typescript
function useCatalogForPOS() {
  // Fetches catalog items optimized for POS
  // - items: grouped by category
  // - categories: for filter tabs
  // - searchItems(query): filtered results
  // - isLoading: boolean
}
```

## Part 8: Navigation Update

Update the dashboard sidebar:
- Add "POS" link with a cash register icon → `/pos`
- Keep "Orders" link → `/orders` (for order history)
- POS link should be visually prominent (it's the primary workflow)

## Part 9: Tests

1. POS page renders with product grid and empty cart
2. Tapping a product adds it to cart
3. Tapping a product with modifiers shows modifier popup
4. Modifier selection calculates correct price
5. Cart shows running totals correctly
6. Quantity adjustment (+/-) works
7. Remove item from cart works
8. Discount dialog applies percentage correctly
9. Discount dialog applies fixed amount correctly
10. Place order: calls API, shows success, clears cart
11. Place order: disabled when cart is empty
12. Order history page loads and displays orders
13. Order detail page shows all order info
14. POS sends X-Location-Id header with all requests

## Verification Checklist — Session 13

- [ ] POS page: two-panel layout, product grid + cart
- [ ] Category filter tabs work
- [ ] Search filters products
- [ ] Modifier popup works for items with modifier groups
- [ ] Cart: add, remove, adjust qty, running totals
- [ ] Discount: percentage and fixed, applied correctly
- [ ] Place Order: API call, success state, cart reset
- [ ] Order history: list with filters, detail page
- [ ] Mobile responsive (stacked layout on small screens)
- [ ] All 14 tests pass
- [ ] `pnpm turbo build` — clean

**Update PROJECT_BRIEF.md** state:
```
Next: Milestone 6 — Payments + Inventory
```

Build it now. Don't explain — just write the code.
