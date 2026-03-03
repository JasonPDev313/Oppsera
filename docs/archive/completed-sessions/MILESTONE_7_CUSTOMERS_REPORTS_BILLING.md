# Milestone 7: Customers + Reporting + Billing — Sessions 16–18

> **Know your customers. See your numbers. Get paid.**

---

# SESSION 16: Customers Module

## Context

Orders exist, payments work, inventory tracks. Now we add customer profiles so businesses can associate purchases with people, track visit/spend history, and prepare for marketing automation (V2).

Update PROJECT_BRIEF.md state to reflect Milestones 0–6 complete, then paste below.

---

## Part 1: Schema

Create `packages/modules/customers/schema.ts`:

### Table: `customers`

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `email` | text | nullable |
| `phone` | text | nullable |
| `firstName` | text | nullable |
| `lastName` | text | nullable |
| `displayName` | text | NOT NULL (computed: firstName + lastName, or email, or phone) |
| `notes` | text | nullable |
| `tags` | jsonb | NOT NULL, default '[]' (array of strings for segmentation) |
| `marketingConsent` | boolean | NOT NULL, default false |
| `totalVisits` | integer | NOT NULL, default 0 |
| `totalSpend` | integer | NOT NULL, default 0 (cents — lifetime) |
| `lastVisitAt` | timestamptz | nullable |
| `metadata` | jsonb | nullable |
| `createdAt` | timestamptz | NOT NULL, default now() |
| `updatedAt` | timestamptz | NOT NULL, default now() |
| `createdBy` | text | nullable |

Indexes:
- `unique(tenantId, email)` WHERE email IS NOT NULL
- `unique(tenantId, phone)` WHERE phone IS NOT NULL
- index on `(tenantId, displayName)` for search
- index on `(tenantId, lastVisitAt DESC)`
- GIN index on `(tenantId, tags)` for tag-based queries

Create migration + RLS.

## Part 2: Commands

### `createCustomer`
```typescript
createCustomerSchema: {
  email?: string (valid email, lowercased, trimmed),
  phone?: string (trimmed, min 7),
  firstName?: string (trimmed, max 100),
  lastName?: string (trimmed, max 100),
  notes?: string (max 2000),
  tags?: string[],
  marketingConsent?: boolean
}
```
- At least one of email, phone, or firstName must be provided
- Compute displayName from name parts, falling back to email, then phone
- Check uniqueness on email and phone within tenant
- Emit `customer.created.v1`
- Audit log

### `updateCustomer`
- All fields optional
- Recompute displayName if name fields change
- Check uniqueness on email/phone if changed
- Use `computeChanges` for audit diff
- Emit `customer.updated.v1`

### `mergeCustomers`
```typescript
mergeCustomersSchema: {
  primaryId: string,    // the customer to keep
  duplicateId: string,  // the customer to merge into primary
}
```
1. Load both customers (must belong to same tenant)
2. Merge: take primary's fields unless null, then fall back to duplicate's fields
3. Update totalVisits = sum, totalSpend = sum
4. Update all orders referencing duplicateId to point to primaryId
5. Soft-delete the duplicate (or hard delete)
6. Emit `customer.merged.v1`
7. Audit log

## Part 3: Event Consumers

### Consume `order.placed.v1`
If the order has a customerId:
- Increment totalVisits by 1
- Add order total to totalSpend
- Set lastVisitAt to now
- No event emitted (this is a denormalized counter update)

### Consume `tender.recorded.v1`
Could also update spend tracking here if preferred over order.placed. Choose one approach and be consistent.

## Part 4: Queries

### `listCustomers`
- Search across displayName, email, phone (ILIKE)
- Filter by tags
- Sort by lastVisitAt DESC (default), displayName ASC, totalSpend DESC
- Cursor pagination

### `getCustomer`
- Full profile + recent orders (last 10, fetched via orders query — or denormalized)

### `searchCustomers`
- Quick search for POS (type-ahead): returns id, displayName, email in <100ms
- Limit 10 results

## Part 5: API Routes

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| GET | `/api/v1/customers` | `customers.view` | listCustomers |
| POST | `/api/v1/customers` | `customers.create` | createCustomer |
| GET | `/api/v1/customers/[id]` | `customers.view` | getCustomer |
| PATCH | `/api/v1/customers/[id]` | `customers.update` | updateCustomer |
| POST | `/api/v1/customers/merge` | `customers.merge` | mergeCustomers |
| GET | `/api/v1/customers/search` | `customers.view` | searchCustomers |

Entitlement: `customers`

## Part 6: Frontend

Create `apps/web/app/(dashboard)/customers/page.tsx`:

**Customer List:**
- DataTable: Name, Email, Phone, Visits, Total Spend, Last Visit
- Search bar (searches name, email, phone)
- "Add Customer" button → dialog
- Click row → customer detail page

**Customer Detail Page** (`/customers/[id]`):
- Profile card: name, email, phone, tags, notes, marketing consent
- Stats card: total visits, total spend (formatted), last visit date
- "Edit" button → edit dialog
- Recent orders list (if available)

**POS Integration:**
Update the POS page (from Session 13) to support attaching a customer to an order:
- "Customer" button in the cart panel
- Opens a search dialog with type-ahead
- Select a customer → attaches customerId to the order
- Customer name displayed in the cart header
- "Quick Add" option to create a new customer inline (name + phone/email)

## Part 7: Tests

1. `createCustomer` — creates with email, displayName computed
2. `createCustomer` — duplicate email rejected
3. `createCustomer` — at least one identifier required
4. `updateCustomer` — updates fields, audit logged with changes
5. `mergeCustomers` — totals combined, orders reassigned
6. `searchCustomers` — finds by partial name, email, phone
7. Event: `order.placed.v1` with customerId → visit count and spend updated
8. API: list with search and pagination
9. RLS: tenant isolation
10. POS: customer search dialog works

## Verification Checklist — Session 16

- [ ] customers table with proper indexes and RLS
- [ ] CRUD + merge + search commands
- [ ] Event consumer updates visit/spend counters
- [ ] Customer list and detail pages
- [ ] POS customer attachment working
- [ ] All 10 tests pass

---

# SESSION 17: Reporting Module

## Context

We have orders, payments, inventory, and customers flowing through the event system. The Reporting module builds **read models** from events — denormalized, pre-aggregated tables optimized for fast reporting queries. This avoids the legacy anti-pattern of running complex analytics against OLTP tables.

---

## Part 1: Read Model Tables

Create `packages/modules/reporting/schema.ts`:

### Table: `rm_daily_sales`
Pre-aggregated daily sales by location.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL |
| `locationId` | text | NOT NULL |
| `businessDate` | date | NOT NULL (in the location's timezone) |
| `orderCount` | integer | NOT NULL, default 0 |
| `grossSales` | integer | NOT NULL, default 0 (cents — subtotal before discounts) |
| `discountTotal` | integer | NOT NULL, default 0 (cents) |
| `taxTotal` | integer | NOT NULL, default 0 (cents) |
| `netSales` | integer | NOT NULL, default 0 (cents — gross - discounts + tax) |
| `tenderCash` | integer | NOT NULL, default 0 (cents) |
| `tenderCard` | integer | NOT NULL, default 0 (cents — V2) |
| `voidCount` | integer | NOT NULL, default 0 |
| `voidTotal` | integer | NOT NULL, default 0 (cents) |
| `avgOrderValue` | integer | NOT NULL, default 0 (cents) |
| `updatedAt` | timestamptz | NOT NULL, default now() |

Unique: `(tenantId, locationId, businessDate)`

### Table: `rm_item_sales`
Per-item sales aggregation.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL |
| `locationId` | text | NOT NULL |
| `businessDate` | date | NOT NULL |
| `catalogItemId` | text | NOT NULL |
| `catalogItemName` | text | NOT NULL |
| `quantitySold` | integer | NOT NULL, default 0 |
| `grossRevenue` | integer | NOT NULL, default 0 (cents) |
| `updatedAt` | timestamptz | NOT NULL, default now() |

Unique: `(tenantId, locationId, businessDate, catalogItemId)`

### Table: `rm_inventory_on_hand`
Snapshot of inventory levels (updated on every movement event).

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL |
| `locationId` | text | NOT NULL |
| `inventoryItemId` | text | NOT NULL |
| `itemName` | text | NOT NULL |
| `onHand` | integer | NOT NULL |
| `lowStockThreshold` | integer | nullable |
| `isBelowThreshold` | boolean | NOT NULL, default false |
| `updatedAt` | timestamptz | NOT NULL, default now() |

Unique: `(tenantId, locationId, inventoryItemId)`

### Table: `rm_customer_activity`
Customer visit/spend summary.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL |
| `customerId` | text | NOT NULL |
| `customerName` | text | NOT NULL |
| `totalVisits` | integer | NOT NULL, default 0 |
| `totalSpend` | integer | NOT NULL, default 0 (cents) |
| `lastVisitAt` | timestamptz | nullable |
| `updatedAt` | timestamptz | NOT NULL, default now() |

Unique: `(tenantId, customerId)`

Create migration + RLS for all 4 tables.

## Part 2: Event Consumers — Build Read Models

### Consume `order.placed.v1`
- Upsert `rm_daily_sales`: increment orderCount, add to grossSales/taxTotal/netSales, recalculate avgOrderValue
- Upsert `rm_item_sales`: for each line, increment quantitySold and grossRevenue
- Upsert `rm_customer_activity` if customerId exists: increment visits, add to spend
- Use `ON CONFLICT DO UPDATE` for all upserts (idempotent with processed_events check)

### Consume `order.voided.v1`
- Update `rm_daily_sales`: increment voidCount, add to voidTotal, adjust netSales
- Update `rm_item_sales`: decrement quantities (or leave as-is for accurate "items sold before void")

### Consume `tender.recorded.v1`
- Update `rm_daily_sales`: add to tenderCash (or tenderCard in V2)

### Consume `inventory.movement.created.v1`
- Recalculate `rm_inventory_on_hand` for the affected item/location

All consumers must be idempotent (use processed_events).

## Part 3: CSV Export

Create `packages/modules/reporting/export.ts`:

```typescript
export async function exportToCsv(
  headers: string[],
  rows: Record<string, unknown>[],
  filename: string,
): { buffer: Buffer; filename: string; contentType: string } {
  // Generate CSV string
  // Return as downloadable buffer
}
```

## Part 4: Queries

### `getDailySales`
```typescript
getDailySalesParams: {
  tenantId: string,
  locationId?: string,  // optional — if omitted, aggregate across all locations
  from: string,         // YYYY-MM-DD
  to: string,           // YYYY-MM-DD
}
```

### `getItemSales`
Top selling items for a date range. Sort by quantitySold DESC or grossRevenue DESC.

### `getInventorySummary`
All items with on-hand, threshold, and below-threshold flag. For the dashboard "Low Stock Items" metric.

### `getDashboardMetrics`
Returns the four metrics for the dashboard home:
- Total Sales (today)
- Orders Today
- Low Stock Items (count)
- Active Customers (last 30 days)

## Part 5: API Routes

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| GET | `/api/v1/reports/daily-sales` | `reports.view` | getDailySales |
| GET | `/api/v1/reports/item-sales` | `reports.view` | getItemSales |
| GET | `/api/v1/reports/inventory-summary` | `reports.view` | getInventorySummary |
| GET | `/api/v1/reports/dashboard` | `reports.view` | getDashboardMetrics |
| GET | `/api/v1/reports/daily-sales/export` | `reports.export` | exportDailySalesCsv |
| GET | `/api/v1/reports/item-sales/export` | `reports.export` | exportItemSalesCsv |

Entitlement: `reporting`

## Part 6: Frontend

### Dashboard Home (`/`)
Replace the placeholder metrics with real data from `GET /api/v1/reports/dashboard`:
- Total Sales: formatted currency
- Orders Today: count
- Low Stock Items: count (red if > 0)
- Active Customers: count

### Reports Page (`/reports`)
Replace placeholder with:

**Tab: Sales**
- Date range picker (default: last 7 days)
- Location filter dropdown
- Line chart: daily sales over the date range (use Recharts)
- Summary cards: total revenue, total orders, avg order value, total discounts
- "Export CSV" button

**Tab: Items**
- Same date range + location filters
- Bar chart: top 10 items by revenue
- Table: item name, qty sold, revenue, avg price
- "Export CSV" button

**Tab: Inventory**
- Location filter
- Table: item name, on-hand, threshold, status badge
- Filter: "Low Stock Only" toggle

## Part 7: Tests

1. Event consumer: `order.placed.v1` → daily sales read model updated
2. Event consumer: `order.placed.v1` → item sales read model updated
3. Event consumer: `tender.recorded.v1` → tender totals updated
4. Event consumer: `inventory.movement.created.v1` → on-hand snapshot updated
5. Event consumer idempotency: same event processed twice → no double-counting
6. `getDailySales` — returns correct aggregates for date range
7. `getItemSales` — returns top items sorted correctly
8. `getDashboardMetrics` — returns all 4 metrics
9. CSV export — produces valid CSV with correct headers
10. API: daily-sales with location filter
11. Dashboard metrics load on the home page
12. Reports page charts render

## Verification Checklist — Session 17

- [ ] 4 read model tables with RLS
- [ ] Event consumers build all read models from events
- [ ] All consumers are idempotent
- [ ] Dashboard home shows real metrics
- [ ] Reports page with sales charts, item analysis, inventory summary
- [ ] CSV export works
- [ ] All 12 tests pass

---

# SESSION 18: Stripe Billing Integration

## Context

Tenants can use the product — now we need to charge them. This session integrates Stripe for subscription billing.

---

## Part 1: Billing Schema

Create a migration for:

### Table: `billing_subscriptions`

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, unique, FK → tenants.id |
| `stripeCustomerId` | text | NOT NULL |
| `stripeSubscriptionId` | text | nullable |
| `planKey` | text | NOT NULL (e.g., 'starter', 'growth', 'enterprise') |
| `status` | text | NOT NULL, default 'active' (enum: active, past_due, canceled, trialing) |
| `currentPeriodStart` | timestamptz | nullable |
| `currentPeriodEnd` | timestamptz | nullable |
| `canceledAt` | timestamptz | nullable |
| `createdAt` | timestamptz | NOT NULL, default now() |
| `updatedAt` | timestamptz | NOT NULL, default now() |

## Part 2: Implement BillingAdapter

The interface from Milestone 0:
```typescript
export interface BillingAdapter {
  createCustomer(tenantId: string, email: string, name: string): Promise<{ customerId: string }>;
  createSubscription(customerId: string, priceIds: string[]): Promise<{ subscriptionId: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  getPortalUrl(customerId: string): Promise<string>;
}
```

Create `packages/core/billing/stripe-adapter.ts`:

Install: `pnpm --filter @oppsera/core add stripe`

Implement using the Stripe Node.js SDK:

**createCustomer**: `stripe.customers.create({ email, name, metadata: { tenantId } })`
**createSubscription**: `stripe.subscriptions.create({ customer, items: priceIds.map(...) })`
**cancelSubscription**: `stripe.subscriptions.cancel(subscriptionId)`
**getPortalUrl**: `stripe.billingPortal.sessions.create({ customer, return_url })`

## Part 3: Plan Configuration

```typescript
export const PLANS = {
  starter: {
    key: 'starter',
    name: 'Starter',
    price: 7900, // $79/month
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID!,
    limits: { max_seats: 5, max_locations: 2, max_devices: 3 },
    modules: ['platform_core', 'catalog', 'pos_retail', 'payments', 'customers', 'reporting'],
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    price: 14900, // $149/month
    stripePriceId: process.env.STRIPE_GROWTH_PRICE_ID!,
    limits: { max_seats: 25, max_locations: 10, max_devices: 10 },
    modules: ['platform_core', 'catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'],
  },
} as const;
```

## Part 4: Onboarding Integration

Update `POST /api/v1/onboard` (from Milestone 4):
- After creating tenant + location + roles:
  - Create Stripe customer: `billingAdapter.createCustomer(tenant.id, user.email, body.companyName)`
  - Store the stripeCustomerId on the tenants table (update `tenants.billingCustomerId`)
  - Create a billing_subscriptions row with planKey='starter' and status='trialing'
  - Create Stripe subscription (or skip for a 14-day free trial with no card required)
- Set entitlement limits based on the plan

## Part 5: Stripe Webhook Handler

Create `apps/web/app/api/v1/webhooks/stripe/route.ts`:

**Important: This is a public endpoint (no auth). Verify the webhook signature.**

```typescript
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  
  const event = stripe.webhooks.constructEvent(
    body,
    signature!,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
  
  switch (event.type) {
    case 'invoice.paid':
      // Update subscription status to 'active'
      // Update billing_subscriptions.currentPeriodStart/End
      break;
      
    case 'invoice.payment_failed':
      // Update subscription status to 'past_due'
      // After 3 failed attempts: suspend the tenant
      break;
      
    case 'customer.subscription.updated':
      // Handle plan changes
      // Update entitlement limits based on new plan
      break;
      
    case 'customer.subscription.deleted':
      // Mark subscription as canceled
      // Suspend tenant (grace period: 30 days)
      break;
  }
  
  return new Response('ok', { status: 200 });
}
```

## Part 6: Tenant Suspension on Payment Failure

When a subscription fails or is canceled:
1. Update tenant status to 'suspended'
2. Existing sessions continue to work (don't boot people immediately)
3. The `resolveTenant` middleware already checks tenant status → returns `TenantSuspendedError`
4. Show a "Your account has been suspended" page with a link to the billing portal

## Part 7: Billing Settings Page

Add to Settings:

**Tab: Billing**
- Current plan display (name, price)
- Current period dates
- Subscription status badge
- "Manage Billing" button → opens Stripe Customer Portal (redirect)
- "Upgrade Plan" section showing available plans

## Part 8: API Routes

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| GET | `/api/v1/billing` | `settings.view` | getBillingInfo |
| POST | `/api/v1/billing/portal` | `settings.update` | getPortalUrl |
| POST | `/api/v1/webhooks/stripe` | (public, signature verified) | stripeWebhook |

## Part 9: Tests

1. `createCustomer` — creates Stripe customer with correct metadata
2. `createSubscription` — creates subscription with correct price
3. Webhook: `invoice.paid` → subscription status updated
4. Webhook: `invoice.payment_failed` → status set to past_due
5. Webhook: `customer.subscription.deleted` → tenant suspended
6. Webhook: invalid signature → 400 rejected
7. API: GET /api/v1/billing → returns plan info
8. API: POST /api/v1/billing/portal → returns portal URL
9. Suspended tenant → 403 on all API calls
10. Billing settings page renders with plan info

## Verification Checklist — Session 18

- [ ] Stripe adapter implements BillingAdapter interface
- [ ] billing_subscriptions table tracks subscription state
- [ ] Onboarding creates Stripe customer
- [ ] Webhook handler processes payment events
- [ ] Payment failure → tenant suspension
- [ ] Billing settings page with portal link
- [ ] All 10 tests pass

**Update PROJECT_BRIEF.md** state:
```
Next: Milestone 8 — Polish + Deploy
```

Build it now. Don't explain — just write the code.
