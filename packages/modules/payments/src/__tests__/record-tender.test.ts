import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  // State that tests can mutate
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
      customerId: null,
      version: 1,
    } as any,
    orderLines: [{ lineTotal: 2000, lineTax: 200 }] as any[],
    idempotencyResult: { isDuplicate: false, originalResult: null } as any,
  };

  // Named mock functions that persist across resets
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
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
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
  const tenderId = `tender-${Date.now()}`;

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
      id: tenderId,
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

function createCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
    ...overrides,
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

describe('recordTender', () => {
  beforeEach(() => {
    // Reset all mock implementations
    mocks.publishWithOutbox.mockReset();
    mocks.buildEventFromContext.mockReset();
    mocks.auditLog.mockReset();
    mocks.checkIdempotency.mockReset();
    mocks.saveIdempotencyKey.mockReset();
    mocks.fetchOrderForMutation.mockReset();
    mocks.incrementVersion.mockReset();
    mocks.generateJournalEntry.mockReset();
    mocks.getAccountingPostingApi.mockReset();

    // Reset test state
    mocks.state.existingTenders = [];
    mocks.state.existingReversals = [];
    mocks.state.order = {
      id: 'order-1', tenantId: 'tenant-1', status: 'placed', total: 2000,
      subtotal: 1800, taxTotal: 200, serviceChargeTotal: 0, discountTotal: 0,
      businessDate: '2026-01-15', orderNumber: 'ORD-001', customerId: null, version: 1,
    };
    mocks.state.orderLines = [{ lineTotal: 2000, lineTax: 200 }];
    mocks.state.idempotencyResult = { isDuplicate: false, originalResult: null };

    // Setup default mock implementations
    mocks.publishWithOutbox.mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
    mocks.buildEventFromContext.mockImplementation((_ctx: any, eventType: string, data: any) => ({
      eventId: 'evt-1', eventType, data,
    }));
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.checkIdempotency.mockImplementation(async () => mocks.state.idempotencyResult);
    mocks.saveIdempotencyKey.mockResolvedValue(undefined);
    mocks.fetchOrderForMutation.mockImplementation(async () => mocks.state.order);
    mocks.incrementVersion.mockResolvedValue(undefined);
    mocks.generateJournalEntry.mockResolvedValue({
      entries: [],
      allocationSnapshot: { method: 'proportional', tenderRatio: 1, entries: [] },
    });
    // Default: legacy GL is enabled (AccountingPostingApi returns enableLegacyGlPosting: true)
    mocks.getAccountingPostingApi.mockReturnValue({
      getSettings: vi.fn().mockResolvedValue({
        enableLegacyGlPosting: true,
        defaultAPControlAccountId: null,
        defaultARControlAccountId: null,
        baseCurrency: 'USD',
      }),
    });
  });

  it('should throw when locationId is missing', async () => {
    const ctx = createCtx({ locationId: undefined });
    await expect(recordTender(ctx, 'order-1', baseInput)).rejects.toThrow(
      'X-Location-Id header is required',
    );
  });

  it('should throw when clientRequestId is missing', async () => {
    const ctx = createCtx();
    await expect(
      recordTender(ctx, 'order-1', { ...baseInput, clientRequestId: '' }),
    ).rejects.toThrow('clientRequestId is required');
  });

  it('should return idempotent result for duplicate request', async () => {
    const duplicateResult = {
      tender: { id: 'existing-tender' },
      changeGiven: 0, isFullyPaid: true, remainingBalance: 0, totalTendered: 2000,
    };
    mocks.state.idempotencyResult = { isDuplicate: true, originalResult: duplicateResult };

    const ctx = createCtx();
    const result = await recordTender(ctx, 'order-1', baseInput);
    expect(result).toEqual(duplicateResult);
  });

  it('should throw when businessDate does not match order', async () => {
    const ctx = createCtx();
    await expect(
      recordTender(ctx, 'order-1', { ...baseInput, businessDate: '2026-01-16' }),
    ).rejects.toThrow('Business date does not match');
  });

  it('should throw when order is already fully paid', async () => {
    mocks.state.existingTenders = [{ id: 'tender-prev', amount: 2000, status: 'captured' }];

    const ctx = createCtx();
    await expect(recordTender(ctx, 'order-1', baseInput)).rejects.toThrow('already fully paid');
  });

  it('should record a full payment with exact amount', async () => {
    const ctx = createCtx();
    const result = await recordTender(ctx, 'order-1', baseInput);

    expect(result).toBeDefined();
    expect(result.isFullyPaid).toBe(true);
    expect(result.changeGiven).toBe(0);
    expect(result.remainingBalance).toBe(0);
    expect(result.totalTendered).toBe(2000);
  });

  it('should calculate change when overpaying with cash', async () => {
    const ctx = createCtx();
    const result = await recordTender(ctx, 'order-1', { ...baseInput, amountGiven: 2500 });

    expect(result.isFullyPaid).toBe(true);
    expect(result.changeGiven).toBe(500);
    expect(result.totalTendered).toBe(2000);
  });

  it('should record a partial payment', async () => {
    const ctx = createCtx();
    const result = await recordTender(ctx, 'order-1', { ...baseInput, amountGiven: 1000 });

    expect(result.isFullyPaid).toBe(false);
    expect(result.changeGiven).toBe(0);
    expect(result.remainingBalance).toBe(1000);
    expect(result.totalTendered).toBe(1000);
  });

  it('should handle split tender (second payment completes order)', async () => {
    mocks.state.existingTenders = [{ id: 'tender-1', amount: 1000, status: 'captured' }];

    const ctx = createCtx();
    const result = await recordTender(ctx, 'order-1', { ...baseInput, amountGiven: 1000 });

    expect(result.isFullyPaid).toBe(true);
    expect(result.totalTendered).toBe(2000);
    expect(result.remainingBalance).toBe(0);
  });

  it('should exclude reversed tenders from balance calculation', async () => {
    mocks.state.existingTenders = [{ id: 'tender-reversed', amount: 1000, status: 'captured' }];
    mocks.state.existingReversals = [{ originalTenderId: 'tender-reversed' }];

    const ctx = createCtx();
    const result = await recordTender(ctx, 'order-1', baseInput);

    expect(result.isFullyPaid).toBe(true);
    expect(result.totalTendered).toBe(2000);
  });

  it('should handle tender with tip', async () => {
    const ctx = createCtx();
    const result = await recordTender(ctx, 'order-1', { ...baseInput, tipAmount: 300 });

    expect(result.isFullyPaid).toBe(true);
    expect(result.remainingBalance).toBe(0);
  });

  it('should call auditLog after successful recording', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    expect(mocks.auditLog).toHaveBeenCalledWith(ctx, 'tender.recorded', 'order', 'order-1');
  });

  it('should call generateJournalEntry when legacy GL is enabled (default)', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    expect(mocks.generateJournalEntry).toHaveBeenCalled();
  });

  it('should NOT call generateJournalEntry when legacy GL is disabled', async () => {
    mocks.getAccountingPostingApi.mockReturnValue({
      getSettings: vi.fn().mockResolvedValue({
        enableLegacyGlPosting: false,
        defaultAPControlAccountId: null,
        defaultARControlAccountId: null,
        baseCurrency: 'USD',
      }),
    });

    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    expect(mocks.generateJournalEntry).not.toHaveBeenCalled();
  });

  it('should fall back to legacy GL when AccountingPostingApi is not initialized', async () => {
    mocks.getAccountingPostingApi.mockImplementation(() => {
      throw new Error('AccountingPostingApi not initialized');
    });

    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    // Should still call legacy GL because we fall back to true when API is unavailable
    expect(mocks.generateJournalEntry).toHaveBeenCalled();
  });

  it('should include order-level totals in the emitted event', async () => {
    const ctx = createCtx();
    await recordTender(ctx, 'order-1', baseInput);

    expect(mocks.buildEventFromContext).toHaveBeenCalledWith(
      ctx,
      'tender.recorded.v1',
      expect.objectContaining({
        orderTotal: 2000,
        subtotal: 1800,
        taxTotal: 200,
        discountTotal: 0,
        serviceChargeTotal: 0,
      }),
    );
  });
});
