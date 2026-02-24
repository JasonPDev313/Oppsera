# Modifier Groups Phase 2 — Enterprise Implementation Plan

## Context
The Modifier Groups system has a complete foundation: schema (groups, modifiers, categories, item assignments), 8 commands, 4 queries, POS catalog loader, instruction modes (none/extra/on_side), reporting suite (3 read models, 8 query services, 7-tab report page). Phase 2 adds enterprise capabilities: inventory depletion, advanced pricing, nested modifiers, modifier quantity, and half/half support.

## What Already Exists (reference only)
- **Schema:** `catalog_modifier_groups`, `catalog_modifiers` (with cost NUMERIC(10,4), priceAdjustment, extraPriceDelta, kitchenLabel, instruction flags), `catalog_modifier_group_categories`, `catalog_item_modifier_groups` (with per-item overrides)
- **Reporting:** `rm_modifier_item_sales`, `rm_modifier_daypart`, `rm_modifier_group_attach` — 8 query services, recommendation engine, 7-tab reports page
- **POS:** ModifierDialog (instruction buttons, auto-selection, validation), FnbModifierDrawer, getCatalogForPOS single-query loader
- **86 board:** supports `entityType='modifier'` for out-of-stock marking
- **Order line JSONB:** `{ modifierId, modifierGroupId?, name, priceAdjustment(cents), isDefault, instruction? }`
- **Event enrichment:** `order.placed.v1` includes modifier data per line with modifierGroupId and instruction

---

## Phase 2A — Inventory Depletion + Modifier Quantity (Highest ROI)

### Step 1: Migration 0188
**File:** `packages/db/migrations/0188_modifier_phase2_enterprise.sql`

**New table: `modifier_inventory_mappings`**

```sql
CREATE TABLE IF NOT EXISTS modifier_inventory_mappings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  modifier_id TEXT NOT NULL REFERENCES catalog_modifiers(id),
  catalog_item_id TEXT,                    -- nullable = all parent items
  inventory_item_id TEXT NOT NULL,         -- FK to inventory_items
  portion_quantity NUMERIC(10,4) NOT NULL, -- amount consumed per selection (e.g., 0.5 oz)
  portion_uom_id TEXT,                     -- FK to uoms
  extra_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,  -- "Extra" uses 1.5x
  none_multiplier NUMERIC(4,2) NOT NULL DEFAULT 0,     -- "None" uses 0x
  waste_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS: 4 policies on tenant_id
-- UNIQUE: (tenant_id, modifier_id, inventory_item_id, catalog_item_id) with COALESCE for null
-- Indexes: (tenant_id, modifier_id), (tenant_id, inventory_item_id)
```

**ALTER `catalog_modifiers` — add columns:**

```sql
ALTER TABLE catalog_modifiers ADD COLUMN IF NOT EXISTS allow_quantity BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE catalog_modifiers ADD COLUMN IF NOT EXISTS max_quantity INTEGER NOT NULL DEFAULT 1;
```

**New table: `modifier_presets`**

```sql
CREATE TABLE IF NOT EXISTS modifier_presets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  selections JSONB NOT NULL DEFAULT '[]',
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS: 4 policies on tenant_id
-- UNIQUE: (tenant_id, user_id, name, catalog_item_id)
```

### Step 2: Drizzle Schema
**File:** `packages/db/src/schema/modifier-enterprise.ts` (NEW)

- Define `modifierInventoryMappings`, `modifierPresets` tables
- Export from `packages/db/src/schema/index.ts`

**File:** `packages/db/src/schema/catalog.ts` (MODIFY)

- Add `allowQuantity` and `maxQuantity` columns to `catalogModifiers`

### Step 3: Inventory Mapping Commands
**Location:** `packages/modules/catalog/src/commands/`

| Command | File | Purpose |
|---------|------|---------|
| `createModifierInventoryMapping` | `modifier-inventory.ts` (NEW) | Link modifier → inventory item with portion/multipliers |
| `updateModifierInventoryMapping` | same | Update portion qty, multipliers, waste% |
| `deleteModifierInventoryMapping` | same | Soft-delete (isActive=false) |
| `bulkCreateModifierInventoryMappings` | same | Batch creation for setup efficiency |

### Step 4: Inventory Mapping Queries
**Location:** `packages/modules/catalog/src/queries/`

| Query | File | Purpose |
|-------|------|---------|
| `getModifierInventoryMappings` | `modifier-inventory-queries.ts` (NEW) | List mappings for a modifier or inventory item |
| `getModifierInventoryMappingsForOrder` | same | Batch lookup: given modifier IDs → return all mappings (used by placeOrder enrichment) |

### Step 5: Order-Time Depletion
**File:** `packages/modules/inventory/src/events/consumers.ts` (MODIFY)

Extend `handleOrderPlaced` with a third pass after the existing item/package depletion:

```
Pass 3: Modifier inventory depletion
  - For each line in the event, check line.modifiers[].inventoryMappings
  - Compute: depletionQty = portionQty * instructionMultiplier * modifierQty * lineQty * (1 + waste%/100)
  - instructionMultiplier: 'extra' → extraMultiplier, 'none' → noneMultiplier, default → 1.0
  - Create movement: { type: 'modifier_depletion', referenceType: 'order_line_modifier', referenceId: '{orderId}:{lineId}:{modifierId}' }
  - Idempotent via existing UNIQUE index on (tenantId, referenceType, referenceId, inventoryItemId, movementType)
```

Extend `handleOrderVoided` similarly — create reversal movements for modifier depletion.

**File:** `packages/modules/orders/src/commands/place-order.ts` (MODIFY)

Enrich modifier data in event payload with inventory mappings:

```
Before publishWithOutbox (outside transaction, same pattern as package component prices):
  1. Collect all unique modifierIds from order lines
  2. Batch-fetch modifier_inventory_mappings for those IDs
  3. Attach inventoryMappings[] to each modifier in the event lines
```

### Step 6: Auto-86 on Low Stock
**File:** `packages/modules/inventory/src/events/consumers.ts` (MODIFY)

After modifier depletion movements, check if any depleted ingredient dropped below reorder point:

- If below threshold, call existing `eightySixItem(entityType='modifier', entityId=modifierId)` pattern
- Emit `inventory.modifier_low_stock.v1` event

### Step 7: Modifier Quantity in Order Validation
**File:** `packages/modules/orders/src/validation.ts` (MODIFY)

Add to modifier JSONB schema:

```typescript
qty: z.number().int().positive().default(1).optional(),
```

### Step 8: ModifierDialog Quantity Stepper
**File:** `apps/web/src/components/pos/ModifierDialog.tsx` (MODIFY)

- Add `modQuantities` state: `Record<modId, number>` (default 1)
- When modifier has `allowQuantity=true`, render +/- stepper instead of checkbox
- Enforce `maxQuantity` cap
- Include `qty` in output modifier objects
- Update price display: show `$X.XX × N` when qty > 1
- Update `resolveModPrice` to multiply by qty

### Step 9: Modifier Presets (Repeat Last + Save/Load)
**File:** `apps/web/src/components/pos/ModifierDialog.tsx` (MODIFY)

- "Repeat Last" button: reads `localStorage('oppsera:last_modifiers:{itemId}')`, pre-fills selections
- On confirm, save selections to localStorage

**Files:** `packages/modules/catalog/src/commands/modifier-presets.ts` (NEW), `packages/modules/catalog/src/queries/modifier-preset-queries.ts` (NEW)

- `createModifierPreset`, `updateModifierPreset`, `deleteModifierPreset`
- `listModifierPresets(tenantId, userId, catalogItemId)`

### Step 10: API Routes
**Location:** `apps/web/src/app/api/v1/catalog/modifiers/`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/modifiers/[id]/inventory-mappings` | List mappings for modifier |
| POST | `/modifiers/[id]/inventory-mappings` | Create mapping |
| PATCH | `/modifiers/inventory-mappings/[mapId]` | Update mapping |
| DELETE | `/modifiers/inventory-mappings/[mapId]` | Deactivate mapping |
| POST | `/modifiers/[id]/inventory-mappings/bulk` | Bulk create |
| GET | `/modifiers/presets` | List presets for item |
| POST | `/modifiers/presets` | Create preset |
| DELETE | `/modifiers/presets/[id]` | Delete preset |

### Step 11: Admin UI for Inventory Mappings
**File:** `apps/web/src/components/catalog/modifier-inventory-mappings.tsx` (NEW)

Table showing modifier → ingredient mappings with:

- Modifier name, ingredient dropdown, portion qty, UOM, extra/none multipliers, waste%
- Add/edit/remove rows
- Accessible from modifier group detail/edit page

### Step 12: Update Reporting Consumers
**File:** `packages/modules/reporting/src/consumers/handle-order-placed-modifiers.ts` (MODIFY)

Account for modifier qty in `times_selected` and `revenue_dollars` aggregation:
- `times_selected += modifier.qty` (not always 1)
- `revenue_dollars += (priceAdjustmentCents * qty) / 100`

---

## Phase 2B — Advanced Pricing Engine + Nested Modifiers

### Step 13: Migration 0189
**File:** `packages/db/migrations/0189_modifier_pricing_nesting.sql`

**New table: `modifier_pricing_rules`**

```sql
CREATE TABLE IF NOT EXISTS modifier_pricing_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  modifier_id TEXT NOT NULL REFERENCES catalog_modifiers(id),
  -- Scoping (all nullable = applies to all)
  catalog_item_id TEXT,
  size_modifier_id TEXT,
  channel TEXT,                           -- 'pos' | 'online' | 'qr' | 'kiosk'
  -- Quantity tiers
  included_quantity INTEGER,              -- first N free
  quantity_min INTEGER,                   -- tier start (e.g., 4th topping)
  quantity_max INTEGER,                   -- tier end (null = unlimited)
  -- Pricing
  price_cents INTEGER,                    -- flat override in cents
  percent_delta NUMERIC(5,2),             -- percentage of parent item price
  -- Scheduling
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  daypart TEXT[],
  day_of_week INTEGER[],
  -- Priority
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS + indexes
```

**New table: `modifier_visibility_rules`**

```sql
CREATE TABLE IF NOT EXISTS modifier_visibility_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  modifier_group_id TEXT NOT NULL REFERENCES catalog_modifier_groups(id),
  requires_modifier_id TEXT,
  requires_size_modifier_id TEXT,
  requires_channel TEXT,
  requires_item_type TEXT,
  hide_when_false BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS + indexes
```

**ALTER `catalog_modifiers`:**

```sql
ALTER TABLE catalog_modifiers ADD COLUMN IF NOT EXISTS child_modifier_group_id TEXT REFERENCES catalog_modifier_groups(id);
```

**ALTER `catalog_modifier_groups`:**

```sql
ALTER TABLE catalog_modifier_groups ADD COLUMN IF NOT EXISTS support_portions BOOLEAN NOT NULL DEFAULT false;
```

### Step 14: Pricing Resolution Service
**File:** `packages/modules/catalog/src/services/pricing-engine.ts` (NEW)

```typescript
interface PricingContext {
  catalogItemId: string;
  sizeModifierId?: string;
  channel: 'pos' | 'online' | 'qr' | 'kiosk';
  quantity: number;
  occurredAt: Date;
  parentItemPriceCents: number;
}

function resolveModifierPrice(modifierId: string, context: PricingContext, rules: PricingRule[]): number
```

**Resolution order:** most specific rule wins (item+size+channel > item+channel > item > channel > global). Within same specificity, highest priority wins. Fall back to `catalog_modifiers.priceAdjustment` if no rules match.

**Included quantity logic:** For quantity Q with included_quantity I:

- First I selections: $0 each
- Selections I+1 through Q: rule price each
- Example: 3 included, 5 selected, $1.50 each → total = 2 × $1.50 = $3.00

### Step 15: Pricing Rule Commands & Queries
**Location:** `packages/modules/catalog/src/commands/modifier-pricing.ts` (NEW)

| Command | Purpose |
|---------|---------|
| `createModifierPricingRule` | Create a pricing rule with scoping/tiers/scheduling |
| `updateModifierPricingRule` | Update rule fields |
| `deleteModifierPricingRule` | Deactivate rule |
| `bulkCreatePricingRules` | Batch creation |

**Location:** `packages/modules/catalog/src/queries/modifier-pricing-queries.ts` (NEW)

| Query | Purpose |
|-------|---------|
| `getModifierPricingRules` | List rules for a modifier (with filters) |
| `getPricingRulesForPOS` | Batch: given modifierIds → all active rules (for POS catalog) |

### Step 16: Extend getCatalogForPOS
**File:** `packages/modules/catalog/src/queries/get-catalog-for-pos.ts` (MODIFY)

Add 7th parallel query to load active pricing rules for all modifiers in the catalog. Attach `pricingRules[]` to each modifier in the POS catalog result. Frontend resolves prices client-side using the pricing engine.

### Step 17: Nested Modifier Schema + Commands
**File:** `packages/modules/catalog/src/commands/modifier-groups.ts` (MODIFY)

- When creating/updating a modifier, allow setting `childModifierGroupId`
- Enforce max nesting depth = 3 (walk the chain at creation time)
- Detect cycles: a group cannot be its own ancestor

**File:** `packages/modules/catalog/src/commands/modifier-visibility.ts` (NEW)

| Command | Purpose |
|---------|---------|
| `createVisibilityRule` | Create conditional visibility rule |
| `updateVisibilityRule` | Update rule |
| `deleteVisibilityRule` | Deactivate |

### Step 18: Nested Modifier POS UI
**File:** `apps/web/src/components/pos/ModifierDialog.tsx` (MODIFY)

- Add `groupStack` state: array of group IDs for breadcrumb navigation
- When a modifier with `childModifierGroupId` is selected, push child group onto stack
- Render breadcrumb: "Pizza > Crust > Crust Extras"
- Back button pops the stack
- Order line stores nested modifiers as flat array with `parentModifierId` reference

### Step 19: Half/Half Support
**File:** `apps/web/src/components/pos/ModifierDialog.tsx` (MODIFY)

- When group has `supportPortions=true`, show portion toggle per modifier: Whole / Left Half / Right Half
- Add `portionType` to output modifier objects
- Kitchen label rendering: "1/2 Pepperoni, 1/2 Mushroom"

**File:** `packages/modules/orders/src/validation.ts` (MODIFY)

Add to modifier schema:

```typescript
portionType: z.enum(['whole', 'left', 'right']).default('whole').optional(),
parentModifierId: z.string().optional(),
```

Inventory adjustment: Half portions use 0.5x the portionQuantity in depletion calculations.

### Step 20: Pricing + Nesting API Routes
**Location:** `apps/web/src/app/api/v1/catalog/modifiers/`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/modifiers/[id]/pricing-rules` | List pricing rules |
| POST | `/modifiers/[id]/pricing-rules` | Create rule |
| PATCH | `/modifiers/pricing-rules/[ruleId]` | Update rule |
| DELETE | `/modifiers/pricing-rules/[ruleId]` | Deactivate |
| POST | `/modifiers/[id]/pricing-rules/bulk` | Bulk create |
| GET | `/modifier-groups/[id]/visibility-rules` | List visibility rules |
| POST | `/modifier-groups/[id]/visibility-rules` | Create visibility rule |
| PATCH | `/modifier-groups/visibility-rules/[ruleId]` | Update |
| DELETE | `/modifier-groups/visibility-rules/[ruleId]` | Deactivate |
| POST | `/modifiers/resolve-price` | Preview pricing (used by admin UI) |

### Step 21: Included Quantity UX
**File:** `apps/web/src/components/pos/ModifierDialog.tsx` (MODIFY)

For groups with pricing rules that have `included_quantity`:

- Show "N included" badge on group header
- First N selections show "Included" instead of "$0.00"
- Selections beyond N show the overage price
- Running total updates dynamically

---

## Phase 2C — Deferred (Simplified Scope)

These features are documented in the prompt but deferred to a later session:

- **Location Overrides** — Simplified approach: add `override_price_cents` and `override_is_active` columns to `catalog_item_modifier_groups` junction (per-location already scoped via the assignment). No full template/version system yet.
- **Customer Personalization** — Use existing `customer_preferences` table with `category: 'modifier'`. No new tables needed. Store last modifier selections per customer×item. Surface in ModifierDialog when customer is attached to the order.
- **What-If Price Simulation** — Single query service using existing `rm_modifier_item_sales` data with elasticity formula. Add as tab 8 in modifier reports page. No new tables.
- **Loyalty-Based Free Modifiers** — Requires loyalty tier resolution at POS time. Depends on customer management integration being wired in POS. Deferred.

---

## Key Files to Modify

| File | Change |
|------|--------|
| `packages/db/migrations/0188_modifier_phase2_enterprise.sql` | NEW — inventory mappings, presets, qty columns |
| `packages/db/migrations/0189_modifier_pricing_nesting.sql` | NEW — pricing rules, visibility rules, nesting, portions |
| `packages/db/src/schema/modifier-enterprise.ts` | NEW — Drizzle definitions for all new tables |
| `packages/db/src/schema/catalog.ts` | Add allowQuantity, maxQuantity, childModifierGroupId, supportPortions |
| `packages/db/src/schema/index.ts` | Export new schema |
| `packages/db/migrations/meta/_journal.json` | Add entries idx 188, 189 |
| `packages/modules/catalog/src/commands/modifier-inventory.ts` | NEW — CRUD for inventory mappings |
| `packages/modules/catalog/src/commands/modifier-pricing.ts` | NEW — CRUD for pricing rules |
| `packages/modules/catalog/src/commands/modifier-visibility.ts` | NEW — CRUD for visibility rules |
| `packages/modules/catalog/src/commands/modifier-presets.ts` | NEW — CRUD for presets |
| `packages/modules/catalog/src/queries/modifier-inventory-queries.ts` | NEW |
| `packages/modules/catalog/src/queries/modifier-pricing-queries.ts` | NEW |
| `packages/modules/catalog/src/queries/modifier-preset-queries.ts` | NEW |
| `packages/modules/catalog/src/services/pricing-engine.ts` | NEW — resolveModifierPrice |
| `packages/modules/catalog/src/queries/get-catalog-for-pos.ts` | Add pricing rules to POS catalog |
| `packages/modules/catalog/src/index.ts` | Export new commands/queries |
| `packages/modules/inventory/src/events/consumers.ts` | Modifier depletion + auto-86 |
| `packages/modules/orders/src/validation.ts` | Add qty, portionType, parentModifierId |
| `packages/modules/orders/src/commands/place-order.ts` | Enrich event with inventory mappings |
| `packages/modules/reporting/src/consumers/handle-order-placed-modifiers.ts` | Account for qty in aggregation |
| `apps/web/src/components/pos/ModifierDialog.tsx` | Qty stepper, nesting stack, half/half, presets, included qty badges |
| `apps/web/src/components/catalog/modifier-inventory-mappings.tsx` | NEW — admin mapping UI |
| `apps/web/src/app/api/v1/catalog/modifiers/` | NEW — ~18 API routes |

---

## Integration Points (Reference Only — do not rebuild)

- **Inventory movements:** `packages/modules/inventory/src/commands/` — use existing `adjustInventory` pattern
- **86 board:** `packages/modules/fnb/src/commands/eighty-six-item.ts` — already supports `entityType='modifier'`
- **POS catalog loader:** `getCatalogForPOS` — extend the single-query pattern
- **Reporting read models:** `rm_modifier_item_sales` — extend aggregation for qty
- **UOM system:** `uoms` + `itemUomConversions` — reuse for portion UOM

---

## Build Order

| Step | What | Deps |
|------|------|------|
| 1 | Migration 0188 + Drizzle schema (inventory mappings, presets, qty columns) | — |
| 2 | Inventory mapping commands + queries | 1 |
| 3 | Order validation extension (qty, portionType, parentModifierId) | — |
| 4 | placeOrder event enrichment (attach inventory mappings) | 1, 2 |
| 5 | Inventory consumer extension (modifier depletion + auto-86) | 1, 4 |
| 6 | Reporting consumer update (qty-aware aggregation) | 3 |
| 7 | ModifierDialog: qty stepper + repeat last + presets | 1, 3 |
| 8 | Preset commands/queries + API routes | 1 |
| 9 | Inventory mapping API routes + admin UI | 2 |
| 10 | Migration 0189 + schema (pricing rules, visibility, nesting, portions) | — |
| 11 | Pricing engine service (resolveModifierPrice) | 10 |
| 12 | Pricing rule commands/queries | 10 |
| 13 | getCatalogForPOS: add pricing rules | 11, 12 |
| 14 | Visibility rule commands | 10 |
| 15 | Nested modifier commands (child group, depth validation, cycle detection) | 10 |
| 16 | ModifierDialog: nesting stack + breadcrumb | 15 |
| 17 | ModifierDialog: half/half support | 10 |
| 18 | ModifierDialog: included qty badges + pricing resolution | 11, 13 |
| 19 | Pricing + nesting + visibility API routes | 12, 14, 15 |
| 20 | Module exports update | all |
| 21 | Tests (~120 tests) | all |

---

## Tests (~120 tests across 6 files)

| File | Scope | Est |
|------|-------|-----|
| `modifier-inventory-mappings.test.ts` | Mapping CRUD, multipliers, batch | ~15 |
| `modifier-inventory-depletion.test.ts` | Consumer depletion, void reversal, auto-86, qty×portion | ~25 |
| `modifier-pricing-engine.test.ts` | Resolution priority, tiers, included qty, scheduling, percent | ~25 |
| `modifier-nesting.test.ts` | Depth enforcement, cycle detection, breadcrumb traversal | ~15 |
| `modifier-presets.test.ts` | Preset CRUD, shared presets, repeat last | ~10 |
| `modifier-phase2-api.test.ts` | API route contracts for all new endpoints | ~30 |

---

## Verification

- `pnpm db:migrate` after creating migrations
- `pnpm type-check` — no new type errors
- `pnpm test --filter @oppsera/module-catalog` — all existing + new tests pass
- `pnpm test --filter @oppsera/module-inventory` — depletion tests pass
- `pnpm test --filter @oppsera/module-reporting` — qty-aware aggregation tests pass
- Manual: place order with qty=2 modifier → verify inventory depleted 2× portion
- Manual: place order with 'extra' instruction → verify 1.5× depletion
- Manual: void order → verify reversal movements created
- Manual: pricing rule with included_quantity=3 → verify first 3 free, 4th+ priced
- `pnpm build` — clean build
