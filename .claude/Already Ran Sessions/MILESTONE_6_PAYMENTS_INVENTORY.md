# Milestone 6: Payments + Inventory — Sessions 14–15

> **Cash register works. Stock levels track automatically.**

---

# SESSION 14: Tenders Module (Cash Only V1)

## Context

Orders can be placed (Milestone 5). Now we need to record payments. V1 is cash only — the card integration comes in V2. The Tenders module is deliberately simple but modeled to be extensible.

Update PROJECT_BRIEF.md state to reflect Milestones 0–5 complete, then paste below.

---

## Part 1: Schema — 2 Tables

Create `packages/modules/payments/schema.ts`:

### Table: `tenders`
Append-only — a tender is never edited, only reversed.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `locationId` | text | NOT NULL, FK → locations.id |
| `orderId` | text | NOT NULL (FK to orders — but no DB-level FK to avoid cross-module coupling. Enforced in app.) |
| `tenderType` | text | NOT NULL (enum: 'cash', 'card', 'house_account', 'gift_card', 'other') |
| `amount` | integer | NOT NULL (cents) |
| `tipAmount` | integer | NOT NULL, default 0 (cents) |
| `changeGiven` | integer | NOT NULL, default 0 (cents — for cash overpayment) |
| `currency` | text | NOT NULL, default 'USD' |
| `status` | text | NOT NULL, default 'captured' (enum: 'captured', 'reversed') |
| `providerRef` | text | nullable (external payment provider reference — for card payments in V2) |
| `metadata` | jsonb | nullable |
| `createdAt` | timestamptz | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |

Indexes:
- index on `(tenantId, orderId)`
- index on `(tenantId, locationId, createdAt DESC)`

### Table: `refunds` (V2 stub — create schema but no commands yet)

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL |
| `locationId` | text | NOT NULL |
| `orderId` | text | NOT NULL |
| `tenderId` | text | NOT NULL |
| `amount` | integer | NOT NULL (cents) |
| `reason` | text | NOT NULL |
| `status` | text | NOT NULL, default 'pending' (enum: 'pending', 'completed', 'failed') |
| `providerRef` | text | nullable |
| `createdAt` | timestamptz | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |

Create migration + RLS for both tables.

## Part 2: Validation

```typescript
recordTenderSchema: {
  orderId: string (ULID),
  tenderType: enum('cash'),  // V1: only cash. Schema allows others for future.
  amountGiven: number (integer, >= 0, cents — what the customer hands you),
  tipAmount?: number (integer, >= 0, cents),
}
```

## Part 3: Commands

### `recordTender`
1. Validate with `recordTenderSchema`
2. Fetch the order (must exist, must be status 'placed')
3. Calculate how much is still owed:
   - Query existing tenders for this order (sum of amounts)
   - `remaining = order.total - sum(existingTenders.amount)`
   - If remaining <= 0: throw ConflictError('Order is already fully paid')
4. For cash:
   - `tenderAmount = Math.min(amountGiven, remaining)` — you can't tender more than owed
   - `changeGiven = Math.max(0, amountGiven - remaining)` — give change back
5. Use `publishWithOutbox`:
   - Insert tender row
   - Emit `tender.recorded.v1`
6. Audit log
7. Return the tender + change amount

**`tender.recorded.v1` event data:**
```json
{
  "tenderId": "...",
  "orderId": "...",
  "tenderType": "cash",
  "amount": 4452,
  "tipAmount": 0,
  "changeGiven": 48,
  "amountGiven": 4500,
  "orderTotal": 4452,
  "totalTendered": 4452,
  "remainingBalance": 0,
  "isFullyPaid": true
}
```

## Part 4: Event Consumers

The Orders module (from Milestone 5) should already have a consumer for `tender.recorded.v1`. If not, add it now:

**In Orders module — consume `tender.recorded.v1`:**
- When `isFullyPaid: true`: update order status to 'paid', set paidAt
- Emit `order.paid.v1` (new event type)

**In Tenders module — consume `order.voided.v1`:**
- When an order is voided after payment: create reversal tenders (status: 'reversed')
- This is the V1 approach — actual refund processing (back to card) is V2

## Part 5: Queries

### `listTenders`
By orderId or by locationId + date range. Return tender details.

### `getTendersByOrder`
All tenders for a specific order. Include calculated totals: totalTendered, remainingBalance, isFullyPaid.

## Part 6: API Routes

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| POST | `/api/v1/orders/[orderId]/tenders` | `tenders.create` | recordTender |
| GET | `/api/v1/orders/[orderId]/tenders` | `tenders.view` | getTendersByOrder |
| GET | `/api/v1/tenders` | `tenders.view` | listTenders |

Entitlement: `payments`

## Part 7: POS Tender Dialog

Update the POS frontend (from Session 13):

After "Place Order" succeeds, instead of just showing a checkmark, show a **Tender Dialog**:

- Modal overlay with the order total prominently displayed
- "Amount Due: $44.52" in large text
- **Quick select buttons**: exact amount ($44.52), $45, $50, $100
- **Custom amount**: numeric keypad for entering a specific amount
- **Tip field** (optional): small input below the amount
- "Record Payment" button → calls `POST /api/v1/orders/{orderId}/tenders`
- After success: show change due ("Change: $0.48") for 2 seconds, then reset

**UX flow:**
1. Cashier rings up items → taps "Place Order"
2. Order is placed → Tender dialog immediately opens
3. Cashier enters cash amount → taps "Record Payment"
4. Shows change → auto-closes → POS ready for next order

## Part 8: Tests

1. `recordTender` cash — correct amount, change calculated
2. `recordTender` — overpayment calculates correct change
3. `recordTender` — partial payment (customer pays part)
4. `recordTender` — double payment rejected (order already fully paid)
5. `recordTender` — rejected on open order (must be placed first)
6. Event: `tender.recorded.v1` with isFullyPaid=true → order marked as 'paid'
7. Event: `order.voided.v1` → tenders reversed
8. API: POST /api/v1/orders/{id}/tenders → 201
9. API: GET /api/v1/orders/{id}/tenders → returns tender list
10. Tender dialog: quick select buttons work
11. Tender dialog: change calculated and displayed
12. RLS: tenant isolation on tenders

## Verification Checklist — Session 14

- [ ] 2 tables created with RLS
- [ ] Cash tender: amount, change, tip all correct
- [ ] Event flow: tender.recorded → order.paid
- [ ] Void flow: order.voided → tenders reversed
- [ ] POS tender dialog with quick select and numeric keypad
- [ ] All 12 tests pass

---

# SESSION 15: Inventory Module

## Context

Orders emit `order.placed.v1` events (with line items and `isTrackInventory` flags). The Inventory module listens for these events and automatically deducts stock. It also provides manual stock management: receiving, adjustments, transfers, and shrink.

The inventory model is an **append-only movements ledger**. There is NO mutable "stock" column — on-hand quantity is always `SUM(quantity_delta)` for a given item at a given location. This is the most reliable inventory pattern and is the foundation for audit trails and reconciliation.

---

## Part 1: Schema — 2 Tables

Create `packages/modules/inventory/schema.ts`:

### Table: `inventory_items`

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `catalogItemId` | text | NOT NULL |
| `sku` | text | nullable (denormalized from catalog) |
| `name` | text | NOT NULL (denormalized from catalog) |
| `isTracked` | boolean | NOT NULL, default true |
| `lowStockThreshold` | integer | nullable (when on-hand drops below this, emit alert) |
| `createdAt` | timestamptz | NOT NULL, default now() |
| `updatedAt` | timestamptz | NOT NULL, default now() |

Indexes:
- `unique(tenantId, catalogItemId)`
- index on `(tenantId, isTracked)`

### Table: `inventory_movements` (append-only)

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL |
| `locationId` | text | NOT NULL |
| `inventoryItemId` | text | NOT NULL, FK → inventory_items.id |
| `movementType` | text | NOT NULL (enum: 'sale', 'return', 'receive', 'adjust', 'transfer_out', 'transfer_in', 'shrink', 'initial') |
| `quantityDelta` | integer | NOT NULL (positive for adds, negative for deductions) |
| `referenceType` | text | nullable (enum: 'order', 'purchase_order', 'adjustment', 'transfer', 'count') |
| `referenceId` | text | nullable (the ID of the order, PO, etc.) |
| `notes` | text | nullable |
| `createdAt` | timestamptz | NOT NULL, default now() |
| `createdBy` | text | nullable |

Indexes:
- index on `(tenantId, locationId, inventoryItemId, createdAt)`
- index on `(tenantId, locationId, movementType)`
- index on `(referenceType, referenceId)` — for looking up movements by order

**Critical: This table is append-only. Never UPDATE or DELETE movement rows.** Corrections are made by inserting new movements (e.g., an "adjust" movement to fix a count).

Create migration + RLS.

## Part 2: On-Hand Calculation

The on-hand quantity for an item at a location is always computed, never stored:

```typescript
async function getOnHand(tenantId: string, locationId: string, inventoryItemId: string): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(quantity_delta), 0)` })
    .from(inventoryMovements)
    .where(and(
      eq(inventoryMovements.tenantId, tenantId),
      eq(inventoryMovements.locationId, locationId),
      eq(inventoryMovements.inventoryItemId, inventoryItemId),
    ));
  return result[0].total;
}
```

For listing all items with on-hand (used in the inventory list page):
```sql
SELECT ii.*, COALESCE(SUM(im.quantity_delta), 0) AS on_hand
FROM inventory_items ii
LEFT JOIN inventory_movements im 
  ON im.inventory_item_id = ii.id 
  AND im.location_id = $locationId
  AND im.tenant_id = ii.tenant_id
WHERE ii.tenant_id = $tenantId AND ii.is_tracked = true
GROUP BY ii.id
```

## Part 3: Commands

### `receiveInventory`
```typescript
receiveInventorySchema: {
  inventoryItemId: string,
  locationId: string,
  quantity: number (integer, > 0),
  notes?: string
}
```
1. Verify inventory item exists and belongs to tenant
2. `publishWithOutbox`: insert movement (type: 'receive', quantityDelta: +quantity)
3. Emit `inventory.movement.created.v1`
4. Check if on-hand went from below to above low_stock_threshold
5. Audit log

### `adjustInventory`
For physical count corrections:
```typescript
adjustInventorySchema: {
  inventoryItemId: string,
  locationId: string,
  newQuantity: number (integer, >= 0),  // the counted quantity
  reason: string (min 1)
}
```
1. Get current on-hand
2. Calculate delta: `delta = newQuantity - currentOnHand`
3. If delta === 0: no-op
4. `publishWithOutbox`: insert movement (type: 'adjust', quantityDelta: delta)
5. Emit `inventory.movement.created.v1`
6. Audit log with old and new quantities

### `transferInventory`
Move stock between locations:
```typescript
transferInventorySchema: {
  inventoryItemId: string,
  fromLocationId: string,
  toLocationId: string,
  quantity: number (integer, > 0),
  notes?: string
}
```
1. Verify both locations belong to tenant
2. Verify on-hand at source >= quantity (don't allow negative)
3. `publishWithOutbox`: insert TWO movements in the same transaction:
   - `transfer_out` at fromLocationId (quantityDelta: -quantity)
   - `transfer_in` at toLocationId (quantityDelta: +quantity)
4. Emit `inventory.transfer.completed.v1`
5. Audit log

### `recordShrink`
For theft, damage, spoilage:
```typescript
recordShrinkSchema: {
  inventoryItemId: string,
  locationId: string,
  quantity: number (integer, > 0),
  reason: string (min 1)
}
```
1. Insert movement (type: 'shrink', quantityDelta: -quantity)
2. Emit `inventory.movement.created.v1`
3. Audit log

## Part 4: Event Consumers — The Automatic Glue

### Consume `order.placed.v1`
When an order is placed, automatically deduct inventory for tracked items:
```typescript
async function handleOrderPlaced(event: EventEnvelope) {
  const data = event.data as OrderPlacedEventData;
  
  for (const line of data.lines) {
    if (!line.isTrackInventory) continue;
    
    // Find the inventory item by catalogItemId
    const inventoryItem = await findByCatalogItemId(data.tenantId, line.catalogItemId);
    if (!inventoryItem || !inventoryItem.isTracked) continue;
    
    // Create a sale movement
    await insertMovement({
      tenantId: data.tenantId,
      locationId: data.locationId,
      inventoryItemId: inventoryItem.id,
      movementType: 'sale',
      quantityDelta: -(line.qty),
      referenceType: 'order',
      referenceId: data.orderId,
    });
    
    // Check low stock
    const onHand = await getOnHand(data.tenantId, data.locationId, inventoryItem.id);
    if (inventoryItem.lowStockThreshold && onHand <= inventoryItem.lowStockThreshold) {
      // Emit low stock alert
      await publishEvent(buildEvent({
        eventType: 'inventory.low_stock.v1',
        tenantId: data.tenantId,
        locationId: data.locationId,
        data: { inventoryItemId: inventoryItem.id, name: inventoryItem.name, onHand, threshold: inventoryItem.lowStockThreshold },
      }));
    }
  }
}
```

### Consume `order.voided.v1`
When an order is voided, return the inventory:
```typescript
async function handleOrderVoided(event: EventEnvelope) {
  // Find all sale movements referencing this order
  const saleMovements = await db.select().from(inventoryMovements).where(and(
    eq(inventoryMovements.referenceType, 'order'),
    eq(inventoryMovements.referenceId, event.data.orderId),
    eq(inventoryMovements.movementType, 'sale'),
  ));
  
  // Create return movements to reverse each sale
  for (const movement of saleMovements) {
    await insertMovement({
      tenantId: event.tenantId,
      locationId: movement.locationId,
      inventoryItemId: movement.inventoryItemId,
      movementType: 'return',
      quantityDelta: Math.abs(movement.quantityDelta), // positive — returning stock
      referenceType: 'order',
      referenceId: event.data.orderId,
    });
  }
}
```

### Consume `catalog.item.created.v1`
Auto-create an inventory item when a catalog item is created with `isTrackInventory: true`:
```typescript
async function handleCatalogItemCreated(event: EventEnvelope) {
  if (!event.data.isTrackInventory) return;
  
  // Create inventory_items row
  await db.insert(inventoryItems).values({
    tenantId: event.tenantId,
    catalogItemId: event.data.itemId,
    sku: event.data.sku,
    name: event.data.name,
    isTracked: true,
  }).onConflictDoNothing(); // idempotent
}
```

## Part 5: Queries

### `listInventoryItems`
```typescript
interface ListInventoryParams {
  tenantId: string;
  locationId: string;  // on-hand is location-specific
  search?: string;     // search name/SKU
  isTracked?: boolean;
  belowThreshold?: boolean; // only show low stock
  cursor?: string;
  limit?: number;
}
```
Returns items with calculated on_hand. Uses the GROUP BY query from Part 2.

### `getInventoryItem`
Single item with: on-hand at each location, recent movements, low stock threshold.

### `getMovements`
Movement history for an item at a location. Cursor pagination, sorted by createdAt DESC.

## Part 6: API Routes

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| GET | `/api/v1/inventory` | `inventory.view` | listInventoryItems |
| GET | `/api/v1/inventory/[itemId]` | `inventory.view` | getInventoryItem |
| GET | `/api/v1/inventory/[itemId]/movements` | `inventory.view` | getMovements |
| POST | `/api/v1/inventory/receive` | `inventory.receive` | receiveInventory |
| POST | `/api/v1/inventory/adjust` | `inventory.adjust` | adjustInventory |
| POST | `/api/v1/inventory/transfer` | `inventory.transfer` | transferInventory |
| POST | `/api/v1/inventory/shrink` | `inventory.adjust` | recordShrink |

Entitlement: `inventory`

## Part 7: Inventory Frontend

Create `apps/web/app/(dashboard)/inventory/page.tsx`:

Replace the placeholder with a real inventory management page:

**Inventory List:**
- DataTable: Item Name, SKU, On Hand, Low Stock Threshold, Status
- Status column: green "In Stock" if on-hand > threshold, yellow "Low Stock" if at/below threshold, red "Out of Stock" if 0
- Location selector at the top (on-hand is per-location)
- Search by name/SKU
- "Low Stock Only" filter toggle

**Action Buttons:**
- "Receive" → opens Receive dialog
- "Adjust" → opens Adjust dialog
- "Transfer" → opens Transfer dialog (location to location)

**Receive Dialog:**
- Select item (searchable dropdown)
- Quantity input
- Notes (optional)
- Submit → calls POST /api/v1/inventory/receive

**Adjust Dialog:**
- Select item
- Current on-hand displayed (read-only)
- New quantity input
- Reason (required)
- Submit → calls POST /api/v1/inventory/adjust

**Transfer Dialog:**
- Select item
- From location (current)
- To location (dropdown of other locations)
- Quantity (cannot exceed on-hand at source)
- Notes (optional)
- Submit → calls POST /api/v1/inventory/transfer

**Movement History:**
Click an item row → navigate to detail page showing movement history:
- Table: Date, Type (badge), Quantity (+/-), Reference, Notes, By
- Movement type badges: Sale (blue), Receive (green), Adjust (yellow), Transfer (purple), Shrink (red)

## Part 8: Tests

1. `receiveInventory` — on-hand increases
2. `adjustInventory` — on-hand set to exact count, delta movement created
3. `adjustInventory` no-op — same quantity, no movement created
4. `transferInventory` — source decreases, destination increases
5. `transferInventory` — rejected when insufficient stock
6. `recordShrink` — on-hand decreases
7. Event: `order.placed.v1` → sale movements created for tracked items
8. Event: `order.placed.v1` → non-tracked items ignored
9. Event: `order.voided.v1` → return movements created
10. Event: `catalog.item.created.v1` with isTrackInventory → inventory item auto-created
11. Low stock alert emitted when on-hand drops below threshold
12. On-hand calculation correct with mixed movement types
13. API: list items with on-hand at specific location
14. API: movement history with pagination
15. RLS: tenant isolation
16. Inventory list page renders with stock levels
17. Receive dialog works end-to-end
18. Transfer dialog validates sufficient stock

## Verification Checklist — Session 15

- [ ] 2 tables with append-only movements
- [ ] On-hand calculated from SUM(quantity_delta), never stored
- [ ] 4 manual commands: receive, adjust, transfer, shrink
- [ ] 3 event consumers: order.placed, order.voided, catalog.item.created
- [ ] Low stock alerts
- [ ] 7 API routes
- [ ] Inventory frontend: list, receive, adjust, transfer dialogs, movement history
- [ ] All 18 tests pass

**Update PROJECT_BRIEF.md** state:
```
Next: Milestone 7 — Customers + Reporting + Billing
```

Build it now. Don't explain — just write the code.
