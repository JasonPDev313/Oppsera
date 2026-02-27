import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const state = {
    existingTenders: [] as any[],
    existingReversals: [] as any[],
    order: {
      id: 'order-1',
      tenantId: 'tenant-1',
      status: 'placed',
      total: 2000,
      subtotal: 1800,
      taxTotal: 200,
      serviceChargeTotal: 0,
      discountTotal: 0,
      businessDate: '2026-01-15',
      orderNumber: 'ORD-001',
      customerId: 'cust-1',
      version: 1,
    } as any,
    orderLines: [
      {
        id: 'line-1',
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        subDepartmentId: 'subdept-1',
        taxGroupId: 'tax-grp-1',
        qty: '2.0000',
        lineSubtotal: 1800,
        lineTax: 200,
        lineTotal: 2000,
        costPrice: 500,
        packageComponents: null,
      },
    ] as any[],
    idempotencyResult: { isDuplicate: false, originalResult: null } as any,
  };

  const publishWithOutbox = vi.fn();
  const buildEventFromContext = vi.fn();
  const auditLog = vi.fn();
  const checkIdempotency = vi.fn();
  const saveIdempotencyKey = vi.fn();
  const fetchOrderForMutation = vi.fn();
  const incrementVersion = vi.fn();
  const generateJournalEntry = vi.fn();
  const getAccountingPostingApi = vi.fn();

  return {
    state,
    publishWithOutbox,
    buildEventFromContext,
    auditLog,
    checkIdempotency,
    saveIdempotencyKey,
    fetchOrderForMutation,
    incrementVersion,
    generateJournalEntry,
    getAccountingPostingApi,
  };
});

// ── vi.mock declarations ───────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  tenders: { tenantId: 'tenant_id', orderId: 'order_id', status: 'status', id: 'id' },
  tenderReversals: { tenantId: 'tenant_id', orderId: 'order_id', originalTenderId: 'original_tender_id' },
  orderLines: { orderId: 'order_id' },
  orders: { id: 'id' },
  orderDiscounts: { orderId: 'order_id', discountClassification: 'discount_classification', amount: 'amount' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: Object.assign((strings: TemplateStringsArray, ..._: unknown[]) => strings.join(''), { raw: (s: string) => s }),
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

vi.mock('@oppsera/core/helpers/idempotency', () => ({
  checkIdempotency: mocks.checkIdempotency,
  saveIdempotencyKey: mocks.saveIdempotencyKey,
}));

vi.mock('@oppsera/core/helpers/optimistic-lock', () => ({
  fetchOrderForMutation: mocks.fetchOrderForMutation,
  incrementVersion: mocks.incrementVersion,
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, status = 400) {
      super(message); this.code = code; this.statusCode = status;
    }
  },
  ValidationError: class extends Error {
    code = 'VALIDATION_ERROR'; statusCode = 400; details: any[];
    constructor(message: string, details: any[] = []) {
      super(message); this.details = details;
    }
  },
  ConflictError: class extends Error {
    code = 'CONFLICT'; statusCode = 409;
    constructor(message: string) { super(message); }
  },
}));

vi.mock('../helpers/gl-journal', () => ({
  generateJournalEntry: mocks.generateJournalEntry,
}));

vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: mocks.getAccountingPostingApi,
}));

// ── Helpers ────────────────────────────────────────────────────────
function createMockTx() {
  let selectCallCount = 0;

  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn(function (this: any) { selectCallCount++; return this; }),
    where: vi.fn(function () {
      if (selectCallCount === 1) return Promise.resolve(mocks.state.existingTenders);
      if (selectCallCount === 2) return Promise.resolve(mocks.state.existingReversals);
      if (selectCallCount === 3) return Promise.resolve(mocks.state.orderLines);
      return Promise.resolve([]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(async () => [{
      id: `tender-${Date.now()}`,
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      orderId: 'order-1',
      tenderType: 'cash',
      tenderSequence: mocks.state.existingTenders.length + 1,
      amount: 0,
      tipAmount: 0,
      changeGiven: 0,
      amountGiven: 0,
      status: 'captured',
      businessDate: '2026-01-15',
    }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
}

function createCtx(): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
  } as unknown as RequestContext;
}

const baseInput = {
  clientRequestId: 'req-001',
  orderId: 'order-1',
  tenderType: 'cash' as const,
  amountGiven: 2000,
  terminalId: 'term-1',
  employeeId: 'emp-1',
  businessDate: '2026-01-15',
};

import { recordTender } from '../commands/record-tender';

describe('recordTender — event enrichment', () => {
  let capturedEventData: any = null;

  beforeEach(() => {
    capturedEventData = null;

    mocks.publishWithOutbox.mockReset();
    mocks.buildEventFromContext.mockReset();
    mocks.auditLog.mockReset();
    mocks.checkIdempotency.mockReset();
    mocks.saveIdempotencyKey.mockReset();
    mocks.fetchOrderForMutation.mockReset();
    mocks.incrementVersion.mockReset();
    mocks.generateJournalEntry.mockReset();
    mocks.getAccountingPostingApi.mockReset();

    // Reset state
    mocks.state.existingTenders = [];
    mocks.state.existingReversals = [];
    mocks.state.order = {
      id: 'order-1', tenantId: 'tenant-1', status: 'placed', total: 2000,
      subtotal: 1800, taxTotal: 200, serviceChargeTotal: 0, discountTotal: 0,
      businessDate: '2026-01-15', orderNumber: 'ORD-001', customerId: 'cust-1', version: 1,
    };
    mocks.state.orderLines = [
      {
        id: 'line-1',
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        subDepartmentId: 'subdept-1',
        taxGroupId: 'tax-grp-1',
        qty: '2.0000',
        lineSubtotal: 1800,
        lineTax: 200,
        lineTotal: 2000,
        costPrice: 500,
        packageComponents: null,
      },
    ];
    mocks.state.idempotencyResult = { isDuplicate: false, originalResult: null };

    mocks.publishWithOutbox.mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
    mocks.buildEventFromContext.mockImplementation((_ctx: any, eventType: string, data: any) => {
      capturedEventData = data;
      return { eventId: 'evt-1', eventType, data };
    });
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.checkIdempotency.mockImplementation(async () => mocks.state.idempotencyResult);
    mocks.saveIdempotencyKey.mockResolvedValue(undefined);
    mocks.fetchOrderForMutation.mockImplementation(async () => mocks.state.order);
    mocks.incrementVersion.mockResolvedValue(undefined);
    mocks.generateJournalEntry.mockResolvedValue({
      entries: [],
      allocationSnapshot: { method: 'proportional', tenderRatio: 1, entries: [] },
    });
    mocks.getAccountingPostingApi.mockReturnValue({
      getSettings: vi.fn().mockResolvedValue({
        enableLegacyGlPosting: true,
        defaultAPControlAccountId: null,
        defaultARControlAccountId: null,
        baseCurrency: 'USD',
      }),
    });
  });

  it('should include lines array in tender.recorded.v1 event', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    expect(capturedEventData).toBeDefined();
    expect(capturedEventData.lines).toBeDefined();
    expect(Array.isArray(capturedEventData.lines)).toBe(true);
    expect(capturedEventData.lines).toHaveLength(1);
  });

  it('should include subDepartmentId on each line in event', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    const line = capturedEventData.lines[0];
    expect(line.subDepartmentId).toBe('subdept-1');
  });

  it('should include taxGroupId on each line in event', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    const line = capturedEventData.lines[0];
    expect(line.taxGroupId).toBe('tax-grp-1');
  });

  it('should include taxAmountCents on each line in event', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    const line = capturedEventData.lines[0];
    expect(line.taxAmountCents).toBe(200);
  });

  it('should include extendedPriceCents on each line', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    const line = capturedEventData.lines[0];
    expect(line.extendedPriceCents).toBe(1800);
  });

  it('should include catalogItemId and catalogItemName', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    const line = capturedEventData.lines[0];
    expect(line.catalogItemId).toBe('item-1');
    expect(line.catalogItemName).toBe('Widget');
  });

  it('should include numeric qty (not string)', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    const line = capturedEventData.lines[0];
    expect(typeof line.qty).toBe('number');
    expect(line.qty).toBe(2);
  });

  it('should include packageComponents from order line', async () => {
    mocks.state.orderLines = [{
      id: 'line-1',
      catalogItemId: 'pkg-1',
      catalogItemName: 'Dinner Package',
      subDepartmentId: 'subdept-pkg',
      taxGroupId: null,
      qty: '1.0000',
      lineSubtotal: 3000,
      lineTax: 0,
      lineTotal: 3000,
      costPrice: null,
      packageComponents: [
        { catalogItemId: 'food-1', catalogItemName: 'Steak', subDepartmentId: 'subdept-food', qty: 1, allocatedRevenueCents: 2000 },
        { catalogItemId: 'bev-1', catalogItemName: 'Wine', subDepartmentId: 'subdept-bev', qty: 1, allocatedRevenueCents: 1000 },
      ],
    }];

    const ctx = createCtx();
    await recordTender(ctx, 'order-1', { ...baseInput, amountGiven: 3000 });

    const line = capturedEventData.lines[0];
    expect(line.packageComponents).toBeDefined();
    expect(line.packageComponents).toHaveLength(2);
    expect(line.packageComponents[0].subDepartmentId).toBe('subdept-food');
    expect(line.packageComponents[1].subDepartmentId).toBe('subdept-bev');
  });

  it('should include paymentMethod alias for backward compat', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    expect(capturedEventData.paymentMethod).toBe('cash');
    expect(capturedEventData.tenderType).toBe('cash');
  });

  it('should handle null subDepartmentId on order line', async () => {
    mocks.state.orderLines = [{
      id: 'line-1',
      catalogItemId: 'item-1',
      catalogItemName: 'Widget',
      subDepartmentId: null,
      taxGroupId: null,
      qty: '1.0000',
      lineSubtotal: 2000,
      lineTax: 0,
      lineTotal: 2000,
      costPrice: null,
      packageComponents: null,
    }];

    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    const line = capturedEventData.lines[0];
    expect(line.subDepartmentId).toBeNull();
    expect(line.taxGroupId).toBeNull();
    expect(line.packageComponents).toBeNull();
  });

  it('should include costCents from order line', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    const line = capturedEventData.lines[0];
    expect(line.costCents).toBe(500);
  });

  it('should include customerId in event', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    expect(capturedEventData.customerId).toBe('cust-1');
  });
});
