import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const state = {
    order: {
      id: 'order-1',
      tenantId: 'tenant-1',
      status: 'open',
      subtotal: 0,
      taxTotal: 0,
      serviceChargeTotal: 0,
      discountTotal: 0,
      total: 0,
      version: 1,
    } as any,
    insertedLineValues: null as any,
  };

  const publishWithOutbox = vi.fn();
  const buildEventFromContext = vi.fn();
  const auditLog = vi.fn();
  const checkIdempotency = vi.fn();
  const saveIdempotencyKey = vi.fn();
  const fetchOrderForMutation = vi.fn();
  const incrementVersion = vi.fn();
  const recalculateOrderTotals = vi.fn();
  const calculateTaxes = vi.fn();
  const getCatalogReadApi = vi.fn();

  return {
    state,
    publishWithOutbox,
    buildEventFromContext,
    auditLog,
    checkIdempotency,
    saveIdempotencyKey,
    fetchOrderForMutation,
    incrementVersion,
    recalculateOrderTotals,
    calculateTaxes,
    getCatalogReadApi,
  };
});

// ── vi.mock declarations ───────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  orders: { id: 'id' },
  orderLines: { orderId: 'order_id', sortOrder: 'sort_order', lineSubtotal: 'line_subtotal', lineTax: 'line_tax', lineTotal: 'line_total' },
  orderCharges: { orderId: 'order_id', amount: 'amount', taxAmount: 'tax_amount' },
  orderDiscounts: { orderId: 'order_id', amount: 'amount' },
  orderLineTaxes: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  max: vi.fn((col) => ({ type: 'max', col })),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: mocks.publishWithOutbox,
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: mocks.buildEventFromContext,
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mocks.auditLog,
}));

vi.mock('../helpers/idempotency', () => ({
  checkIdempotency: mocks.checkIdempotency,
  saveIdempotencyKey: mocks.saveIdempotencyKey,
}));

vi.mock('../helpers/optimistic-lock', () => ({
  fetchOrderForMutation: mocks.fetchOrderForMutation,
  incrementVersion: mocks.incrementVersion,
}));

vi.mock('../helpers/order-totals', () => ({
  recalculateOrderTotals: mocks.recalculateOrderTotals,
}));

vi.mock('@oppsera/core/helpers/tax-calc', () => ({
  calculateTaxes: mocks.calculateTaxes,
}));

vi.mock('@oppsera/core/helpers/catalog-read-api', () => ({
  getCatalogReadApi: mocks.getCatalogReadApi,
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class extends Error {
    code: string; statusCode: number;
    constructor(code: string, message: string, status = 400) {
      super(message); this.code = code; this.statusCode = status;
    }
  },
  NotFoundError: class extends Error {
    code = 'NOT_FOUND'; statusCode = 404;
    constructor(entity: string, id?: string) { super(`${entity} ${id ?? ''} not found`); }
  },
  computePackageAllocations: vi.fn((salePriceCents: number, components: any[]) =>
    components.map((c: any) => ({
      ...c,
      componentExtendedCents: c.qty * c.componentUnitPriceCents,
      allocatedRevenueCents: Math.round(salePriceCents / components.length),
      allocationWeight: 1 / components.length,
      subDepartmentId: c.subDepartmentId ?? null,
    })),
  ),
}));

// ── Helpers ────────────────────────────────────────────────────────
function createCtx(): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
  } as unknown as RequestContext;
}

function createMockTx() {
  let insertCallCount = 0;

  // Track what gets passed to insert().values()
  const valuesFn = vi.fn(function (vals: any) {
    // First insert is the order line, second is tax breakdown
    insertCallCount++;
    if (insertCallCount === 1) {
      mocks.state.insertedLineValues = vals;
    }
    return {
      returning: vi.fn(async () => [{
        id: 'line-new',
        tenantId: 'tenant-1',
        orderId: 'order-1',
        catalogItemId: vals.catalogItemId ?? 'item-1',
        catalogItemName: vals.catalogItemName ?? 'Widget',
        subDepartmentId: vals.subDepartmentId ?? null,
        taxGroupId: vals.taxGroupId ?? null,
        packageComponents: vals.packageComponents ?? null,
        qty: vals.qty ?? '1.0000',
        unitPrice: vals.unitPrice ?? 1000,
        lineSubtotal: vals.lineSubtotal ?? 1000,
        lineTax: vals.lineTax ?? 100,
        lineTotal: vals.lineTotal ?? 1100,
      }]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
  });

  const insertFn = vi.fn(() => ({
    values: valuesFn,
  }));

  // Build a select chain that handles both { maxSort } and the parallel allLines/allCharges/allDiscounts
  let selectCallCount = 0;
  const selectFn = vi.fn((selectObj?: any) => {
    // Sort order query has { maxSort } param
    if (selectObj && selectObj.maxSort) {
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ maxSort: 0 }]),
        })),
      };
    }
    // Regular selects: allLines, allCharges, allDiscounts
    selectCallCount++;
    const p = Promise.resolve([]);
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => {
          if (selectCallCount === 1) {
            return Promise.resolve([{ lineSubtotal: 1000, lineTax: 100, lineTotal: 1100 }]);
          }
          return Promise.resolve([]);
        }),
        then: p.then.bind(p),
        catch: p.catch.bind(p),
      })),
    };
  });

  return {
    select: selectFn,
    insert: insertFn,
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };
}

const basePosItem = {
  id: 'item-1',
  sku: 'SKU-001',
  barcode: null,
  name: 'Widget',
  itemType: 'retail',
  isTrackable: true,
  unitPriceCents: 1000,
  taxInfo: {
    calculationMode: 'exclusive' as const,
    taxGroups: [{ id: 'tax-grp-1', name: 'Standard Tax' }],
    taxRates: [{ id: 'rate-1', name: 'State Tax', rateDecimal: 0.1 }],
    totalRate: 0.1,
  },
  metadata: null,
  categoryId: 'cat-1',
  subDepartmentId: 'subdept-retail',
};

const baseInput = {
  clientRequestId: 'req-001',
  catalogItemId: 'item-1',
  qty: 1,
};

import { addLineItem } from '../commands/add-line-item';

describe('addLineItem — subDepartmentId population', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.insertedLineValues = null;

    const mockCatalogApi = {
      getItemForPOS: vi.fn().mockResolvedValue(basePosItem),
      getEffectivePrice: vi.fn().mockResolvedValue(10.00),
      getSubDepartmentForItem: vi.fn().mockResolvedValue('subdept-retail'),
      getItem: vi.fn(),
      getItemsWithModifiers: vi.fn(),
      getItemTaxes: vi.fn(),
    };
    mocks.getCatalogReadApi.mockReturnValue(mockCatalogApi);

    mocks.publishWithOutbox.mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
    mocks.buildEventFromContext.mockImplementation((_ctx: any, eventType: string, data: any) => ({
      eventId: 'evt-1', eventType, data,
    }));
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.checkIdempotency.mockResolvedValue({ isDuplicate: false, originalResult: null });
    mocks.saveIdempotencyKey.mockResolvedValue(undefined);
    mocks.fetchOrderForMutation.mockImplementation(async () => mocks.state.order);
    mocks.incrementVersion.mockResolvedValue(undefined);
    mocks.calculateTaxes.mockReturnValue({
      subtotal: 1000,
      taxTotal: 100,
      total: 1100,
      breakdown: [{ taxRateId: 'rate-1', taxName: 'State Tax', rateDecimal: 0.1, amount: 100 }],
    });
    mocks.recalculateOrderTotals.mockReturnValue({
      subtotal: 1000,
      taxTotal: 100,
      serviceChargeTotal: 0,
      discountTotal: 0,
      total: 1100,
    });
  });

  it('should store subDepartmentId from POS item on order line', async () => {
    const ctx = createCtx();
    await addLineItem(ctx, 'order-1', baseInput);

    expect(mocks.state.insertedLineValues).toBeDefined();
    expect(mocks.state.insertedLineValues.subDepartmentId).toBe('subdept-retail');
  });

  it('should store taxGroupId from first tax group on order line', async () => {
    const ctx = createCtx();
    await addLineItem(ctx, 'order-1', baseInput);

    expect(mocks.state.insertedLineValues).toBeDefined();
    expect(mocks.state.insertedLineValues.taxGroupId).toBe('tax-grp-1');
  });

  it('should handle null subDepartmentId (item without category)', async () => {
    const catalogApi = mocks.getCatalogReadApi();
    catalogApi.getItemForPOS.mockResolvedValueOnce({
      ...basePosItem,
      subDepartmentId: null,
      categoryId: null,
    });

    const ctx = createCtx();
    await addLineItem(ctx, 'order-1', baseInput);

    expect(mocks.state.insertedLineValues.subDepartmentId).toBeNull();
  });

  it('should handle item with no tax groups', async () => {
    const catalogApi = mocks.getCatalogReadApi();
    catalogApi.getItemForPOS.mockResolvedValueOnce({
      ...basePosItem,
      taxInfo: {
        calculationMode: 'exclusive' as const,
        taxGroups: [],
        taxRates: [],
        totalRate: 0,
      },
    });
    mocks.calculateTaxes.mockReturnValueOnce({
      subtotal: 1000,
      taxTotal: 0,
      total: 1000,
      breakdown: [],
    });

    const ctx = createCtx();
    await addLineItem(ctx, 'order-1', baseInput);

    expect(mocks.state.insertedLineValues.taxGroupId).toBeNull();
  });

  it('should include subDepartmentId in package component allocations', async () => {
    const catalogApi = mocks.getCatalogReadApi();
    catalogApi.getItemForPOS.mockResolvedValueOnce({
      ...basePosItem,
      itemType: 'package',
      subDepartmentId: 'subdept-pkg',
      metadata: {
        isPackage: true,
        pricingMode: 'fixed',
        packageComponents: [
          { catalogItemId: 'comp-1', itemName: 'Steak', itemType: 'fnb', qty: 1 },
          { catalogItemId: 'comp-2', itemName: 'Wine', itemType: 'fnb', qty: 1 },
        ],
      },
    });
    catalogApi.getEffectivePrice
      .mockResolvedValueOnce(15.00)
      .mockResolvedValueOnce(8.00);
    catalogApi.getSubDepartmentForItem
      .mockResolvedValueOnce('subdept-food')
      .mockResolvedValueOnce('subdept-bev');

    const ctx = createCtx();
    await addLineItem(ctx, 'order-1', baseInput);

    expect(mocks.state.insertedLineValues.packageComponents).toBeDefined();
    expect(mocks.state.insertedLineValues.packageComponents).toHaveLength(2);
    expect(mocks.state.insertedLineValues.packageComponents[0].subDepartmentId).toBe('subdept-food');
    expect(mocks.state.insertedLineValues.packageComponents[1].subDepartmentId).toBe('subdept-bev');
  });

  it('should handle package component with null subdepartment', async () => {
    const catalogApi = mocks.getCatalogReadApi();
    catalogApi.getItemForPOS.mockResolvedValueOnce({
      ...basePosItem,
      itemType: 'package',
      subDepartmentId: 'subdept-pkg',
      metadata: {
        isPackage: true,
        pricingMode: 'fixed',
        packageComponents: [
          { catalogItemId: 'comp-1', itemName: 'Misc', itemType: 'retail', qty: 1 },
        ],
      },
    });
    catalogApi.getEffectivePrice.mockResolvedValueOnce(10.00);
    catalogApi.getSubDepartmentForItem.mockResolvedValueOnce(null);

    const ctx = createCtx();
    await addLineItem(ctx, 'order-1', baseInput);

    expect(mocks.state.insertedLineValues.packageComponents).toBeDefined();
    expect(mocks.state.insertedLineValues.packageComponents[0].subDepartmentId).toBeNull();
  });
});
