# Milestone 3: Catalog Module — Sessions 8, 9, 10

> **This is your first real business module.** It sets the pattern for every module after it.
> Every future module will mirror this file structure, command/query pattern, event flow, and API design.

---

## How to Use This Prompt

Update your `PROJECT_BRIEF.md` → "Current Project State" section to:

```
## Current Project State

Milestones 0–2 are complete:
- Monorepo scaffolded (apps/web, packages/core, packages/modules, packages/shared, packages/db)
- 13 core platform tables with RLS on all tenant-scoped tables
- Supabase Auth integration with authenticate + resolveTenant middleware
- RBAC engine with PermissionEngine, Redis cache, requirePermission middleware
- Entitlements engine with requireEntitlement middleware
- withMiddleware utility composing the full chain: authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler
- Event bus: InMemoryEventBus with transactional outbox, OutboxWorker, consumer idempotency via processed_events
- Audit logging: partitioned audit_log table, auditLog() helper, computeChanges() diff
- Seed data: "Sunset Golf & Grill" tenant, 2 locations, 1 admin, 5 roles, 7 entitlements
- All tests passing

Next: Milestone 3 — Catalog module (first business module, sets the pattern for all others)
```

Then paste the relevant session prompt below.

---

# SESSION 8: Catalog Schema + Commands

## Context

This is Session 8 of OppsEra. We're building the Catalog module — the first business domain module in the system. It manages products, categories, modifiers, tax categories, and location-specific pricing. Every other module (Orders, POS, Inventory) depends on catalog data.

This session creates the database schema, all write commands, and the event contracts. Session 9 will add queries and API routes. Session 10 will add the frontend.

## Architecture Rules (Critical — Follow Exactly)

1. **Module location**: `packages/modules/catalog/`
2. **Module internal structure**:
```
packages/modules/catalog/
├── schema.ts          # Drizzle table definitions
├── commands/          # Write operations (one file per command)
│   ├── createTaxCategory.ts
│   ├── createCategory.ts
│   ├── createItem.ts
│   ├── updateItem.ts
│   ├── deactivateItem.ts
│   ├── createModifierGroup.ts
│   ├── updateModifierGroup.ts
│   ├── setLocationPrice.ts
│   └── removeLocationPrice.ts
├── queries/           # Read operations (Session 9)
├── events.ts          # Event type definitions + registration
├── internal-api.ts    # Internal read API for other modules (price lookups)
├── index.ts           # Public exports
└── __tests__/
```
3. **Every table gets**: `id` (ULID), `tenantId`, `locationId` (if applicable, nullable), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`
4. **All IDs are ULIDs** — use `gen_ulid()` as default in Postgres, `generateUlid()` from `@oppsera/shared` in app code
5. **All money values stored as integers (cents)** — use the money utilities from `@oppsera/shared`
6. **Every write command must**:
   - Validate input with Zod
   - Check permissions via the middleware (not inside the command)
   - Execute inside `publishWithOutbox()` (atomic DB write + event)
   - Write audit log entry
7. **Events use the canonical envelope** from `@oppsera/shared` — `{ eventId, eventType, occurredAt, tenantId, locationId, actorUserId, idempotencyKey, data }`
8. **RLS**: Every tenant-scoped table needs 4 RLS policies (SELECT, INSERT, UPDATE, DELETE) matching the pattern from Milestone 0
9. **No cross-module imports**: Catalog does NOT import from Orders, Inventory, etc. Other modules consume catalog data via events or the internal read API.

---

## Part 1: Drizzle Schema — 7 Tables

Create `packages/modules/catalog/schema.ts` with these exact tables:

### Table 1: `tax_categories`
Purpose: Tax rate definitions per tenant. Referenced by catalog items.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `name` | text | NOT NULL (e.g., "Standard", "Food", "Alcohol", "Tax Exempt") |
| `rate` | integer | NOT NULL (basis points — 825 = 8.25%) |
| `isDefault` | boolean | NOT NULL, default false |
| `isActive` | boolean | NOT NULL, default true |
| `createdAt` | timestamp with timezone | NOT NULL, default now() |
| `updatedAt` | timestamp with timezone | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |
| `updatedBy` | text | NOT NULL |

Indexes: `unique(tenantId, name)`, index on `(tenantId, isActive)`

### Table 2: `catalog_categories`
Purpose: Hierarchical product grouping. One level of nesting (parent → child).

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `parentId` | text | nullable, FK → catalog_categories.id (self-ref) |
| `name` | text | NOT NULL |
| `sortOrder` | integer | NOT NULL, default 0 |
| `isActive` | boolean | NOT NULL, default true |
| `createdAt` | timestamp with timezone | NOT NULL, default now() |
| `updatedAt` | timestamp with timezone | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |
| `updatedBy` | text | NOT NULL |

Indexes: `unique(tenantId, name, parentId)`, index on `(tenantId, isActive, sortOrder)`

### Table 3: `catalog_items`
Purpose: The core product/service entity. Everything sold goes here — retail items, food items, services, green fees.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `categoryId` | text | nullable, FK → catalog_categories.id |
| `taxCategoryId` | text | nullable, FK → tax_categories.id |
| `sku` | text | nullable |
| `name` | text | NOT NULL |
| `description` | text | nullable |
| `type` | text | NOT NULL (enum: 'retail', 'food', 'beverage', 'service', 'green_fee', 'rental', 'other') |
| `price` | integer | NOT NULL (cents — base price) |
| `cost` | integer | nullable (cents — cost for margin tracking) |
| `isActive` | boolean | NOT NULL, default true |
| `isTrackInventory` | boolean | NOT NULL, default false |
| `imageUrl` | text | nullable |
| `sortOrder` | integer | NOT NULL, default 0 |
| `metadata` | jsonb | nullable (extensible key-value for module-specific data) |
| `createdAt` | timestamp with timezone | NOT NULL, default now() |
| `updatedAt` | timestamp with timezone | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |
| `updatedBy` | text | NOT NULL |

Indexes: `unique(tenantId, sku)` WHERE sku IS NOT NULL, index on `(tenantId, isActive, type)`, index on `(tenantId, categoryId)`, index on `(tenantId, name)` for search

### Table 4: `catalog_modifier_groups`
Purpose: Groups of modifiers (e.g., "Size", "Add-ons", "Temperature"). Attached to items.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `name` | text | NOT NULL (e.g., "Size", "Extras", "Temperature") |
| `selectionType` | text | NOT NULL (enum: 'single', 'multi') |
| `isRequired` | boolean | NOT NULL, default false |
| `minSelections` | integer | NOT NULL, default 0 |
| `maxSelections` | integer | nullable (null = unlimited for multi) |
| `sortOrder` | integer | NOT NULL, default 0 |
| `isActive` | boolean | NOT NULL, default true |
| `createdAt` | timestamp with timezone | NOT NULL, default now() |
| `updatedAt` | timestamp with timezone | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |
| `updatedBy` | text | NOT NULL |

Indexes: `unique(tenantId, name)`, index on `(tenantId, isActive)`

### Table 5: `catalog_modifiers`
Purpose: Individual modifier options within a group (e.g., "Small", "Medium", "Large" in the "Size" group).

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `modifierGroupId` | text | NOT NULL, FK → catalog_modifier_groups.id |
| `name` | text | NOT NULL |
| `priceAdjustment` | integer | NOT NULL, default 0 (cents — can be positive or negative) |
| `sortOrder` | integer | NOT NULL, default 0 |
| `isActive` | boolean | NOT NULL, default true |
| `isDefault` | boolean | NOT NULL, default false |
| `createdAt` | timestamp with timezone | NOT NULL, default now() |
| `updatedAt` | timestamp with timezone | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |
| `updatedBy` | text | NOT NULL |

Indexes: `unique(tenantId, modifierGroupId, name)`, index on `(modifierGroupId, isActive, sortOrder)`

### Table 6: `catalog_item_modifier_groups`
Purpose: Junction table linking items to modifier groups. An item can have multiple modifier groups, and a group can be used by multiple items.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `catalogItemId` | text | NOT NULL, FK → catalog_items.id |
| `modifierGroupId` | text | NOT NULL, FK → catalog_modifier_groups.id |
| `sortOrder` | integer | NOT NULL, default 0 |
| `createdAt` | timestamp with timezone | NOT NULL, default now() |

Indexes: `unique(tenantId, catalogItemId, modifierGroupId)`

Note: This junction table does NOT need full RLS — access is controlled through the parent tables. But add a basic SELECT policy scoped to tenant_id for defense-in-depth.

### Table 7: `catalog_location_prices`
Purpose: Location-specific price overrides. If a location has a row here, use its price instead of the base price on catalog_items.

| Column | Type | Constraints |
|--------|------|------------|
| `id` | text | PK, default `gen_ulid()` |
| `tenantId` | text | NOT NULL, FK → tenants.id |
| `locationId` | text | NOT NULL, FK → locations.id |
| `catalogItemId` | text | NOT NULL, FK → catalog_items.id |
| `price` | integer | NOT NULL (cents) |
| `createdAt` | timestamp with timezone | NOT NULL, default now() |
| `updatedAt` | timestamp with timezone | NOT NULL, default now() |
| `createdBy` | text | NOT NULL |
| `updatedBy` | text | NOT NULL |

Indexes: `unique(tenantId, locationId, catalogItemId)`

---

## Part 2: Migration + RLS

Generate a Drizzle migration for all 7 tables. Then add RLS policies:

For each tenant-scoped table (all 7), create 4 policies:
```sql
-- Pattern (replace TABLE_NAME for each table):
ALTER TABLE TABLE_NAME ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TABLE_NAME_select" ON TABLE_NAME
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "TABLE_NAME_insert" ON TABLE_NAME
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "TABLE_NAME_update" ON TABLE_NAME
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "TABLE_NAME_delete" ON TABLE_NAME
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));
```

Apply these to: `tax_categories`, `catalog_categories`, `catalog_items`, `catalog_modifier_groups`, `catalog_modifiers`, `catalog_item_modifier_groups`, `catalog_location_prices`

---

## Part 3: Zod Validation Schemas

Create `packages/modules/catalog/validation.ts` with these schemas:

```typescript
// Tax Categories
createTaxCategorySchema: { name: string (1-100 chars), rate: number (0-10000, basis points), isDefault?: boolean }
updateTaxCategorySchema: { name?: string, rate?: number, isDefault?: boolean, isActive?: boolean }

// Categories
createCategorySchema: { name: string (1-100 chars), parentId?: string (ULID), sortOrder?: number }
updateCategorySchema: { name?: string, parentId?: string | null, sortOrder?: number, isActive?: boolean }

// Items
createItemSchema: {
  name: string (1-200 chars),
  sku?: string (1-50 chars),
  description?: string (max 2000 chars),
  type: enum('retail', 'food', 'beverage', 'service', 'green_fee', 'rental', 'other'),
  price: number (>= 0, integer — cents),
  cost?: number (>= 0, integer — cents),
  categoryId?: string (ULID),
  taxCategoryId?: string (ULID),
  isTrackInventory?: boolean,
  imageUrl?: string (URL),
  sortOrder?: number,
  metadata?: Record<string, unknown>
}
updateItemSchema: all fields from createItemSchema as optional + isActive?: boolean

// Modifier Groups
createModifierGroupSchema: {
  name: string (1-100 chars),
  selectionType: enum('single', 'multi'),
  isRequired?: boolean,
  minSelections?: number (>= 0),
  maxSelections?: number (>= 1, nullable),
  sortOrder?: number,
  modifiers: array of { name: string, priceAdjustment?: number (cents), sortOrder?: number, isDefault?: boolean } — at least 1 modifier required
}
updateModifierGroupSchema: all group fields optional + modifiers optional (if provided, full replace)

// Location Prices
setLocationPriceSchema: { locationId: string (ULID), catalogItemId: string (ULID), price: number (>= 0, integer — cents) }
removeLocationPriceSchema: { locationId: string (ULID), catalogItemId: string (ULID) }
```

Add custom refinements:
- On `createModifierGroupSchema`: if `selectionType` is 'single', `maxSelections` must be 1 or null
- On `createModifierGroupSchema`: `minSelections` must be <= `maxSelections` when both are set
- On `createItemSchema`: if `sku` is provided, trim whitespace and uppercase it

---

## Part 4: Event Type Definitions

Create `packages/modules/catalog/events.ts`:

Define Zod schemas for the `data` field of each event:

```typescript
// Event types the Catalog module emits:
'catalog.tax_category.created.v1'   — data: { taxCategoryId, name, rate, isDefault }
'catalog.tax_category.updated.v1'   — data: { taxCategoryId, changes: Record<string, { old, new }> }
'catalog.category.created.v1'       — data: { categoryId, name, parentId }
'catalog.category.updated.v1'       — data: { categoryId, changes }
'catalog.item.created.v1'           — data: { itemId, name, sku, type, price, categoryId, taxCategoryId, isTrackInventory }
'catalog.item.updated.v1'           — data: { itemId, changes }
'catalog.item.deactivated.v1'       — data: { itemId, name, sku }
'catalog.modifier_group.created.v1' — data: { modifierGroupId, name, selectionType, modifiers: Array<{ id, name, priceAdjustment }> }
'catalog.modifier_group.updated.v1' — data: { modifierGroupId, changes }
'catalog.location_price.set.v1'     — data: { catalogItemId, locationId, price, previousPrice (nullable) }
'catalog.location_price.removed.v1' — data: { catalogItemId, locationId, previousPrice }
```

Register event contracts:
```typescript
export function registerCatalogEvents(bus: EventBus) {
  // Catalog doesn't consume any events in V1 — it only produces.
  // But register the contract definitions so contract tests can validate them.
}
```

---

## Part 5: Command Implementations

Every command follows this exact pattern. Here is the CANONICAL example — `createTaxCategory`:

```typescript
// packages/modules/catalog/commands/createTaxCategory.ts
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { createTaxCategorySchema } from '../validation';
import { taxCategories } from '../schema';
import type { RequestContext } from '@oppsera/core/context';

export async function createTaxCategory(ctx: RequestContext, input: unknown) {
  // 1. Validate
  const data = createTaxCategorySchema.parse(input);

  // 2. Business logic (if isDefault, unset other defaults first)
  // 3. Atomic write + event via publishWithOutbox
  const result = await publishWithOutbox(ctx, async (tx) => {
    // If setting as default, unset existing default
    if (data.isDefault) {
      await tx.update(taxCategories)
        .set({ isDefault: false, updatedAt: new Date(), updatedBy: ctx.userId })
        .where(and(
          eq(taxCategories.tenantId, ctx.tenantId),
          eq(taxCategories.isDefault, true)
        ));
    }

    // Insert the new tax category
    const [row] = await tx.insert(taxCategories).values({
      tenantId: ctx.tenantId,
      name: data.name,
      rate: data.rate,
      isDefault: data.isDefault ?? false,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    }).returning();

    return {
      row,
      events: [{
        eventType: 'catalog.tax_category.created.v1',
        data: {
          taxCategoryId: row.id,
          name: row.name,
          rate: row.rate,
          isDefault: row.isDefault,
        }
      }]
    };
  });

  // 4. Audit (after successful write — fire-and-forget is OK)
  await auditLog(ctx, {
    action: 'catalog.tax_category.created',
    entityType: 'tax_category',
    entityId: result.row.id,
    after: result.row,
  });

  return result.row;
}
```

**Now implement all other commands following this exact same pattern:**

### `createCategory`
- Validate with `createCategorySchema`
- If `parentId` provided, verify parent exists and belongs to same tenant
- Prevent more than 2 levels of nesting (parent's parentId must be null)
- Emit `catalog.category.created.v1`
- Audit log

### `createItem`
- Validate with `createItemSchema`
- If `categoryId` provided, verify category exists and belongs to same tenant
- If `taxCategoryId` provided, verify tax category exists and belongs to same tenant
- If `sku` provided, check uniqueness within tenant (unique constraint will also catch this, but give a better error message)
- Emit `catalog.item.created.v1`
- Audit log

### `updateItem`
- Validate with `updateItemSchema`
- Fetch existing item (404 if not found)
- Use `computeChanges(old, new)` from audit module to detect what changed
- If nothing changed, return early (no event, no audit)
- Emit `catalog.item.updated.v1` with `changes` field
- Audit log with `before` and `after`

### `deactivateItem`
- No body needed — just the item ID from URL params
- Fetch existing item (404 if not found)
- Set `isActive = false`
- Emit `catalog.item.deactivated.v1`
- Audit log

### `createModifierGroup`
- Validate with `createModifierGroupSchema`
- Create the group AND all modifiers within the same transaction
- Emit `catalog.modifier_group.created.v1` (includes modifier list in data)
- Audit log

### `updateModifierGroup`
- Validate with `updateModifierGroupSchema`
- If `modifiers` array is provided, do a full replace:
  1. Delete all existing modifiers for this group (within the transaction)
  2. Insert the new set
  3. This avoids the complexity of diffing individual modifiers
- Emit `catalog.modifier_group.updated.v1`
- Audit log

### `setLocationPrice`
- Validate with `setLocationPriceSchema`
- Verify the catalog item exists
- Verify the location belongs to the tenant
- Upsert: INSERT ... ON CONFLICT (tenantId, locationId, catalogItemId) DO UPDATE
- Emit `catalog.location_price.set.v1` (include previousPrice if it was an update)
- Audit log

### `removeLocationPrice`
- Validate with `removeLocationPriceSchema`
- Delete the row (404 if not found)
- Emit `catalog.location_price.removed.v1`
- Audit log

---

## Part 6: Internal Read API

Create `packages/modules/catalog/internal-api.ts`:

This is the ONE exception to "modules never call each other directly." The Orders module needs synchronous access to catalog data for order creation (price lookups, tax rate lookups, item validation). This file provides a clean internal interface — NOT direct DB access from another module.

```typescript
export interface CatalogInternalApi {
  // Get a single item with its current effective price for a location
  getItem(tenantId: string, itemId: string): Promise<CatalogItem | null>;

  // Get the effective price: location override if exists, otherwise base price
  getEffectivePrice(tenantId: string, locationId: string, itemId: string): Promise<number>;

  // Get item + modifiers + location price in one call (for POS)
  getItemForPOS(tenantId: string, locationId: string, itemId: string): Promise<POSItem | null>;

  // Get tax rate for an item (returns rate in basis points, or 0 if no tax category)
  getTaxRate(tenantId: string, itemId: string): Promise<number>;

  // Batch: get multiple items with effective prices (for order validation)
  getItemsBatch(tenantId: string, locationId: string, itemIds: string[]): Promise<Map<string, POSItem>>;
}
```

Implement `CatalogInternalApiImpl` that uses Drizzle queries directly (it's the same DB, just a clean interface boundary). The `getEffectivePrice` query:

```sql
SELECT COALESCE(lp.price, ci.price) AS effective_price
FROM catalog_items ci
LEFT JOIN catalog_location_prices lp
  ON lp.catalog_item_id = ci.id
  AND lp.location_id = $locationId
  AND lp.tenant_id = ci.tenant_id
WHERE ci.id = $itemId AND ci.tenant_id = $tenantId AND ci.is_active = true
```

---

## Part 7: Module Registration

Create `packages/modules/catalog/index.ts`:

```typescript
export { registerCatalogEvents } from './events';
export { CatalogInternalApiImpl } from './internal-api';
// Re-export commands
export { createTaxCategory } from './commands/createTaxCategory';
// ... etc
// Re-export schema for migration purposes
export * from './schema';
```

Register the module in the app startup (wherever other modules are registered). The catalog module:
- **Emits**: 11 event types (listed in Part 4)
- **Consumes**: nothing in V1
- **Entitlement key**: `catalog` (required to access any catalog endpoint)
- **Permissions**: `catalog.read`, `catalog.create`, `catalog.update`, `catalog.delete`, `catalog.manage_pricing`

---

## Part 8: Tests for Session 8

Write tests in `packages/modules/catalog/__tests__/`:

### Schema tests
1. Migration runs without errors
2. RLS blocks cross-tenant SELECT on catalog_items
3. RLS blocks cross-tenant INSERT on catalog_items
4. Unique constraint on (tenant_id, sku) works (null SKUs don't conflict)
5. Foreign key from catalog_items.category_id → catalog_categories works

### Command tests (use real DB with test tenant from seed)
6. `createTaxCategory` — creates with valid input, returns row with ULID id
7. `createTaxCategory` — setting isDefault unsets previous default
8. `createTaxCategory` — duplicate name within tenant returns ConflictError
9. `createCategory` — creates top-level category
10. `createCategory` — creates child category with valid parentId
11. `createCategory` — rejects 3rd-level nesting (parent already has a parent)
12. `createItem` — creates item with all fields
13. `createItem` — rejects duplicate SKU within tenant
14. `createItem` — validates price is non-negative integer
15. `updateItem` — updates only changed fields, emits event with changes diff
16. `updateItem` — no-op when nothing changed (no event emitted)
17. `deactivateItem` — sets isActive to false, emits deactivated event
18. `createModifierGroup` — creates group with 3 modifiers in single transaction
19. `setLocationPrice` — upserts price override
20. `removeLocationPrice` — deletes override, emits event with previousPrice

### Event tests
21. Every command emits the correct event type
22. Events include correct tenant_id, location_id, actor_user_id
23. Event data matches the Zod schema defined in events.ts
24. Events appear in the event_outbox table

### Internal API tests
25. `getEffectivePrice` returns location override when it exists
26. `getEffectivePrice` returns base price when no override
27. `getTaxRate` returns 0 when item has no tax category
28. `getItemsBatch` returns correct prices for multiple items at a location

---

## Verification Checklist — Session 8

- [ ] `packages/modules/catalog/schema.ts` exists with 7 tables
- [ ] Migration runs: `pnpm drizzle-kit push` succeeds
- [ ] RLS policies created for all 7 tables
- [ ] `validation.ts` has all Zod schemas with refinements
- [ ] `events.ts` defines 11 event types with Zod data schemas
- [ ] All 9 commands implemented following the publishWithOutbox pattern
- [ ] Every command writes audit log
- [ ] `internal-api.ts` implemented with getEffectivePrice, getTaxRate, getItemsBatch
- [ ] `index.ts` exports everything
- [ ] All 28 tests pass
- [ ] No imports from other modules (only from @oppsera/core, @oppsera/shared, @oppsera/db)

---

# SESSION 9: Catalog Queries + API Routes

## Context

Session 8 is complete — the Catalog module has 7 tables, all commands, events, and internal API. This session adds the query functions and REST API routes so the frontend can interact with catalog data.

---

## Part 1: Query Functions

Create `packages/modules/catalog/queries/` with these query functions:

### `listItems`
```typescript
interface ListItemsParams {
  tenantId: string;
  cursor?: string;        // ULID cursor for pagination
  limit?: number;         // default 50, max 200
  search?: string;        // search name and SKU (case-insensitive ILIKE)
  categoryId?: string;    // filter by category
  type?: string;          // filter by item type
  isActive?: boolean;     // default true (only show active)
  sortBy?: 'name' | 'price' | 'createdAt' | 'sortOrder';  // default 'sortOrder'
  sortDir?: 'asc' | 'desc';  // default 'asc'
}
```

Implementation notes:
- Use cursor-based pagination with the LIMIT+1 trick: fetch `limit + 1` rows, if you get `limit + 1` results, there are more pages, and the cursor for the next page is the ID of the last item you return (not the extra one)
- ILIKE search on both `name` and `sku` columns (OR condition)
- Return: `{ items: CatalogItem[], nextCursor: string | null, hasMore: boolean }`
- Left join to `catalog_categories` to include `categoryName` in each result
- Left join to `tax_categories` to include `taxCategoryName` and `taxRate`

### `getItem`
Fetch a single item by ID with:
- Its category (name)
- Its tax category (name, rate)
- All modifier groups attached to it (via junction table), each with their modifiers
- All location price overrides

Return a rich `CatalogItemDetail` type:
```typescript
interface CatalogItemDetail {
  id: string;
  tenantId: string;
  name: string;
  sku: string | null;
  description: string | null;
  type: string;
  price: number;
  cost: number | null;
  isActive: boolean;
  isTrackInventory: boolean;
  imageUrl: string | null;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  category: { id: string; name: string } | null;
  taxCategory: { id: string; name: string; rate: number } | null;
  modifierGroups: Array<{
    id: string;
    name: string;
    selectionType: 'single' | 'multi';
    isRequired: boolean;
    minSelections: number;
    maxSelections: number | null;
    modifiers: Array<{
      id: string;
      name: string;
      priceAdjustment: number;
      isDefault: boolean;
      sortOrder: number;
    }>;
  }>;
  locationPrices: Array<{
    locationId: string;
    locationName: string;
    price: number;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

### `listCategories`
- Return all categories for the tenant, with `itemCount` (count of active items in each category)
- Hierarchical: include `children` array for top-level categories
- Parameters: `tenantId`, `isActive` (default true)

### `listModifierGroups`
- Return all modifier groups with their modifiers
- Parameters: `tenantId`, `isActive` (default true)
- Each group includes its `modifiers` array

### `listTaxCategories`
- Simple list, parameters: `tenantId`, `isActive` (default true)

### Zod schemas for query parameters
Create Zod schemas for all query string parameters (for API route validation):
```typescript
listItemsQuerySchema: { cursor, limit, search, categoryId, type, isActive, sortBy, sortDir }
```

---

## Part 2: REST API Routes

Create API route files in `apps/web/app/api/v1/catalog/`:

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| GET | `/api/v1/catalog/items` | `catalog.read` | listItems |
| POST | `/api/v1/catalog/items` | `catalog.create` | createItem |
| GET | `/api/v1/catalog/items/[itemId]` | `catalog.read` | getItem |
| PUT | `/api/v1/catalog/items/[itemId]` | `catalog.update` | updateItem |
| POST | `/api/v1/catalog/items/[itemId]/deactivate` | `catalog.update` | deactivateItem |
| GET | `/api/v1/catalog/categories` | `catalog.read` | listCategories |
| POST | `/api/v1/catalog/categories` | `catalog.create` | createCategory |
| PUT | `/api/v1/catalog/categories/[categoryId]` | `catalog.update` | updateCategory |
| GET | `/api/v1/catalog/tax-categories` | `catalog.read` | listTaxCategories |
| POST | `/api/v1/catalog/tax-categories` | `catalog.create` | createTaxCategory |
| PUT | `/api/v1/catalog/tax-categories/[taxCategoryId]` | `catalog.update` | updateTaxCategory |
| GET | `/api/v1/catalog/modifier-groups` | `catalog.read` | listModifierGroups |
| POST | `/api/v1/catalog/modifier-groups` | `catalog.create` | createModifierGroup |
| PUT | `/api/v1/catalog/modifier-groups/[groupId]` | `catalog.update` | updateModifierGroup |
| POST | `/api/v1/catalog/items/[itemId]/location-prices` | `catalog.manage_pricing` | setLocationPrice |
| DELETE | `/api/v1/catalog/items/[itemId]/location-prices/[locationId]` | `catalog.manage_pricing` | removeLocationPrice |

Every route handler uses `withMiddleware`:
```typescript
// Example: GET /api/v1/catalog/items
import { withMiddleware } from '@oppsera/core/middleware';
import { listItems } from '@oppsera/modules/catalog';

export const GET = withMiddleware({
  entitlement: 'catalog',
  permission: 'catalog.read',
}, async (ctx, req) => {
  const params = listItemsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return listItems({ ...params, tenantId: ctx.tenantId });
});

// Example: POST /api/v1/catalog/items
export const POST = withMiddleware({
  entitlement: 'catalog',
  permission: 'catalog.create',
}, async (ctx, req) => {
  const body = await req.json();
  return createItem(ctx, body);
});
```

Response envelope (all routes):
```json
// Success
{ "ok": true, "data": { ... } }
{ "ok": true, "data": { "items": [...], "nextCursor": "...", "hasMore": true } }

// Error
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Item not found" } }
```

---

## Part 3: Seed Catalog Data

Add catalog seed data to the existing seed script (or create a separate catalog seed):

Create for the "Sunset Golf & Grill" test tenant:

**Tax Categories:**
- "Standard" — 825 basis points (8.25%) — isDefault
- "Food" — 600 basis points (6.00%)
- "Alcohol" — 1000 basis points (10.00%)
- "Tax Exempt" — 0 basis points

**Categories (with hierarchy):**
- "Pro Shop" (top-level)
  - "Apparel"
  - "Equipment"
  - "Accessories"
- "Food & Beverage" (top-level)
  - "Entrees"
  - "Appetizers"
  - "Drinks"
- "Green Fees" (top-level)
- "Rentals" (top-level)

**Items (at least 10):**
1. "Logo Polo Shirt" — retail, $59.99, Pro Shop > Apparel, Standard tax, track inventory
2. "Titleist Pro V1 (dozen)" — retail, $54.99, Pro Shop > Equipment, Standard tax, track inventory
3. "Golf Glove" — retail, $24.99, Pro Shop > Accessories, Standard tax, track inventory
4. "Classic Burger" — food, $14.99, Food & Bev > Entrees, Food tax
5. "Caesar Salad" — food, $12.99, Food & Bev > Appetizers, Food tax
6. "Wings (10pc)" — food, $16.99, Food & Bev > Appetizers, Food tax
7. "Draft Beer" — beverage, $7.99, Food & Bev > Drinks, Alcohol tax
8. "Soft Drink" — beverage, $3.99, Food & Bev > Drinks, Food tax
9. "18 Holes — Weekend" — green_fee, $85.00, Green Fees, Standard tax
10. "Cart Rental" — rental, $25.00, Rentals, Standard tax

**Modifier Groups:**
- "Burger Temperature" (single, required): Rare, Medium Rare, Medium, Medium Well, Well Done
- "Burger Add-ons" (multi, not required, max 5): Bacon (+$2.00), Cheese (+$1.50), Avocado (+$2.50), Fried Egg (+$1.50)
- "Drink Size" (single, required): Small, Medium (+$1.00), Large (+$2.00)

Link modifier groups to items: Burger Temperature + Burger Add-ons → Classic Burger, Drink Size → Soft Drink, Drink Size → Draft Beer

**Location Price Overrides:**
- Location 2 ("The Grill"): Classic Burger at $16.99 instead of $14.99
- Location 2 ("The Grill"): Draft Beer at $8.99 instead of $7.99

---

## Tests for Session 9

### Query tests
1. `listItems` returns paginated results with default sort
2. `listItems` cursor pagination: fetch page 1, use cursor, fetch page 2 — no overlap
3. `listItems` search by name (case-insensitive)
4. `listItems` search by SKU
5. `listItems` filter by categoryId
6. `listItems` filter by type
7. `listItems` only returns active items by default
8. `listItems` can include inactive items when `isActive: false`
9. `getItem` returns full detail with category, tax category, modifiers, location prices
10. `getItem` returns null for non-existent ID
11. `listCategories` returns hierarchical structure with item counts
12. `listModifierGroups` returns groups with modifiers

### API route tests
13. GET `/api/v1/catalog/items` returns 200 with items list
14. POST `/api/v1/catalog/items` with valid body returns 201
15. POST `/api/v1/catalog/items` with invalid body returns 400 with validation errors
16. GET `/api/v1/catalog/items/[id]` returns 200 with full item detail
17. GET `/api/v1/catalog/items/[badId]` returns 404
18. PUT `/api/v1/catalog/items/[id]` returns 200 with updated item
19. All routes return 401 without auth token
20. All routes return 403 without `catalog` entitlement
21. Write routes return 403 without `catalog.create` / `catalog.update` permission
22. Response envelope always has `{ ok: true/false }` shape

### Seed tests
23. After running seed, can query items and get expected count
24. Modifier groups are correctly linked to items

---

## Verification Checklist — Session 9

- [ ] All 5 query functions implemented with proper types
- [ ] Cursor-based pagination works correctly (LIMIT+1 trick)
- [ ] Search works case-insensitively on name and SKU
- [ ] All 16 API routes created and working
- [ ] Every route uses `withMiddleware` with correct entitlement + permission
- [ ] Response envelope is consistent (`{ ok, data }` or `{ ok, error }`)
- [ ] Seed data creates 4 tax categories, 8+ categories, 10+ items, 3 modifier groups, 2 location price overrides
- [ ] All 24 tests pass
- [ ] `pnpm turbo test` still passes (no regressions)

---

# SESSION 10: Catalog Frontend

## Context

Sessions 8 and 9 are complete — the Catalog module has 7 tables, all commands/queries, events, internal API, 16 REST routes, and seed data. This session builds the frontend pages for catalog management.

---

## Part 1: Reusable UI Components

Before building catalog pages, create these reusable components in `apps/web/components/ui/` that will be used across ALL modules (not just catalog):

### `DataTable`
A generic table component with:
- Column definitions (header, accessor, optional render function, optional width)
- Loading state (skeleton rows)
- Empty state with custom message
- Row click handler
- Optional row actions menu (three-dot dropdown with custom actions)
- Responsive: horizontally scrollable on mobile

```typescript
interface DataTableProps<T> {
  columns: Array<{
    header: string;
    accessor: keyof T | ((row: T) => React.ReactNode);
    width?: string;
  }>;
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowActions?: Array<{
    label: string;
    onClick: (row: T) => void;
    variant?: 'default' | 'destructive';
  }>;
}
```

### `SearchInput`
- Debounced search input (300ms)
- Search icon on the left
- Clear button when there's text
- `onSearch(value: string)` callback fires after debounce

### `CurrencyInput`
- Input that displays formatted currency ($12.99) but stores cents (1299)
- Auto-formats on blur
- Accepts numeric input only
- Shows $ prefix

### `ConfirmDialog`
- Modal dialog for destructive actions
- Title, description, confirm button (red for destructive), cancel button
- Promise-based: `const confirmed = await confirmDialog({ title, description })`

### `Toast` / `useToast`
- Toast notification system
- Success (green), error (red), info (blue) variants
- Auto-dismiss after 5 seconds
- Stack multiple toasts
- Accessible (role="alert")

### `LoadingSpinner`
- Centered spinner, customizable size
- Used for page-level and component-level loading states

### `EmptyState`
- Icon, title, description, optional CTA button
- Used when a list has no items

### `Badge`
- Small label for status/type display
- Variants: default, success, warning, error, outline

### `Select`
- Styled select dropdown (not native)
- Options with labels and values
- Optional "All" / default option
- Controlled component

### `FormField`
- Wraps a label + input + error message
- Consistent spacing and error display
- Works with Zod validation errors

**Styling rules:**
- Use Tailwind utility classes only (no custom CSS)
- Primary color: indigo-600 (buttons, links, focus rings)
- Destructive: red-600
- Border: gray-200, rounded-lg
- Text: gray-900 for primary, gray-500 for secondary
- Spacing: consistent use of p-4, gap-4, space-y-4
- All interactive elements must have focus-visible ring

---

## Part 2: Data Fetching Hooks

Create `apps/web/hooks/` with hooks for catalog data:

### `useCatalogItems`
```typescript
function useCatalogItems(params?: {
  search?: string;
  categoryId?: string;
  type?: string;
  isActive?: boolean;
  limit?: number;
}): {
  items: CatalogItem[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}
```
- Uses `apiFetch` from the auth module
- Handles cursor pagination internally (accumulates items on `loadMore`)
- Refetches when params change (debounced search)

### `useCatalogItem`
```typescript
function useCatalogItem(itemId: string): {
  item: CatalogItemDetail | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

### `useCatalogCategories`
### `useTaxCategories`
### `useModifierGroups`

Similar pattern for each — simple list fetch, no pagination needed for categories/tax cats/modifier groups (low cardinality).

### `useMutation`
A generic mutation hook:
```typescript
function useMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  options?: {
    onSuccess?: (data: TOutput) => void;
    onError?: (error: Error) => void;
    successMessage?: string;
    invalidates?: string[]; // query keys to refetch
  }
): {
  mutate: (input: TInput) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}
```
- Shows toast on success/error
- Triggers refetch of related queries

---

## Part 3: Catalog Pages

Create these pages in `apps/web/app/(dashboard)/catalog/`:

### Page 1: Items List — `/catalog/items`
Layout:
- Page header: "Catalog Items" title + "Add Item" button (indigo, top right)
- Below header: search bar + filter row (category dropdown, type dropdown, active/inactive toggle)
- Main content: DataTable with columns: Name, SKU, Type (badge), Category, Price (formatted), Status (active/inactive badge)
- Click row → navigate to item detail
- "Load more" button at bottom if hasMore
- Empty state when no items match filters

### Page 2: Create Item — `/catalog/items/new`
Layout:
- Page header: "New Item" title + "Cancel" link + "Save" button
- Form sections (visually grouped with cards/dividers):
  - **Basic Info**: name (required), SKU (optional), description (textarea), type (select from enum)
  - **Pricing**: base price (CurrencyInput, required), cost (CurrencyInput, optional)
  - **Classification**: category (select from categories), tax category (select from tax categories)
  - **Options**: track inventory (checkbox)
  - **Image**: image URL (text input — file upload is V2)
  - **Modifiers**: multi-select to attach existing modifier groups
- Client-side validation with Zod (same schema as server, imported from shared)
- On submit: POST to API → show toast → navigate to item detail page
- On error: show field-level errors

### Page 3: Item Detail — `/catalog/items/[itemId]`
Layout:
- Page header: item name + "Edit" button + "Deactivate" button (with confirm dialog)
- Info card: type badge, SKU, description, category, tax category, created/updated dates
- Pricing card: base price, cost, margin % (calculated), location price overrides table
  - Each location override row has an "Edit" and "Remove" button
  - "Add Location Override" button opens a dialog
- Modifiers card: list of attached modifier groups, each expandable to show modifiers
- Back link to items list

### Page 4: Edit Item — `/catalog/items/[itemId]/edit`
- Same form as Create, but pre-filled with existing data
- PUT to API on submit
- Handle optimistic updates or refetch after success

### Page 5: Categories — `/catalog/categories`
Layout:
- Page header: "Categories" + "Add Category" button
- Tree view or indented list showing hierarchy (parent → children)
- Each category shows: name, item count, active/inactive badge
- Inline actions: edit (opens dialog), deactivate
- "Add Category" opens a dialog with: name, parent (optional select from top-level categories)

### Page 6: Tax Categories — `/catalog/tax-categories`
Layout:
- Page header: "Tax Categories" + "Add Tax Category" button
- Simple table: name, rate (formatted as percentage), default badge, active/inactive badge
- Row actions: edit (opens dialog), deactivate
- "Add Tax Category" dialog: name, rate (percentage input that converts to basis points)

---

## Part 4: Navigation Updates

Update the dashboard sidebar:
- Under the "Catalog" section (which should already be a stub from Milestone 0):
  - "Items" → `/catalog/items`
  - "Categories" → `/catalog/categories`
  - "Tax Categories" → `/catalog/tax-categories`
  - "Modifier Groups" → `/catalog/modifier-groups` (simple list page, similar to tax categories)

The sidebar should only show the Catalog section if the tenant has the `catalog` entitlement enabled (use `useEntitlements` hook from Milestone 1).

---

## Part 5: Tests + Verification for Session 10

### Component tests
1. `DataTable` renders columns and data correctly
2. `DataTable` shows loading skeleton when `isLoading`
3. `DataTable` shows empty state when data is empty
4. `SearchInput` debounces and calls `onSearch` after 300ms
5. `CurrencyInput` converts between display ($12.99) and value (1299)
6. `ConfirmDialog` resolves promise on confirm/cancel

### Page tests (integration or e2e — test key user flows)
7. Items list loads and displays items from seed data
8. Search filters items by name
9. Category filter works
10. Create item form validates required fields
11. Create item success navigates to detail page
12. Item detail shows all data including modifiers and location prices
13. Edit item pre-fills form correctly
14. Deactivate item shows confirm dialog, then removes from active list
15. Categories page shows hierarchy
16. Tax categories page shows rate as percentage

---

## Verification Checklist — Session 10

- [ ] 10 reusable UI components created in `apps/web/components/ui/`
- [ ] 6 data fetching hooks created in `apps/web/hooks/`
- [ ] Items list page: search, filter, pagination, row click all work
- [ ] Create item page: form validation, submit, redirect
- [ ] Item detail page: all data displayed, location prices, modifiers
- [ ] Edit item page: pre-filled, submit, redirect
- [ ] Categories page: hierarchy display, CRUD via dialogs
- [ ] Tax categories page: list, create, edit
- [ ] Sidebar shows catalog links only when entitlement is active
- [ ] All forms use Zod validation with field-level error display
- [ ] All successful writes show toast notification
- [ ] `pnpm turbo build` succeeds (no TypeScript errors)
- [ ] All 16 tests pass

---

## What "Done" Looks Like After Milestone 3

When all three sessions (8, 9, 10) are complete:

1. **A logged-in user** can navigate to the Catalog section in the sidebar
2. They can **browse, search, and filter** catalog items
3. They can **create new items** with full validation (name, price, type, category, tax, modifiers)
4. They can **edit existing items** and see audit-logged changes
5. They can **deactivate items** (soft delete)
6. They can **manage categories** in a hierarchy
7. They can **manage tax categories** with rates in basis points
8. They can **set location-specific price overrides**
9. **Events are flowing** — every write emits a canonical event through the outbox
10. **Audit trail is recording** — every change is logged with before/after diffs
11. The **internal API** is ready for the Orders module to use in Milestone 5
12. This module **becomes the template** — every future module follows the same file structure, command/query pattern, event flow, and API design

**Update your PROJECT_BRIEF.md** state to:

```
## Current Project State

Milestones 0–3 are complete:
- [everything from before]
- Catalog module: 7 tables, 9 commands, 5 queries, 16 API routes, internal read API
- Catalog events: 11 event types flowing through outbox
- Catalog frontend: items CRUD, categories, tax categories, modifier groups
- 10 reusable UI components (DataTable, SearchInput, CurrencyInput, Toast, etc.)
- Seed data: 10 items, 8 categories, 4 tax categories, 3 modifier groups, 2 location overrides

Next: Milestone 4 — Tenant Onboarding (self-service signup flow)
```
