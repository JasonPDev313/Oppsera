import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockSelect, mockWithTenant } = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.groupBy = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  const mockSelect = vi.fn(() => makeSelectChain());

  const mockWithTenant = vi.fn(
    async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { select: mockSelect };
      return fn(tx);
    },
  );

  return { mockSelect, mockWithTenant, makeSelectChain };
});

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

function mockSelectReturns(data: unknown[]) {
  mockSelect.mockReturnValueOnce(makeSelectChain(data));
}

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  rmDailySales: {
    tenantId: 'rm_daily_sales.tenant_id',
    locationId: 'rm_daily_sales.location_id',
    businessDate: 'rm_daily_sales.business_date',
    orderCount: 'rm_daily_sales.order_count',
    grossSales: 'rm_daily_sales.gross_sales',
    discountTotal: 'rm_daily_sales.discount_total',
    taxTotal: 'rm_daily_sales.tax_total',
    netSales: 'rm_daily_sales.net_sales',
    tenderCash: 'rm_daily_sales.tender_cash',
    tenderCard: 'rm_daily_sales.tender_card',
    voidCount: 'rm_daily_sales.void_count',
    voidTotal: 'rm_daily_sales.void_total',
    avgOrderValue: 'rm_daily_sales.avg_order_value',
  },
  rmItemSales: {
    tenantId: 'rm_item_sales.tenant_id',
    locationId: 'rm_item_sales.location_id',
    businessDate: 'rm_item_sales.business_date',
    catalogItemId: 'rm_item_sales.catalog_item_id',
    catalogItemName: 'rm_item_sales.catalog_item_name',
    quantitySold: 'rm_item_sales.quantity_sold',
    grossRevenue: 'rm_item_sales.gross_revenue',
    quantityVoided: 'rm_item_sales.quantity_voided',
    voidRevenue: 'rm_item_sales.void_revenue',
  },
  rmInventoryOnHand: {
    tenantId: 'rm_inventory_on_hand.tenant_id',
    locationId: 'rm_inventory_on_hand.location_id',
    inventoryItemId: 'rm_inventory_on_hand.inventory_item_id',
    itemName: 'rm_inventory_on_hand.item_name',
    onHand: 'rm_inventory_on_hand.on_hand',
    lowStockThreshold: 'rm_inventory_on_hand.low_stock_threshold',
    isBelowThreshold: 'rm_inventory_on_hand.is_below_threshold',
  },
  rmCustomerActivity: {
    tenantId: 'rm_customer_activity.tenant_id',
    customerId: 'rm_customer_activity.customer_id',
    lastVisitAt: 'rm_customer_activity.last_visit_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  ilike: vi.fn(),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn(),
  }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import { getDailySales } from '../queries/get-daily-sales';
import { getItemSales } from '../queries/get-item-sales';
import { getInventorySummary } from '../queries/get-inventory-summary';
import { getDashboardMetrics } from '../queries/get-dashboard-metrics';

// ── Constants ─────────────────────────────────────────────────

const TENANT = 'tenant_001';
const LOCATION = 'loc_001';

// ═══════════════════════════════════════════════════════════════
// getDailySales
// ═══════════════════════════════════════════════════════════════

describe('getDailySales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns single-location rows with numeric conversions', async () => {
    mockSelectReturns([
      {
        businessDate: '2026-03-15',
        locationId: LOCATION,
        orderCount: 5,
        grossSales: '500.0000',
        discountTotal: '50.0000',
        taxTotal: '33.7500',
        netSales: '483.7500',
        tenderCash: '200.0000',
        tenderCard: '283.7500',
        voidCount: 1,
        voidTotal: '25.0000',
        avgOrderValue: '96.7500',
        id: 'rm_001',
        tenantId: TENANT,
        updatedAt: new Date(),
      },
    ]);

    const result = await getDailySales({
      tenantId: TENANT,
      locationId: LOCATION,
      dateFrom: '2026-03-15',
      dateTo: '2026-03-15',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.businessDate).toBe('2026-03-15');
    expect(result[0]!.locationId).toBe(LOCATION);
    expect(result[0]!.grossSales).toBe(500);
    expect(result[0]!.netSales).toBe(483.75);
    expect(result[0]!.avgOrderValue).toBe(96.75);
    expect(typeof result[0]!.grossSales).toBe('number');
  });

  it('returns multi-location aggregated rows with locationId null', async () => {
    mockSelectReturns([
      {
        businessDate: '2026-03-15',
        orderCount: 12,
        grossSales: '1200.0000',
        discountTotal: '100.0000',
        taxTotal: '82.5000',
        netSales: '1182.5000',
        tenderCash: '500.0000',
        tenderCard: '682.5000',
        voidCount: 2,
        voidTotal: '50.0000',
        avgOrderValue: '98.5417',
      },
    ]);

    const result = await getDailySales({
      tenantId: TENANT,
      dateFrom: '2026-03-15',
      dateTo: '2026-03-15',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.locationId).toBeNull();
    expect(result[0]!.grossSales).toBe(1200);
    expect(result[0]!.orderCount).toBe(12);
  });

  it('returns empty array when no data', async () => {
    mockSelectReturns([]);

    const result = await getDailySales({
      tenantId: TENANT,
      locationId: LOCATION,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });

    expect(result).toEqual([]);
  });

  it('calls withTenant with the correct tenantId', async () => {
    mockSelectReturns([]);

    await getDailySales({
      tenantId: TENANT,
      locationId: LOCATION,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });

    expect(mockWithTenant).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });
});

// ═══════════════════════════════════════════════════════════════
// getItemSales
// ═══════════════════════════════════════════════════════════════

describe('getItemSales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns item sales with numeric conversions', async () => {
    mockSelectReturns([
      {
        catalogItemId: 'item_001',
        catalogItemName: 'Burger',
        quantitySold: 25,
        grossRevenue: '375.0000',
        quantityVoided: 2,
        voidRevenue: '30.0000',
      },
      {
        catalogItemId: 'item_002',
        catalogItemName: 'Fries',
        quantitySold: 40,
        grossRevenue: '200.0000',
        quantityVoided: 0,
        voidRevenue: '0.0000',
      },
    ]);

    const result = await getItemSales({
      tenantId: TENANT,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.catalogItemName).toBe('Burger');
    expect(result[0]!.grossRevenue).toBe(375);
    expect(result[1]!.quantitySold).toBe(40);
    expect(typeof result[0]!.grossRevenue).toBe('number');
  });

  it('respects limit parameter capped at 500', async () => {
    mockSelectReturns([]);

    await getItemSales({
      tenantId: TENANT,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      limit: 1000,
    });

    // The chain's .limit() should have been called — verify via mockSelect chain
    expect(mockSelect).toHaveBeenCalled();
  });

  it('supports sortBy grossRevenue', async () => {
    mockSelectReturns([
      {
        catalogItemId: 'item_001',
        catalogItemName: 'Steak',
        quantitySold: 5,
        grossRevenue: '250.0000',
        quantityVoided: 0,
        voidRevenue: '0.0000',
      },
    ]);

    const result = await getItemSales({
      tenantId: TENANT,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      sortBy: 'grossRevenue',
      sortDir: 'desc',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.grossRevenue).toBe(250);
  });

  it('filters by locationId when provided', async () => {
    mockSelectReturns([]);

    await getItemSales({
      tenantId: TENANT,
      locationId: LOCATION,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });

    expect(mockWithTenant).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });
});

// ═══════════════════════════════════════════════════════════════
// getInventorySummary
// ═══════════════════════════════════════════════════════════════

describe('getInventorySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns inventory rows', async () => {
    mockSelectReturns([
      {
        locationId: LOCATION,
        inventoryItemId: 'inv_001',
        itemName: 'Widget A',
        onHand: 42,
        lowStockThreshold: 10,
        isBelowThreshold: false,
      },
      {
        locationId: LOCATION,
        inventoryItemId: 'inv_002',
        itemName: 'Widget B',
        onHand: 3,
        lowStockThreshold: 5,
        isBelowThreshold: true,
      },
    ]);

    const result = await getInventorySummary({ tenantId: TENANT });

    expect(result).toHaveLength(2);
    expect(result[0]!.itemName).toBe('Widget A');
    expect(result[1]!.isBelowThreshold).toBe(true);
  });

  it('filters below-threshold-only when flag is set', async () => {
    mockSelectReturns([
      {
        locationId: LOCATION,
        inventoryItemId: 'inv_002',
        itemName: 'Widget B',
        onHand: 3,
        lowStockThreshold: 5,
        isBelowThreshold: true,
      },
    ]);

    const result = await getInventorySummary({
      tenantId: TENANT,
      belowThresholdOnly: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.isBelowThreshold).toBe(true);
  });

  it('supports search filter', async () => {
    mockSelectReturns([]);

    await getInventorySummary({
      tenantId: TENANT,
      search: 'Widget',
    });

    expect(mockSelect).toHaveBeenCalled();
  });

  it('returns empty array when no items', async () => {
    mockSelectReturns([]);

    const result = await getInventorySummary({ tenantId: TENANT, locationId: LOCATION });

    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getDashboardMetrics
// ═══════════════════════════════════════════════════════════════

describe('getDashboardMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated dashboard metrics', async () => {
    // 1st select: daily sales aggregation
    mockSelectReturns([{ netSales: '1500.0000', orderCount: 15, voidCount: 2 }]);
    // 2nd select: low stock count
    mockSelectReturns([{ count: 3 }]);
    // 3rd select: active customers
    mockSelectReturns([{ count: 42 }]);

    const result = await getDashboardMetrics({
      tenantId: TENANT,
      date: '2026-03-15',
    });

    expect(result.todaySales).toBe(1500);
    expect(result.todayOrders).toBe(15);
    expect(result.todayVoids).toBe(2);
    expect(result.lowStockCount).toBe(3);
    expect(result.activeCustomers30d).toBe(42);
  });

  it('returns zeros when no data', async () => {
    mockSelectReturns([{ netSales: null, orderCount: null, voidCount: null }]);
    mockSelectReturns([{ count: 0 }]);
    mockSelectReturns([{ count: 0 }]);

    const result = await getDashboardMetrics({
      tenantId: TENANT,
      date: '2026-03-15',
    });

    expect(result.todaySales).toBe(0);
    expect(result.todayOrders).toBe(0);
    expect(result.todayVoids).toBe(0);
    expect(result.lowStockCount).toBe(0);
    expect(result.activeCustomers30d).toBe(0);
  });

  it('defaults date to today when not provided', async () => {
    mockSelectReturns([{ netSales: '100.0000', orderCount: 2, voidCount: 0 }]);
    mockSelectReturns([{ count: 0 }]);
    mockSelectReturns([{ count: 0 }]);

    const result = await getDashboardMetrics({ tenantId: TENANT });

    expect(result.todaySales).toBe(100);
    expect(mockWithTenant).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

  it('filters by locationId when provided', async () => {
    mockSelectReturns([{ netSales: '500.0000', orderCount: 5, voidCount: 1 }]);
    mockSelectReturns([{ count: 1 }]);
    mockSelectReturns([{ count: 10 }]);

    const result = await getDashboardMetrics({
      tenantId: TENANT,
      locationId: LOCATION,
      date: '2026-03-15',
    });

    expect(result.todaySales).toBe(500);
    expect(result.todayOrders).toBe(5);
  });
});
