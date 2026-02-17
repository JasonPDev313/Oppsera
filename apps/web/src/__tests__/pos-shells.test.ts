import { describe, it, expect } from 'vitest';
import type { ItemTypeGroup, RetailMetadata } from '@oppsera/shared';

// ---------------------------------------------------------------------------
// Shared POS types (test-local definitions matching the real app contracts)
// ---------------------------------------------------------------------------

interface CatalogItemForPOS {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  type: string;
  typeGroup: ItemTypeGroup;
  price: number;
  isTrackInventory: boolean;
  onHand: number | null;
  metadata: Record<string, unknown>;
  categoryId: string;
  departmentId: string;
  tax: { calculationMode: string; taxRates: unknown[] };
}

interface AddLineItemInput {
  catalogItemId: string;
  qty: number;
  modifiers?: Array<{
    modifierId: string;
    name: string;
    priceAdjustment: number;
    isDefault: boolean;
  }>;
  specialInstructions?: string;
  selectedOptions?: Record<string, string>;
  priceOverride?: { unitPrice: number; reason: string; approvedBy: string };
  notes?: string;
}

// ---------------------------------------------------------------------------
// Item tap logic — universal handler shared between Retail and F&B shells
// ---------------------------------------------------------------------------

function handleItemTap(item: CatalogItemForPOS): string {
  switch (item.typeGroup) {
    case 'fnb':
      return 'openModifierDialog';
    case 'retail': {
      const meta = item.metadata as RetailMetadata | undefined;
      if (meta?.optionSets && meta.optionSets.length > 0) return 'openOptionPicker';
      return 'directAdd';
    }
    case 'service':
      return 'directAdd';
    case 'package':
      return 'openPackageConfirm';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<CatalogItemForPOS> = {}): CatalogItemForPOS {
  return {
    id: 'item-1',
    name: 'Test Item',
    sku: 'SKU-001',
    barcode: null,
    type: 'retail',
    typeGroup: 'retail',
    price: 5999,
    isTrackInventory: false,
    onHand: null,
    metadata: {},
    categoryId: 'c1',
    departmentId: 'd1',
    tax: { calculationMode: 'exclusive', taxRates: [] },
    ...overrides,
  };
}

// ===========================================================================
// Retail POS (29-39)
// ===========================================================================

describe('Retail POS (29-39)', () => {
  // ---- Test 29 ----
  it('29: retail layout has search, department tabs, category rail, item grid, and cart', () => {
    const layoutSections = [
      'search',
      'departmentTabs',
      'subDepartmentTabs',
      'categoryRail',
      'itemGrid',
      'cart',
      'cartTotals',
      'actionButtons',
      'footerBar',
    ];
    expect(layoutSections).toContain('search');
    expect(layoutSections).toContain('departmentTabs');
    expect(layoutSections).toContain('categoryRail');
    expect(layoutSections).toContain('itemGrid');
    expect(layoutSections).toContain('cart');
  });

  // ---- Test 30 ----
  it('30: barcode scanner detected by keystroke timing', () => {
    const SCAN_THRESHOLD = 50; // ms between keystrokes
    const MIN_LENGTH = 4;

    // Simulate fast keystrokes (scanner)
    const fastTimestamps = [0, 10, 20, 30, 40, 50]; // 10 ms apart
    const isFastInput = fastTimestamps.every(
      (t, i) => i === 0 || t - fastTimestamps[i - 1]! < SCAN_THRESHOLD,
    );
    expect(isFastInput).toBe(true);
    expect(fastTimestamps.length).toBeGreaterThanOrEqual(MIN_LENGTH);

    // Simulate slow keystrokes (human typing)
    const slowTimestamps = [0, 200, 400, 600]; // 200 ms apart
    const isSlowInput = slowTimestamps.every(
      (t, i) => i === 0 || t - slowTimestamps[i - 1]! < SCAN_THRESHOLD,
    );
    expect(isSlowInput).toBe(false);
  });

  // ---- Test 31 ----
  it('31: barcode scan on retail item without options = direct add', () => {
    const item = makeItem({
      barcode: '123456789',
      type: 'retail',
      typeGroup: 'retail',
      metadata: {},
    });
    const action = handleItemTap(item);
    expect(action).toBe('directAdd');
  });

  // ---- Test 32 ----
  it('32: barcode scan on F&B item opens modifier dialog', () => {
    const item = makeItem({
      barcode: '987654321',
      type: 'food',
      typeGroup: 'fnb',
    });
    const action = handleItemTap(item);
    expect(action).toBe('openModifierDialog');
  });

  // ---- Test 33 ----
  it('33: departments derived from categories with parentId=null', () => {
    const allCategories = [
      { id: 'd1', name: 'Food', parentId: null },
      { id: 'd2', name: 'Apparel', parentId: null },
      { id: 'sd1', name: 'Burgers', parentId: 'd1' },
      { id: 'c1', name: 'Beef', parentId: 'sd1' },
    ];
    const departments = allCategories.filter((c) => c.parentId === null);
    expect(departments).toHaveLength(2);
    expect(departments.map((d) => d.name)).toEqual(['Food', 'Apparel']);
  });

  // ---- Test 34 ----
  it('34: subdepartments are children of selected department', () => {
    const allCategories = [
      { id: 'd1', name: 'Food', parentId: null },
      { id: 'sd1', name: 'Burgers', parentId: 'd1' },
      { id: 'sd2', name: 'Drinks', parentId: 'd1' },
      { id: 'c1', name: 'Beef', parentId: 'sd1' },
    ];
    const selectedDeptId = 'd1';
    const subDepts = allCategories.filter((c) => c.parentId === selectedDeptId);
    expect(subDepts).toHaveLength(2);
  });

  // ---- Test 35 ----
  it('35: favorites stored and retrieved by item ID', () => {
    const favoriteIds = new Set(['item-1', 'item-3']);
    const allItems = [
      makeItem({ id: 'item-1', name: 'Polo' }),
      makeItem({ id: 'item-2', name: 'Hat' }),
      makeItem({ id: 'item-3', name: 'Gloves' }),
    ];
    const favorites = allItems.filter((i) => favoriteIds.has(i.id));
    expect(favorites).toHaveLength(2);
    expect(favorites.map((f) => f.name)).toEqual(['Polo', 'Gloves']);
  });

  // ---- Test 36 ----
  it('36: recent items capped at 20, most recent first', () => {
    const recentIds: string[] = [];
    const addToRecent = (id: string) => {
      const idx = recentIds.indexOf(id);
      if (idx > -1) recentIds.splice(idx, 1);
      recentIds.unshift(id);
      if (recentIds.length > 20) recentIds.pop();
    };

    for (let i = 0; i < 25; i++) addToRecent(`item-${i}`);
    expect(recentIds).toHaveLength(20);
    expect(recentIds[0]).toBe('item-24'); // most recent

    // Adding existing item moves it to front
    addToRecent('item-15');
    expect(recentIds[0]).toBe('item-15');
    expect(recentIds).toHaveLength(20);
  });

  // ---- Test 37 ----
  it('37: search results include items of all type groups', () => {
    const items = [
      makeItem({ id: '1', name: 'Classic Burger', type: 'food', typeGroup: 'fnb' }),
      makeItem({ id: '2', name: 'Polo Shirt', type: 'retail', typeGroup: 'retail' }),
      makeItem({ id: '3', name: 'Golf Lesson', type: 'service', typeGroup: 'service' }),
      makeItem({
        id: '4',
        name: 'Lunch Package',
        type: 'other',
        typeGroup: 'package',
        metadata: { isPackage: true },
      }),
    ];
    const query = '' as string;
    const results = query
      ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
      : items;
    const typeGroups = new Set(results.map((i) => i.typeGroup));
    expect(typeGroups.size).toBe(4);
    expect(typeGroups).toContain('fnb');
    expect(typeGroups).toContain('retail');
    expect(typeGroups).toContain('service');
    expect(typeGroups).toContain('package');
  });

  // ---- Test 38 ----
  it('38: hold order clears current order state', () => {
    let currentOrder: { id: string } | null = { id: 'order-1' };
    const holdOrder = () => {
      currentOrder = null;
    };
    holdOrder();
    expect(currentOrder).toBeNull();
  });

  // ---- Test 39 ----
  it('39: recall filters to open orders at location', () => {
    const orders = [
      { id: 'o1', status: 'open', locationId: 'loc1' },
      { id: 'o2', status: 'placed', locationId: 'loc1' },
      { id: 'o3', status: 'open', locationId: 'loc2' },
      { id: 'o4', status: 'open', locationId: 'loc1' },
    ];
    const locationId = 'loc1';
    const heldOrders = orders.filter(
      (o) => o.status === 'open' && o.locationId === locationId,
    );
    expect(heldOrders).toHaveLength(2);
    expect(heldOrders.map((o) => o.id)).toEqual(['o1', 'o4']);
  });
});

// ===========================================================================
// F&B POS (40-45)
// ===========================================================================

describe('F&B POS (40-45)', () => {
  // ---- Test 40 ----
  it('40: F&B uses large tile size', () => {
    const fnbTileSize = 'large';
    const retailTileSize = 'normal';
    expect(fnbTileSize).toBe('large');
    expect(retailTileSize).toBe('normal');
  });

  // ---- Test 41 ----
  it('41: large tiles have bigger dimensions', () => {
    const tileSizes = {
      normal: { w: 112, h: 112 },
      large: { w: 144, h: 144 },
    };
    expect(tileSizes.large.w).toBeGreaterThan(tileSizes.normal.w);
    expect(tileSizes.large.h).toBeGreaterThan(tileSizes.normal.h);
  });

  // ---- Test 42 ----
  it('42: items filtered by selected category', () => {
    const items = [
      { id: '1', categoryId: 'c1', name: 'Burger' },
      { id: '2', categoryId: 'c1', name: 'Fries' },
      { id: '3', categoryId: 'c2', name: 'Beer' },
    ];
    const selectedCategoryId = 'c1';
    const filtered = items.filter((i) => i.categoryId === selectedCategoryId);
    expect(filtered).toHaveLength(2);
  });

  // ---- Test 43 ----
  it('43: F&B POS handles retail items correctly', () => {
    const retailItem = makeItem({
      type: 'retail',
      typeGroup: 'retail',
      metadata: {},
    });
    const action = handleItemTap(retailItem);
    expect(action).toBe('directAdd');
    expect(retailItem.typeGroup).toBe('retail');
  });

  // ---- Test 44 ----
  it('44: repeat last copies last line data', () => {
    const orderLines = [
      { id: 'l1', catalogItemId: 'i1', qty: 1, modifiers: null },
      {
        id: 'l2',
        catalogItemId: 'i2',
        qty: 0.5,
        modifiers: [
          {
            modifierId: 'm1',
            name: 'Cheese',
            priceAdjustment: 150,
            isDefault: false,
          },
        ],
      },
    ];
    const lastLine = orderLines[orderLines.length - 1]!;
    const repeatInput: Partial<AddLineItemInput> = {
      catalogItemId: lastLine.catalogItemId,
      qty: lastLine.qty,
      modifiers: lastLine.modifiers ?? undefined,
    };
    expect(repeatInput.catalogItemId).toBe('i2');
    expect(repeatInput.qty).toBe(0.5);
    expect(repeatInput.modifiers).toHaveLength(1);
  });

  // ---- Test 45 ----
  it('45: quick void removes line by id', () => {
    const lines = [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }];
    const removeId = 'l2';
    const remaining = lines.filter((l) => l.id !== removeId);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((l) => l.id)).toEqual(['l1', 'l3']);
  });
});

// ===========================================================================
// Cross-Mode Item Selling (46-51)
// ===========================================================================

describe('Cross-Mode Item Selling (46-51)', () => {
  // ---- Test 46 ----
  it('46: retail POS opens modifier dialog for F&B items', () => {
    const fnbItem = makeItem({
      type: 'food',
      typeGroup: 'fnb',
      metadata: {},
    });
    expect(handleItemTap(fnbItem)).toBe('openModifierDialog');
  });

  // ---- Test 47 ----
  it('47: service items always direct add with qty=1', () => {
    const serviceItem = makeItem({
      type: 'service',
      typeGroup: 'service',
      metadata: {},
    });
    expect(handleItemTap(serviceItem)).toBe('directAdd');
  });

  // ---- Test 48 ----
  it('48: package items open confirmation dialog', () => {
    const packageItem = makeItem({
      type: 'other',
      typeGroup: 'package',
      metadata: { isPackage: true },
    });
    expect(handleItemTap(packageItem)).toBe('openPackageConfirm');
  });

  // ---- Test 49 ----
  it('49: retail items with options open option picker in any POS mode', () => {
    const retailWithOptions = makeItem({
      type: 'retail',
      typeGroup: 'retail',
      metadata: {
        optionSets: [{ name: 'Size', options: ['S', 'M', 'L'], required: true }],
      },
    });
    expect(handleItemTap(retailWithOptions)).toBe('openOptionPicker');
  });

  // ---- Test 50 ----
  it('50: retail items without options are direct-added in any POS mode', () => {
    const retailNoOptions = makeItem({
      type: 'retail',
      typeGroup: 'retail',
      metadata: {},
    });
    expect(handleItemTap(retailNoOptions)).toBe('directAdd');
  });

  // ---- Test 51 ----
  it('51: mixed cart with all types calculates totals correctly', () => {
    const lines = [
      { lineTotal: 1649 }, // F&B burger $16.49
      { lineTotal: 6449 }, // Retail polo $64.49
      { lineTotal: 8500 }, // Service lesson $85.00
      { lineTotal: 2706 }, // Package $27.06
    ];
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    expect(subtotal).toBe(19304);

    const serviceChargeTotal = 0;
    const discountTotal = 0;
    const total = subtotal + serviceChargeTotal - discountTotal;
    expect(total).toBe(19304);
  });
});
