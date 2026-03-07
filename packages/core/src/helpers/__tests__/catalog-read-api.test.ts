import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const withTenantCalls: string[] = [];
  return {
    withTenantCalls,
    withTenant: vi.fn(),
  };
});

vi.mock('@oppsera/db', () => ({
  withTenant: (...args: unknown[]) => {
    mocks.withTenantCalls.push('withTenant');
    return mocks.withTenant(...args);
  },
  catalogItems: {
    id: 'id', tenantId: 'tenant_id', archivedAt: 'archived_at',
    sku: 'sku', barcode: 'barcode', name: 'name', itemType: 'item_type',
    isTrackable: 'is_trackable', defaultPrice: 'default_price',
    priceIncludesTax: 'price_includes_tax', metadata: 'metadata',
    categoryId: 'category_id',
  },
  catalogLocationPrices: {
    catalogItemId: 'catalog_item_id', locationId: 'location_id',
    tenantId: 'tenant_id', price: 'price',
  },
  catalogItemModifierGroups: { catalogItemId: 'catalog_item_id', modifierGroupId: 'modifier_group_id' },
  catalogModifierGroups: { id: 'id' },
  catalogModifiers: { modifierGroupId: 'modifier_group_id', isActive: 'is_active' },
  taxRates: { id: 'id', tenantId: 'tenant_id', isActive: 'is_active', name: 'name', rateDecimal: 'rate_decimal' },
  taxGroups: { id: 'id', tenantId: 'tenant_id', isActive: 'is_active', name: 'name' },
  taxGroupRates: { taxGroupId: 'tax_group_id', taxRateId: 'tax_rate_id', sortOrder: 'sort_order' },
  catalogItemLocationTaxGroups: {
    tenantId: 'tenant_id', locationId: 'location_id',
    catalogItemId: 'catalog_item_id', taxGroupId: 'tax_group_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray: vi.fn((a, b) => ({ type: 'inArray', a, b })),
  asc: vi.fn((col) => ({ type: 'asc', col })),
  isNull: vi.fn((col) => ({ type: 'isNull', col })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values }),
    { raw: (s: string) => ({ type: 'sql_raw', value: s }) },
  ),
}));

// ── Test helpers ──────────────────────────────────────────────
// Build a mock query chain that resolves to `results` regardless of which
// terminal method is called (.limit(), .orderBy(), or direct await on .where()).
function makeSelectChain(results: unknown[] = []) {
  // Make the terminal object both a thenable and support .limit()/.orderBy()
  const terminal: Record<string, unknown> = {
    limit: vi.fn().mockResolvedValue(results),
    orderBy: vi.fn().mockResolvedValue(results),
    then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(results).then(onFulfilled, onRejected),
  };
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
      orderBy: vi.fn().mockReturnValue(terminal),
    }),
  };
}

function makeTx() {
  return {
    select: vi.fn().mockReturnValue(makeSelectChain()),
    execute: vi.fn().mockResolvedValue([]),
  };
}

// ── Import under test ──────────────────────────────────────────
import { getCatalogReadApi, setCatalogReadApi } from '../catalog-read-api';

describe('CatalogReadApi.getItemForPOS — pool guard consolidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantCalls.length = 0;
    // Reset singleton to get a fresh instance
    setCatalogReadApi(null as never);
  });

  it('uses exactly ONE withTenant call (not four separate ones)', async () => {
    const tx = makeTx();
    // Mock: item found
    tx.select.mockReturnValueOnce(makeSelectChain([{
      id: 'item-1', sku: 'SKU1', barcode: null, name: 'Burger',
      itemType: 'food', isTrackable: false, defaultPrice: '9.99',
      priceIncludesTax: false, metadata: null, categoryId: 'cat-1',
    }]));
    // Mock: location price override (not found → falls back to default)
    tx.select.mockReturnValueOnce(makeSelectChain([]));
    // Mock: tax assignments (empty → no tax)
    tx.select.mockReturnValueOnce(makeSelectChain([]));
    // Mock: sub-department (raw SQL)
    tx.execute.mockResolvedValueOnce([{ sub_department_id: 'subdept-1' }]);

    mocks.withTenant.mockImplementation(async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
      return cb(tx);
    });

    const api = getCatalogReadApi();
    const result = await api.getItemForPOS('tenant-1', 'loc-1', 'item-1');

    // The critical assertion: only ONE withTenant call
    expect(mocks.withTenantCalls).toHaveLength(1);

    // Verify result shape
    expect(result).not.toBeNull();
    expect(result!.id).toBe('item-1');
    expect(result!.unitPriceCents).toBe(999);
    expect(result!.subDepartmentId).toBe('subdept-1');
    expect(result!.taxInfo.taxRates).toEqual([]);
  });

  it('returns null for non-existent item without leaking semaphore slots', async () => {
    const tx = makeTx();
    // Mock: item not found
    tx.select.mockReturnValueOnce(makeSelectChain([]));

    mocks.withTenant.mockImplementation(async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
      return cb(tx);
    });

    const api = getCatalogReadApi();
    const result = await api.getItemForPOS('tenant-1', 'loc-1', 'item-missing');

    expect(result).toBeNull();
    // Still only ONE withTenant call
    expect(mocks.withTenantCalls).toHaveLength(1);
    // No extra queries should have been made (tax, price, subdept)
    expect(tx.select).toHaveBeenCalledTimes(1); // only the item lookup
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('uses location price override when available', async () => {
    const tx = makeTx();
    // Mock: item found
    tx.select.mockReturnValueOnce(makeSelectChain([{
      id: 'item-1', sku: null, barcode: null, name: 'Premium Burger',
      itemType: 'food', isTrackable: false, defaultPrice: '9.99',
      priceIncludesTax: false, metadata: null, categoryId: null,
    }]));
    // Mock: location price override found ($12.50)
    tx.select.mockReturnValueOnce(makeSelectChain([{ price: '12.50' }]));
    // Mock: tax assignments (empty)
    tx.select.mockReturnValueOnce(makeSelectChain([]));
    // Mock: sub-department
    tx.execute.mockResolvedValueOnce([]);

    mocks.withTenant.mockImplementation(async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
      return cb(tx);
    });

    const api = getCatalogReadApi();
    const result = await api.getItemForPOS('tenant-1', 'loc-1', 'item-1');

    expect(result!.unitPriceCents).toBe(1250); // $12.50 override, not $9.99 default
    expect(mocks.withTenantCalls).toHaveLength(1);
  });

  it('resolves tax info within the same transaction', async () => {
    const tx = makeTx();
    // Mock: item found
    tx.select.mockReturnValueOnce(makeSelectChain([{
      id: 'item-1', sku: null, barcode: null, name: 'Taxable Item',
      itemType: 'food', isTrackable: false, defaultPrice: '10.00',
      priceIncludesTax: false, metadata: null, categoryId: null,
    }]));
    // Mock: location price (no override)
    tx.select.mockReturnValueOnce(makeSelectChain([]));
    // Mock: tax assignments
    tx.select.mockReturnValueOnce(makeSelectChain([{ taxGroupId: 'tg-1' }]));
    // Mock: tax groups
    tx.select.mockReturnValueOnce(makeSelectChain([{ id: 'tg-1', name: 'Sales Tax' }]));
    // Mock: group rates
    tx.select.mockReturnValueOnce(makeSelectChain([{ taxRateId: 'tr-1', sortOrder: 0 }]));
    // Mock: tax rates
    tx.select.mockReturnValueOnce(makeSelectChain([{
      id: 'tr-1', name: 'State Tax', rateDecimal: '0.0825',
    }]));
    // Mock: sub-department
    tx.execute.mockResolvedValueOnce([]);

    mocks.withTenant.mockImplementation(async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
      return cb(tx);
    });

    const api = getCatalogReadApi();
    const result = await api.getItemForPOS('tenant-1', 'loc-1', 'item-1');

    // All within ONE withTenant call
    expect(mocks.withTenantCalls).toHaveLength(1);
    expect(result!.taxInfo.taxRates).toHaveLength(1);
    expect(result!.taxInfo.taxRates[0]!.rateDecimal).toBe(0.0825);
    expect(result!.taxInfo.totalRate).toBe(0.0825);
  });

  it('concurrent batch calls each use only 1 withTenant (not 4N)', async () => {
    const txFactory = () => {
      const tx = makeTx();
      tx.select.mockReturnValueOnce(makeSelectChain([{
        id: 'item-1', sku: null, barcode: null, name: 'Burger',
        itemType: 'food', isTrackable: false, defaultPrice: '5.00',
        priceIncludesTax: false, metadata: null, categoryId: null,
      }]));
      tx.select.mockReturnValueOnce(makeSelectChain([])); // price override
      tx.select.mockReturnValueOnce(makeSelectChain([])); // tax
      tx.execute.mockResolvedValueOnce([]); // subdept
      return tx;
    };

    mocks.withTenant.mockImplementation(async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
      return cb(txFactory());
    });

    const api = getCatalogReadApi();
    // Simulate a POS batch of 5 items (all in parallel)
    const results = await Promise.all([
      api.getItemForPOS('tenant-1', 'loc-1', 'item-1'),
      api.getItemForPOS('tenant-1', 'loc-1', 'item-2'),
      api.getItemForPOS('tenant-1', 'loc-1', 'item-3'),
      api.getItemForPOS('tenant-1', 'loc-1', 'item-4'),
      api.getItemForPOS('tenant-1', 'loc-1', 'item-5'),
    ]);

    // 5 items → 5 withTenant calls (not 20 = 5 × 4)
    expect(mocks.withTenantCalls).toHaveLength(5);
    // All items resolved
    expect(results.filter((r) => r !== null)).toHaveLength(5);
  });
});
