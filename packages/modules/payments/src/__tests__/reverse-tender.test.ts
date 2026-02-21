import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const state = {
    tender: {
      id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1',
      orderId: 'order-1', tenderType: 'cash', amount: 1500, tipAmount: 0,
      status: 'captured', businessDate: '2026-01-15',
    } as any,
    existingReversals: [] as any[],
    originalJournals: [] as any[],
    order: { id: 'order-1', tenantId: 'tenant-1', status: 'paid', total: 1500 } as any,
    allTenders: [] as any[],
    allReversalsForOrder: [] as any[],
    idempotencyResult: { isDuplicate: false, originalResult: null } as any,
  };

  const publishWithOutbox = vi.fn();
  const buildEventFromContext = vi.fn();
  const auditLog = vi.fn();
  const checkIdempotency = vi.fn();
  const saveIdempotencyKey = vi.fn();
  const incrementVersion = vi.fn();

  return { state, publishWithOutbox, buildEventFromContext, auditLog, checkIdempotency, saveIdempotencyKey, incrementVersion };
});

// ── vi.mock declarations ───────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  tenders: { tenantId: 'tenant_id', id: 'id', orderId: 'order_id', status: 'status' },
  tenderReversals: { tenantId: 'tenant_id', originalTenderId: 'original_tender_id', orderId: 'order_id', id: 'id', status: 'status' },
  paymentJournalEntries: { tenantId: 'tenant_id', referenceType: 'reference_type', referenceId: 'reference_id', postingStatus: 'posting_status', id: 'id' },
  orders: { id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({ publishWithOutbox: mocks.publishWithOutbox }));
vi.mock('@oppsera/core/events/build-event', () => ({ buildEventFromContext: mocks.buildEventFromContext }));
vi.mock('@oppsera/core/audit/helpers', () => ({ auditLog: mocks.auditLog }));
vi.mock('@oppsera/core/helpers/idempotency', () => ({ checkIdempotency: mocks.checkIdempotency, saveIdempotencyKey: mocks.saveIdempotencyKey }));
vi.mock('@oppsera/core/helpers/optimistic-lock', () => ({ incrementVersion: mocks.incrementVersion }));

vi.mock('@oppsera/shared', () => ({
  AppError: class extends Error {
    code: string; statusCode: number;
    constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.statusCode = status; }
  },
  ValidationError: class extends Error {
    code = 'VALIDATION_ERROR'; statusCode = 400; details: any[];
    constructor(message: string, details: any[] = []) { super(message); this.details = details; }
  },
  ConflictError: class extends Error {
    code = 'CONFLICT'; statusCode = 409;
    constructor(message: string) { super(message); }
  },
}));

// ── Helpers ────────────────────────────────────────────────────────
function createMockTx() {
  let selectCallCount = 0;

  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn(function (this: any) { selectCallCount++; return this; }),
    where: vi.fn(function () {
      if (selectCallCount === 1) return Promise.resolve(mocks.state.tender ? [mocks.state.tender] : []);
      if (selectCallCount === 2) return Promise.resolve(mocks.state.existingReversals);
      if (selectCallCount === 3) return Promise.resolve(mocks.state.originalJournals);
      if (selectCallCount === 4) return Promise.resolve([mocks.state.order]);
      if (selectCallCount === 5) return Promise.resolve(mocks.state.allTenders);
      if (selectCallCount === 6) return Promise.resolve(mocks.state.allReversalsForOrder);
      return Promise.resolve([]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(async () => [{
      id: 'reversal-1', tenantId: 'tenant-1', locationId: 'loc-1',
      originalTenderId: mocks.state.tender?.id ?? 'tender-1',
      orderId: mocks.state.tender?.orderId ?? 'order-1',
      reversalType: 'void', amount: mocks.state.tender?.amount ?? 1500,
      reason: 'Test reason', refundMethod: 'cash', status: 'completed',
    }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
}

function createCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    tenantId: 'tenant-1', locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1', isPlatformAdmin: false,
    ...overrides,
  } as unknown as RequestContext;
}

const baseInput = {
  clientRequestId: 'rev-001', tenderId: 'tender-1', amount: 1500,
  reason: 'Customer changed mind', reversalType: 'void' as const,
};

import { reverseTender } from '../commands/reverse-tender';

describe('reverseTender', () => {
  beforeEach(() => {
    mocks.publishWithOutbox.mockReset();
    mocks.buildEventFromContext.mockReset();
    mocks.auditLog.mockReset();
    mocks.checkIdempotency.mockReset();
    mocks.saveIdempotencyKey.mockReset();
    mocks.incrementVersion.mockReset();

    // Reset state
    mocks.state.tender = {
      id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1',
      orderId: 'order-1', tenderType: 'cash', amount: 1500, tipAmount: 0,
      status: 'captured', businessDate: '2026-01-15',
    };
    mocks.state.existingReversals = [];
    mocks.state.originalJournals = [];
    mocks.state.order = { id: 'order-1', tenantId: 'tenant-1', status: 'paid', total: 1500 };
    mocks.state.allTenders = [{ id: 'tender-1', amount: 1500, status: 'captured' }];
    mocks.state.allReversalsForOrder = [];
    mocks.state.idempotencyResult = { isDuplicate: false, originalResult: null };

    // Setup implementations
    mocks.publishWithOutbox.mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
    mocks.buildEventFromContext.mockReturnValue({ eventId: 'evt-1', eventType: 'tender.reversed.v1', data: {} });
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.checkIdempotency.mockImplementation(async () => mocks.state.idempotencyResult);
    mocks.saveIdempotencyKey.mockResolvedValue(undefined);
    mocks.incrementVersion.mockResolvedValue(undefined);
  });

  it('should throw when locationId is missing', async () => {
    const ctx = createCtx({ locationId: undefined });
    await expect(reverseTender(ctx, 'tender-1', baseInput)).rejects.toThrow('X-Location-Id header is required');
  });

  it('should throw when clientRequestId is missing', async () => {
    const ctx = createCtx();
    await expect(reverseTender(ctx, 'tender-1', { ...baseInput, clientRequestId: '' })).rejects.toThrow('clientRequestId is required');
  });

  it('should return idempotent result for duplicate request', async () => {
    const duplicateResult = { reversalId: 'existing-reversal', originalTenderId: 'tender-1', orderId: 'order-1', amount: 1500 };
    mocks.state.idempotencyResult = { isDuplicate: true, originalResult: duplicateResult };

    const ctx = createCtx();
    const result = await reverseTender(ctx, 'tender-1', baseInput);
    expect(result).toEqual(duplicateResult);
  });

  it('should throw when tender is not found', async () => {
    mocks.state.tender = null;
    const ctx = createCtx();
    await expect(reverseTender(ctx, 'tender-999', baseInput)).rejects.toThrow('not found');
  });

  it('should throw when tender is not in captured status', async () => {
    mocks.state.tender = { ...mocks.state.tender, status: 'voided' };
    const ctx = createCtx();
    await expect(reverseTender(ctx, 'tender-1', baseInput)).rejects.toThrow("expected 'captured'");
  });

  it('should throw when tender has already been reversed', async () => {
    mocks.state.existingReversals = [{ id: 'rev-existing', originalTenderId: 'tender-1' }];
    const ctx = createCtx();
    await expect(reverseTender(ctx, 'tender-1', baseInput)).rejects.toThrow('already been reversed');
  });

  it('should throw when reversal amount exceeds tender amount', async () => {
    const ctx = createCtx();
    await expect(reverseTender(ctx, 'tender-1', { ...baseInput, amount: 2000 })).rejects.toThrow('cannot exceed tender amount');
  });

  it('should successfully reverse a tender (full reversal)', async () => {
    mocks.state.allReversalsForOrder = [{ originalTenderId: 'tender-1', amount: 1500 }];

    const ctx = createCtx();
    const result = await reverseTender(ctx, 'tender-1', baseInput);

    expect(result).toBeDefined();
    expect(result.reversalId).toBe('reversal-1');
    expect(result.originalTenderId).toBe('tender-1');
    expect(result.amount).toBe(1500);
    expect(result.reversalType).toBe('void');
  });

  it('should create GL reversal when original journal exists', async () => {
    mocks.state.originalJournals = [{
      id: 'pje-1',
      entries: [
        { accountCode: '1010', accountName: 'Cash on Hand', debit: 1500, credit: 0 },
        { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 1350 },
        { accountCode: '2100', accountName: 'Sales Tax Payable', debit: 0, credit: 150 },
      ],
      postingStatus: 'posted',
    }];

    const ctx = createCtx();
    const result = await reverseTender(ctx, 'tender-1', baseInput);
    expect(result).toBeDefined();
  });

  it('should handle partial reversal with prorated GL entries', async () => {
    mocks.state.tender = { ...mocks.state.tender, amount: 2000 };
    mocks.state.originalJournals = [{
      id: 'pje-1',
      entries: [
        { accountCode: '1010', accountName: 'Cash on Hand', debit: 2000, credit: 0 },
        { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 1800 },
        { accountCode: '2100', accountName: 'Sales Tax Payable', debit: 0, credit: 200 },
      ],
      postingStatus: 'posted',
    }];

    const ctx = createCtx();
    const result = await reverseTender(ctx, 'tender-1', { ...baseInput, amount: 1000 });
    expect(result.amount).toBe(1000);
  });

  it('should default refundMethod to cash for cash tenders', async () => {
    const ctx = createCtx();
    const result = await reverseTender(ctx, 'tender-1', baseInput);
    expect(result.refundMethod).toBe('cash');
  });

  it('should call auditLog after successful reversal', async () => {
    const ctx = createCtx();
    await reverseTender(ctx, 'tender-1', baseInput);
    expect(mocks.auditLog).toHaveBeenCalledWith(ctx, 'tender.reversed', 'tender', 'tender-1');
  });

  it('should emit tender.reversed.v1 event', async () => {
    const ctx = createCtx();
    await reverseTender(ctx, 'tender-1', baseInput);
    expect(mocks.buildEventFromContext).toHaveBeenCalledWith(
      ctx, 'tender.reversed.v1',
      expect.objectContaining({ originalTenderId: 'tender-1', amount: 1500, reversalType: 'void' }),
    );
  });
});
