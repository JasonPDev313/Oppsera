# CLAUDE PROMPT — OPPSERA MODIFIER GROUPS PHASE 2 (ENTERPRISE)

You are a Staff ERP Architect + Restaurant POS domain expert.

Extend the Modifier Groups module to a complete enterprise system with advanced pricing, inventory depletion, nested modifiers, and location management.

## What Already Exists (DO NOT REBUILD)

The following are already implemented and should be referenced, not recreated:

### Schema (catalog.ts + modifier-reporting.ts)
- `catalog_modifier_groups` — name, selectionType (single/multi), isRequired, min/maxSelections, instructionMode (none/all/per_option), defaultBehavior, channelVisibility (JSONB), sortOrder
- `catalog_modifiers` — priceAdjustment, extraPriceDelta, kitchenLabel, allowNone/Extra/OnSide, cost (NUMERIC 10,4), isDefaultOption, isActive
- `catalog_modifier_group_categories` — hierarchical categories with parentId
- `catalog_item_modifier_groups` — junction with per-item overrides (overrideRequired, overrideMin/MaxSelections, overrideInstructionMode, promptOrder)
- `rm_modifier_item_sales` — modifier x item x day read model (times_selected, revenue, instruction counters, void tracking)
- `rm_modifier_daypart` — modifier x daypart x day
- `rm_modifier_group_attach` — group-level attach rate (eligible_line_count, lines_with_selection, revenue_impact)

### Backend
- 8 modifier commands (CRUD groups, categories, assignments, bulk assign)
- 4 modifier queries + getCatalogForPOS (single-query POS loader with modifier data)
- 2 event consumers (order.placed + order.voided modifier tracking)
- 8 reporting query services (performance, group-health, upsell-impact, daypart-heatmap, group-item-heatmap, location-heatmap, waste-signals, complexity)
- Recommendation engine (keep/optimize/remove/investigate/review_prompt/new)
- 10 API routes (8 data + 2 CSV export)

### Frontend
- ModifierDialog (Retail POS) — instruction buttons, auto-selection, validation, per-item overrides
- FnbModifierDrawer — F&B POS modifier selection
- 7-tab Modifier Reports page (Dashboard, Group Health, Item Performance, Upsell & Margin, Adoption Funnel, Waste Signals, Heatmaps)
- HeatmapGrid reusable component
- 8 data hooks (use-modifier-reports.ts)

### Other Integrations
- 86 board supports `entityType='modifier'` for out-of-stock marking
- Kitchen labels via `kitchenLabel` column (separate from display name)
- Cost column for COGS/margin analysis
- Channel visibility filtering in POS catalog query

---

## Phase 2 Objectives

Build the remaining enterprise capabilities that DON'T exist yet:
1. Advanced pricing engine (included qty, tiered, size-based, time-based)
2. Inventory & recipe depletion at order time
3. Nested & conditional modifiers
4. Location overrides & version management
5. POS runtime enhancements (half/half, modifier qty, included count)
6. Customer personalization (preferences, loyalty-based free modifiers)
7. What-if price simulation tool

---

## 1. Advanced Pricing Engine

The current system has a flat `priceAdjustment` + `extraPriceDelta` per modifier. Extend to support dynamic pricing rules.

### New table: `modifier_pricing_rules`
```
id, tenant_id, modifier_id,
-- Scoping (all nullable — null = applies to all)
catalog_item_id,           -- price differs by parent item
size_modifier_id,          -- price differs by selected size (e.g., Large drink)
channel,                   -- 'pos' | 'online' | 'qr' | 'kiosk'
-- Quantity tiers
included_quantity,         -- first N free (e.g., 3 toppings included)
quantity_min,              -- tier start (e.g., 4th topping)
quantity_max,              -- tier end (null = unlimited)
-- Pricing
price_cents INTEGER,       -- flat override (cents, matching orders layer)
percent_delta NUMERIC(5,2),-- percentage of parent item price
-- Scheduling
effective_from TIMESTAMPTZ,
effective_to TIMESTAMPTZ,
daypart TEXT[],            -- ['breakfast', 'lunch'] for happy hour
day_of_week INTEGER[],     -- [5, 6] for weekend pricing
-- Priority
priority INTEGER DEFAULT 0,-- higher wins on conflict
is_active BOOLEAN DEFAULT true,
created_at, updated_at
```

### Pricing resolution logic
Create `resolveModifierPrice(modifierId, context)` in `packages/modules/catalog/src/services/`:
```typescript
interface PricingContext {
  catalogItemId: string;
  sizeModifierId?: string;   // selected size modifier
  channel: 'pos' | 'online' | 'qr' | 'kiosk';
  quantity: number;           // how many of this modifier selected
  occurredAt: Date;           // for time-based rules
  parentItemPriceCents: number; // for percentage rules
}
```
Resolution order: most specific rule wins (item+size+channel > item+channel > item > channel > global). Within same specificity, highest `priority` wins. Fall back to `catalog_modifiers.priceAdjustment` if no rules match.

### "Included quantity" UX
For groups with included pricing (e.g., "Pick 3 toppings — extra $1.50 each"):
- Show "3 included" badge on group header
- First N selections show "$0.00" or "Included"
- Selections beyond N show the overage price
- The `included_quantity` lives on the pricing rule, not the group

---

## 2. Inventory & Recipe Integration

Currently modifiers have a `cost` column for margin analysis but no actual inventory depletion.

### New table: `modifier_inventory_mappings`
```
id, tenant_id, modifier_id,
-- Scoping (nullable = all parent items)
catalog_item_id,
-- Depletion target
inventory_item_id,         -- FK to inventory_items
portion_quantity NUMERIC(10,4), -- amount consumed per selection (e.g., 0.5 oz)
portion_uom_id,            -- FK to uoms (matches receiving UOM system)
-- Instruction multipliers
extra_multiplier NUMERIC(4,2) DEFAULT 1.5, -- "Extra" uses 1.5x portion
none_multiplier NUMERIC(4,2) DEFAULT 0,    -- "None" uses 0x
-- Waste tracking
waste_percent NUMERIC(5,2) DEFAULT 0,      -- expected waste factor
is_active, created_at, updated_at
```

### Order-time depletion
Extend the `order.placed.v1` consumer in `packages/modules/inventory/src/consumers/`:
- For each modifier on each order line, look up `modifier_inventory_mappings`
- Compute: `depletionQty = portion_quantity * instructionMultiplier * lineQty * (1 + waste_percent/100)`
- Create inventory movement: `{ type: 'modifier_depletion', referenceType: 'order_line_modifier', referenceId: '{orderId}:{lineId}:{modifierId}' }`
- On `order.voided.v1`, create reversal movements

### Integration with 86 board
When inventory drops below reorder point for a modifier's mapped ingredient:
- Auto-86 the modifier via existing `eightySixItem(entityType='modifier', ...)`
- Emit `inventory.modifier_low_stock.v1` event

---

## 3. Nested & Conditional Modifiers

Support modifier chains: selecting a modifier opens a child modifier group.

### Schema changes

**ALTER `catalog_modifiers`:**
```
child_modifier_group_id TEXT REFERENCES catalog_modifier_groups(id)
```

**New table: `modifier_visibility_rules`**
```
id, tenant_id, modifier_group_id,
-- Condition type (one of these is set)
requires_modifier_id,      -- visible only if this modifier is selected
requires_size_modifier_id, -- visible only if this size is selected
requires_channel,          -- visible only on this channel
requires_item_type,        -- visible only for this item typeGroup
-- Behavior
hide_when_false BOOLEAN DEFAULT true, -- hide vs disable
is_active, created_at, updated_at
```

### POS runtime
- When a modifier with `child_modifier_group_id` is selected, push the child group onto a stack
- ModifierDialog renders the stack as breadcrumb navigation (e.g., "Pizza > Crust > Crust Extras")
- Max nesting depth: 3 levels (enforced at creation time)
- Order line JSONB stores nested modifiers as flat array with `parentModifierId` reference

### Example: Pizza customization
```
Pizza Base (required, single)
  ├── Thin Crust → opens "Thin Crust Extras" group
  ├── Hand Tossed
  └── Deep Dish → opens "Deep Dish Extras" group
      ├── Extra Cheese
      └── Stuffed Crust (+$2.00)
```

---

## 4. Location Overrides & Version Management

Support corporate templates that locations can customize.

### New table: `modifier_group_templates`
```
id, tenant_id,
name, description,
snapshot JSONB,            -- full group + modifiers + pricing rules
is_published BOOLEAN DEFAULT false,
version INTEGER DEFAULT 1,
created_by, created_at, updated_at
```

### New table: `modifier_group_location_overrides`
```
id, tenant_id, location_id, modifier_group_id,
-- Which fields are overridden (null = use corporate default)
override_name TEXT,
override_is_required BOOLEAN,
override_min_selections INTEGER,
override_max_selections INTEGER,
override_modifiers JSONB,  -- [{modifierId, overridePrice, overrideIsActive, overrideKitchenLabel}]
-- Lifecycle
status TEXT DEFAULT 'active', -- 'active' | 'suspended'
effective_from TIMESTAMPTZ,
effective_to TIMESTAMPTZ,
created_at, updated_at
```

### Version history
- Extend the existing `catalog_item_change_logs` pattern to modifiers
- Log field-level diffs on every update via `computeModifierGroupDiff()`
- Store in `modifier_group_change_logs` (append-only, same RLS pattern)

### Template workflow
1. Corporate creates a template with modifier group + all modifiers + pricing rules
2. Template published → all locations without overrides inherit it
3. Location can override specific fields (price, availability, kitchen label)
4. Corporate updates template → locations get update UNLESS they have an active override for that field
5. `getCatalogForPOS` resolves: location override > corporate template > base group

---

## 5. POS Runtime Enhancements

### Modifier quantity selector
Allow selecting a modifier multiple times (e.g., "Double bacon"):
- Add `allowQuantity BOOLEAN DEFAULT false` and `maxQuantity INTEGER DEFAULT 1` to `catalog_modifiers`
- ModifierDialog shows a +/- stepper instead of checkbox when `allowQuantity=true`
- Order line JSONB: add `quantity` field to modifier objects
- Pricing engine uses this quantity for tier calculations

### Half/half support
For pizza-style items where modifiers apply to portions:
- Add `supportPortions BOOLEAN DEFAULT false` to `catalog_modifier_groups`
- Add `portionType TEXT` ('whole' | 'left' | 'right') to order line modifier JSONB
- ModifierDialog shows "Whole / Left Half / Right Half" toggle per modifier
- Kitchen label renders: "1/2 Pepperoni, 1/2 Mushroom"
- Inventory depletion uses 0.5x for half portions

### Repeat last modifiers
- Store last modifier selections per item in localStorage: `oppsera:last_modifiers:{itemId}`
- Show "Repeat Last" button in ModifierDialog when previous selections exist
- Button pre-fills all selections from the stored state

### Modifier favorites/presets
**New table: `modifier_presets`**
```
id, tenant_id, user_id,
name,                      -- "My usual burger"
catalog_item_id,           -- which item this preset is for
selections JSONB,          -- [{modifierId, quantity, instruction, portionType}]
is_shared BOOLEAN DEFAULT false, -- visible to all staff at location
created_at, updated_at
```
- Show "Presets" button in ModifierDialog
- Staff can save current selections as a preset
- Shared presets appear for all users on that terminal

### Auto-suggest modifiers (AI-ready)
- Add `suggest_score` computed column to modifier reporting queries
- Score = `(attachRate * 0.4) + (revenuePerSelection * 0.3) + (marginPercent * 0.3)`
- ModifierDialog sorts optional modifiers by suggest_score descending
- Show top 3 suggestions with "Popular" badge

---

## 6. Customer Personalization

### Saved preferences
Extend `customer_preferences` (category: 'modifier'):
- When a customer places an order with modifiers, store their selections
- On next order for the same item, show "Last time: Extra Bacon, No Onion" prompt
- Staff can tap to auto-apply previous selections

### Loyalty-based free modifiers
**New table: `modifier_loyalty_rules`**
```
id, tenant_id,
loyalty_tier TEXT,          -- 'silver' | 'gold' | 'platinum'
modifier_group_id,
free_quantity INTEGER,      -- how many free selections per order
modifier_ids TEXT[],        -- specific modifiers (null = any in group)
is_active, created_at, updated_at
```
- At POS, detect customer loyalty tier
- Apply free modifier pricing automatically
- Show "FREE (Gold Member)" badge on eligible modifiers
- Track redemptions in `rm_modifier_item_sales` (new `loyalty_free_count` column)

---

## 7. What-If Price Simulation

Add a simulation tool to the existing Modifier Reports page (new tab: "Price Simulation").

### Backend
**New query: `simulateModifierPriceChange`**
```typescript
interface SimulationInput {
  tenantId: string;
  modifierId: string;
  newPriceCents: number;
  dateFrom: string;
  dateTo: string;
  elasticityFactor?: number; // default 0.8 (80% retention)
}
interface SimulationResult {
  currentRevenue: number;
  projectedRevenue: number;
  currentSelections: number;
  projectedSelections: number;
  revenueDelta: number;
  marginDelta: number;
}
```
- Uses historical data from `rm_modifier_item_sales`
- Applies price elasticity: `projectedSelections = currentSelections * (1 - elasticityFactor * (priceDelta / currentPrice))`
- Returns revenue/margin impact

### Frontend
- Slider to adjust modifier price
- Real-time chart showing projected revenue curve
- Batch simulation: test price changes across multiple modifiers

---

## Build Order

| Step | What | Depends On |
|---|---|---|
| 1 | Migration + Drizzle schema (pricing rules, inventory mappings, visibility rules, templates, overrides, presets, loyalty rules) | -- |
| 2 | Pricing engine service (`resolveModifierPrice`) | 1 |
| 3 | Inventory depletion (order consumer extension + 86 auto-trigger) | 1 |
| 4 | Nested modifier schema + creation commands | 1 |
| 5 | Location override commands + template workflow | 1 |
| 6 | ModifierDialog enhancements (quantity, half/half, nesting, presets) | 2, 4 |
| 7 | POS catalog query updates (resolve overrides + pricing rules) | 2, 5 |
| 8 | Customer preference storage + loyalty rules | 1 |
| 9 | What-if simulation query + UI | existing read models |
| 10 | Tests (~100 tests) | all |

---

## Key Files to Modify

| File | Change |
|---|---|
| `packages/db/src/schema/modifier-pricing.ts` | **NEW** — pricing rules, inventory mappings, visibility rules, presets, loyalty rules |
| `packages/db/src/schema/modifier-management.ts` | **NEW** — templates, overrides, change logs |
| `packages/db/src/schema/catalog.ts` | ALTER catalog_modifiers (child_modifier_group_id, allowQuantity, maxQuantity) |
| `packages/db/src/schema/modifier-reporting.ts` | ALTER rm_modifier_item_sales (loyalty_free_count) |
| `packages/modules/catalog/src/services/pricing-engine.ts` | **NEW** — resolveModifierPrice |
| `packages/modules/catalog/src/commands/modifier-*.ts` | Extend for nesting, templates, overrides |
| `packages/modules/catalog/src/queries/get-catalog-for-pos.ts` | Resolve pricing rules + location overrides |
| `packages/modules/inventory/src/consumers/` | Extend order.placed consumer for modifier depletion |
| `apps/web/src/components/pos/ModifierDialog.tsx` | Quantity stepper, half/half, nesting stack, presets |
| `apps/web/src/app/(dashboard)/reports/modifiers/modifier-reports-content.tsx` | Add Price Simulation tab |

---

## Integration Points (Reference Only)

These systems already exist and should be called, not rebuilt:

- **Inventory movements**: `packages/modules/inventory/src/commands/` — use existing `adjustInventory` pattern for modifier depletion
- **86 board**: `packages/modules/fnb/src/commands/eighty-six-item.ts` — already supports `entityType='modifier'`
- **Customer preferences**: `packages/modules/customers/src/commands/` — use existing preference commands with `category: 'modifier'`
- **Loyalty tiers**: `packages/modules/customers/src/` — membership/loyalty tier resolution
- **Reporting read models**: `rm_modifier_item_sales`, `rm_modifier_daypart`, `rm_modifier_group_attach` — extend, don't recreate
- **POS catalog loader**: `getCatalogForPOS` — extend the single-query pattern, don't add new API calls
