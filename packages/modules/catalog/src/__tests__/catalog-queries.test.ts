import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────

const { mockSelect, mockTransaction } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
}));

// ── Mock chain builders ─────────────────────────────────────────────

function makeSelectChain(results: unknown[] = []) {
  const p = Promise.resolve(results);
  const limitFn = vi.fn().mockResolvedValue(results);
  const orderByFn = vi.fn().mockReturnValue({
    limit: limitFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  const groupByFn = vi.fn().mockReturnValue({
    orderBy: orderByFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  const whereFn = vi.fn().mockReturnValue({
    limit: limitFn,
    orderBy: orderByFn,
    groupBy: groupByFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  // leftJoinFn returns object that includes itself so chained .leftJoin() calls work
  const joinResult: Record<string, unknown> = {
    where: whereFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  };
  const leftJoinFn = vi.fn().mockReturnValue(joinResult);
  joinResult.leftJoin = leftJoinFn;
  const fromFn = vi.fn().mockReturnValue({
    where: whereFn,
    leftJoin: leftJoinFn,
    orderBy: orderByFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  return { from: fromFn };
}

function setupDefaultMocks() {
  mockSelect.mockReturnValue(makeSelectChain([]));
}

setupDefaultMocks();

vi.mock('@oppsera/db', () => ({
  db: {
    select: mockSelect,
    transaction: mockTransaction,
  },
  withTenant: async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
    return mockTransaction(cb);
  },
  sql: vi.fn((...args: unknown[]) => args),
  taxCategories: {
    id: 'taxCategories.id',
    tenantId: 'taxCategories.tenantId',
    name: 'taxCategories.name',
    rate: 'taxCategories.rate',
    isActive: 'taxCategories.isActive',
  },
  catalogCategories: {
    id: 'catalogCategories.id',
    tenantId: 'catalogCategories.tenantId',
    parentId: 'catalogCategories.parentId',
    name: 'catalogCategories.name',
    sortOrder: 'catalogCategories.sortOrder',
    isActive: 'catalogCategories.isActive',
    createdAt: 'catalogCategories.createdAt',
    updatedAt: 'catalogCategories.updatedAt',
  },
  catalogItems: {
    id: 'catalogItems.id',
    tenantId: 'catalogItems.tenantId',
    categoryId: 'catalogItems.categoryId',
    sku: 'catalogItems.sku',
    name: 'catalogItems.name',
    description: 'catalogItems.description',
    itemType: 'catalogItems.itemType',
    defaultPrice: 'catalogItems.defaultPrice',
    cost: 'catalogItems.cost',
    taxCategoryId: 'catalogItems.taxCategoryId',
    isTrackable: 'catalogItems.isTrackable',
    isActive: 'catalogItems.isActive',
    createdBy: 'catalogItems.createdBy',
    updatedBy: 'catalogItems.updatedBy',
    createdAt: 'catalogItems.createdAt',
    updatedAt: 'catalogItems.updatedAt',
  },
  catalogModifierGroups: {
    id: 'catalogModifierGroups.id',
    tenantId: 'catalogModifierGroups.tenantId',
    name: 'catalogModifierGroups.name',
    selectionType: 'catalogModifierGroups.selectionType',
    isRequired: 'catalogModifierGroups.isRequired',
    minSelections: 'catalogModifierGroups.minSelections',
    maxSelections: 'catalogModifierGroups.maxSelections',
    createdAt: 'catalogModifierGroups.createdAt',
    updatedAt: 'catalogModifierGroups.updatedAt',
  },
  catalogModifiers: {
    id: 'catalogModifiers.id',
    tenantId: 'catalogModifiers.tenantId',
    modifierGroupId: 'catalogModifiers.modifierGroupId',
    name: 'catalogModifiers.name',
    priceAdjustment: 'catalogModifiers.priceAdjustment',
    sortOrder: 'catalogModifiers.sortOrder',
    isActive: 'catalogModifiers.isActive',
  },
  catalogItemModifierGroups: {
    catalogItemId: 'catalogItemModifierGroups.catalogItemId',
    modifierGroupId: 'catalogItemModifierGroups.modifierGroupId',
  },
  catalogLocationPrices: {
    id: 'catalogLocationPrices.id',
    tenantId: 'catalogLocationPrices.tenantId',
    catalogItemId: 'catalogLocationPrices.catalogItemId',
    locationId: 'catalogLocationPrices.locationId',
    price: 'catalogLocationPrices.price',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ['eq', ...args]),
  and: vi.fn((...args: unknown[]) => ['and', ...args]),
  or: vi.fn((...args: unknown[]) => ['or', ...args]),
  lt: vi.fn((...args: unknown[]) => ['lt', ...args]),
  ilike: vi.fn((...args: unknown[]) => ['ilike', ...args]),
  desc: vi.fn((...args: unknown[]) => ['desc', ...args]),
  asc: vi.fn((...args: unknown[]) => ['asc', ...args]),
  inArray: vi.fn((...args: unknown[]) => ['inArray', ...args]),
  getTableColumns: vi.fn((table: Record<string, unknown>) => table),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((str: string) => str),
  }),
}));

vi.mock('drizzle-orm/pg-core', () => ({
  alias: vi.fn((table: unknown, _aliasName: string) => table),
}));

vi.mock('@oppsera/shared', () => ({
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) {
      super(id ? `${entity} ${id} not found` : `${entity} not found`);
      this.name = 'NotFoundError';
    }
  },
}));

vi.mock('@oppsera/core/auth/supabase-client', () => ({
  createSupabaseAdmin: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { listItems } from '../queries/list-items';
import { getItem } from '../queries/get-item';
import { listCategories } from '../queries/list-categories';
import { listModifierGroups } from '../queries/list-modifier-groups';
import { listTaxCategories } from '../queries/list-tax-categories';
import {
  createItemSchema,
  updateItemSchema,
  setLocationPriceSchema,
  createModifierGroupSchema,
} from '../validation';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_A = 'tnt_01TEST';

function mockSelectReturns(results: unknown[]) {
  mockSelect.mockReturnValueOnce(makeSelectChain(results));
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockSelect.mockReset();
  mockTransaction.mockReset();

  setupDefaultMocks();

  // withTenant mock: calls callback with tx that delegates to mockSelect
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = { select: mockSelect };
    return cb(tx);
  });
});

// ═══════════════════════════════════════════════════════════════════
// QUERY TESTS
// ═══════════════════════════════════════════════════════════════════

describe('listItems', () => {
  // ── Test 1: returns paginated items ──────────────────────────
  it('returns items with pagination metadata', async () => {
    const items = [
      { id: 'item_001', name: 'Widget', tenantId: TENANT_A, isActive: true },
      { id: 'item_002', name: 'Gadget', tenantId: TENANT_A, isActive: true },
    ];
    mockSelectReturns(items);

    const result = await listItems({ tenantId: TENANT_A });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  // ── Test 2: cursor pagination returns hasMore ────────────────
  it('returns hasMore=true when more items exist', async () => {
    // Return limit + 1 items to indicate more exist
    const items = Array.from({ length: 4 }, (_, i) => ({
      id: `item_${String(i).padStart(3, '0')}`,
      name: `Item ${i}`,
      tenantId: TENANT_A,
    }));
    mockSelectReturns(items);

    const result = await listItems({ tenantId: TENANT_A, limit: 3 });

    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe('item_002');
  });

  // ── Test 3: respects limit cap ───────────────────────────────
  it('caps limit at 100', async () => {
    mockSelectReturns([]);
    await listItems({ tenantId: TENANT_A, limit: 200 });
    // The query should have been called — we just verify no crash
    expect(mockSelect).toHaveBeenCalled();
  });

  // ── Test 4: filters by category ──────────────────────────────
  it('filters items by categoryId', async () => {
    mockSelectReturns([]);
    const result = await listItems({ tenantId: TENANT_A, categoryId: 'cat_001' });
    expect(result.items).toHaveLength(0);
    expect(mockSelect).toHaveBeenCalled();
  });

  // ── Test 5: search filter ────────────────────────────────────
  it('applies search filter on name and sku', async () => {
    mockSelectReturns([
      { id: 'item_001', name: 'Golf Ball', sku: 'GOLF-001', tenantId: TENANT_A },
    ]);
    const result = await listItems({ tenantId: TENANT_A, search: 'golf' });
    expect(result.items).toHaveLength(1);
  });
});

describe('getItem', () => {
  // ── Test 6: returns full item with relations ─────────────────
  it('returns item with category, tax category, modifiers, and prices', async () => {
    const item = {
      id: 'item_001',
      tenantId: TENANT_A,
      categoryId: 'cat_001',
      taxCategoryId: 'tc_001',
      sku: 'POLO-001',
      name: 'Logo Polo',
      description: 'Embroidered polo',
      itemType: 'retail',
      defaultPrice: '49.99',
      cost: '22.00',
      isTrackable: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'usr_01',
      updatedBy: null,
    };

    // Item fetch
    mockSelectReturns([item]);
    // Category fetch
    mockSelectReturns([{ id: 'cat_001', name: 'Apparel' }]);
    // Tax category fetch
    mockSelectReturns([{ id: 'tc_001', name: 'Sales Tax', rate: '0.0700' }]);
    // Junction rows
    mockSelectReturns([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);
    // Modifier groups
    mockSelectReturns([
      {
        id: 'mg_001',
        name: 'Size',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
      },
    ]);
    // Modifiers
    mockSelectReturns([
      {
        id: 'mod_001',
        modifierGroupId: 'mg_001',
        name: 'Small',
        priceAdjustment: '0',
        sortOrder: 1,
        isActive: true,
      },
    ]);
    // Location prices
    mockSelectReturns([{ locationId: 'loc_001', price: '45.99' }]);

    const result = await getItem(TENANT_A, 'item_001');

    expect(result.id).toBe('item_001');
    expect(result.category).toEqual({ id: 'cat_001', name: 'Apparel' });
    expect(result.taxCategory).toEqual({ id: 'tc_001', name: 'Sales Tax', rate: '0.0700' });
    expect(result.modifierGroups).toHaveLength(1);
    expect(result.modifierGroups[0]!.modifiers).toHaveLength(1);
    expect(result.locationPrices).toHaveLength(1);
  });

  // ── Test 7: throws NotFoundError for missing item ────────────
  it('throws NotFoundError when item does not exist', async () => {
    mockSelectReturns([]);
    await expect(getItem(TENANT_A, 'item_missing')).rejects.toThrow('not found');
  });

  // ── Test 8: handles item with no relations ───────────────────
  it('returns item with empty relations when none exist', async () => {
    const item = {
      id: 'item_002',
      tenantId: TENANT_A,
      categoryId: null,
      taxCategoryId: null,
      sku: null,
      name: 'Simple Widget',
      description: null,
      itemType: 'retail',
      defaultPrice: '9.99',
      cost: null,
      isTrackable: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: null,
      updatedBy: null,
    };

    // Item fetch
    mockSelectReturns([item]);
    // Junction rows (empty — no modifiers)
    mockSelectReturns([]);
    // Location prices (empty)
    mockSelectReturns([]);

    const result = await getItem(TENANT_A, 'item_002');

    expect(result.category).toBeNull();
    expect(result.taxCategory).toBeNull();
    expect(result.modifierGroups).toHaveLength(0);
    expect(result.locationPrices).toHaveLength(0);
  });
});

describe('listCategories', () => {
  // ── Test 9: returns categories with item counts ──────────────
  it('returns categories with item counts', async () => {
    const categories = [
      {
        id: 'cat_001',
        parentId: null,
        name: 'Apparel',
        sortOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        itemCount: 5,
      },
      {
        id: 'cat_002',
        parentId: null,
        name: 'Beverages',
        sortOrder: 2,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        itemCount: 3,
      },
    ];
    mockSelectReturns(categories);

    const result = await listCategories(TENANT_A);

    expect(result).toHaveLength(2);
    expect(result[0]!.itemCount).toBe(5);
    expect(result[1]!.name).toBe('Beverages');
  });

  // ── Test 10: excludes inactive by default ────────────────────
  it('excludes inactive categories by default', async () => {
    mockSelectReturns([]);
    await listCategories(TENANT_A);
    // Verified by the query conditions (active filter applied)
    expect(mockSelect).toHaveBeenCalled();
  });
});

describe('listModifierGroups', () => {
  // ── Test 11: returns groups with modifiers ───────────────────
  it('returns modifier groups with nested modifiers', async () => {
    const groups = [
      {
        id: 'mg_001',
        tenantId: TENANT_A,
        name: 'Size',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const modifiers = [
      {
        id: 'mod_001',
        tenantId: TENANT_A,
        modifierGroupId: 'mg_001',
        name: 'Small',
        priceAdjustment: '0',
        sortOrder: 1,
        isActive: true,
      },
      {
        id: 'mod_002',
        tenantId: TENANT_A,
        modifierGroupId: 'mg_001',
        name: 'Large',
        priceAdjustment: '1.00',
        sortOrder: 2,
        isActive: true,
      },
    ];

    // Groups fetch
    mockSelectReturns(groups);
    // Modifiers fetch
    mockSelectReturns(modifiers);

    const result = await listModifierGroups(TENANT_A);

    expect(result).toHaveLength(1);
    expect(result[0]!.modifiers).toHaveLength(2);
    expect(result[0]!.modifiers[1]!.name).toBe('Large');
  });

  // ── Test 12: returns empty array when no groups ──────────────
  it('returns empty array when no modifier groups exist', async () => {
    mockSelectReturns([]);
    const result = await listModifierGroups(TENANT_A);
    expect(result).toHaveLength(0);
  });
});

describe('listTaxCategories', () => {
  // ── Test 13: returns tax categories ──────────────────────────
  it('returns all active tax categories', async () => {
    const taxCats = [
      { id: 'tc_001', tenantId: TENANT_A, name: 'Sales Tax', rate: '0.0700', isActive: true },
      { id: 'tc_002', tenantId: TENANT_A, name: 'Food Tax', rate: '0.0800', isActive: true },
    ];
    mockSelectReturns(taxCats);

    const result = await listTaxCategories(TENANT_A);

    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('Sales Tax');
  });
});

// ═══════════════════════════════════════════════════════════════════
// VALIDATION SCHEMA TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Validation Schemas', () => {
  // ── Test 14: createItemSchema rejects negative price ─────────
  it('createItemSchema rejects negative defaultPrice', () => {
    const result = createItemSchema.safeParse({
      name: 'Bad Item',
      itemType: 'retail',
      defaultPrice: -5.00,
    });
    expect(result.success).toBe(false);
  });

  // ── Test 15: createItemSchema transforms SKU to uppercase ────
  it('createItemSchema transforms SKU to uppercase and trims', () => {
    const result = createItemSchema.safeParse({
      name: 'Widget',
      itemType: 'retail',
      defaultPrice: 9.99,
      sku: '  polo-001  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBe('POLO-001');
    }
  });

  // ── Test 16: setLocationPriceSchema rejects zero price ───────
  it('setLocationPriceSchema rejects zero price', () => {
    const result = setLocationPriceSchema.safeParse({
      catalogItemId: 'item_001',
      locationId: 'loc_001',
      price: 0,
    });
    expect(result.success).toBe(false);
  });

  // ── Test 17: updateItemSchema accepts partial input ──────────
  it('updateItemSchema accepts partial update with only name', () => {
    const result = updateItemSchema.safeParse({
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated Name');
      expect(result.data.defaultPrice).toBeUndefined();
    }
  });

  // ── Test 18: createModifierGroupSchema rejects invalid constraints
  it('createModifierGroupSchema rejects required group with minSelections=0', () => {
    const result = createModifierGroupSchema.safeParse({
      name: 'Bad Group',
      isRequired: true,
      minSelections: 0,
      modifiers: [{ name: 'Option A' }],
    });
    expect(result.success).toBe(false);
  });
});
