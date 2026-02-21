import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const state = {
    tender: {
      id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1',
      orderId: 'order-1', tenderType: 'cash', amount: 2000, tipAmount: 200,
      status: 'captured', businessDate: '2026-01-15',
    } as any,
    existingReversals: [] as any[],
    idempotencyResult: { isDuplicate: false, originalResult: null } as any,
  };

  const publishWithOutbox = vi.fn();
  const buildEventFromContext = vi.fn();
  const auditLog = vi.fn();
  const checkIdempotency = vi.fn();
  const saveIdempotencyKey = vi.fn();
  const incrementVersion = vi.fn();
  const getDebitAccountForTenderType = vi.fn();

  return { state, publishWithOutbox, buildEventFromContext, auditLog, checkIdempotency, saveIdempotencyKey, incrementVersion, getDebitAccountForTenderType };
});

// ── vi.mock declarations ───────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  tenders: { tenantId: 'tenant_id', id: 'id' },
  tenderReversals: { tenantId: 'tenant_id', originalTenderId: 'original_tender_id' },
  paymentJournalEntries: {},
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
vi.mock('../helpers/account-mapping', () => ({ getDebitAccountForTenderType: mocks.getDebitAccountForTenderType }));

vi.mock('@oppsera/shared', () => ({
  AppError: class extends Error {
    code: string; statusCode: number;
    constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.statusCode = status; }
  },
  ValidationError: class extends Error {
    code = 'VALIDATION_ERROR'; statusCode = 400; details: any[];
    constructor(message: string, details: any[] = []) { super(message); this.details = details; }
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
      return Promise.resolve([]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
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
  clientRequestId: 'tip-001',
  tenderId: 'tender-1',
  newTipAmount: 500,
};

import { adjustTip } from '../commands/adjust-tip';

describe('adjustTip', () => {
  beforeEach(() => {
    mocks.publishWithOutbox.mockReset();
    mocks.buildEventFromContext.mockReset();
    mocks.auditLog.mockReset();
    mocks.checkIdempotency.mockReset();
    mocks.saveIdempotencyKey.mockReset();
    mocks.incrementVersion.mockReset();
    mocks.getDebitAccountForTenderType.mockReset();

    // Reset state
    mocks.state.tender = {
      id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1',
      orderId: 'order-1', tenderType: 'cash', amount: 2000, tipAmount: 200,
      status: 'captured', businessDate: '2026-01-15',
    };
    mocks.state.existingReversals = [];
    mocks.state.idempotencyResult = { isDuplicate: false, originalResult: null };

    // Setup implementations
    mocks.publishWithOutbox.mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
    mocks.buildEventFromContext.mockReturnValue({ eventId: 'evt-1', eventType: 'tender.tip_adjusted.v1', data: {} });
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.checkIdempotency.mockImplementation(async () => mocks.state.idempotencyResult);
    mocks.saveIdempotencyKey.mockResolvedValue(undefined);
    mocks.incrementVersion.mockResolvedValue(undefined);
    mocks.getDebitAccountForTenderType.mockImplementation((type: string) => {
      if (type === 'cash') return { code: '1010', name: 'Cash on Hand' };
      if (type === 'card') return { code: '1020', name: 'Undeposited Funds' };
      return { code: '1090', name: 'Other Payment Received' };
    });
  });

  it('should throw when locationId is missing', async () => {
    const ctx = createCtx({ locationId: undefined });
    await expect(adjustTip(ctx, 'tender-1', baseInput)).rejects.toThrow('X-Location-Id header is required');
  });

  it('should throw when clientRequestId is missing', async () => {
    const ctx = createCtx();
    await expect(adjustTip(ctx, 'tender-1', { ...baseInput, clientRequestId: '' })).rejects.toThrow('clientRequestId is required');
  });

  it('should return idempotent result for duplicate request', async () => {
    const duplicateResult = { tenderId: 'tender-1', previousTipAmount: 200, newTipAmount: 500, delta: 300 };
    mocks.state.idempotencyResult = { isDuplicate: true, originalResult: duplicateResult };

    const ctx = createCtx();
    const result = await adjustTip(ctx, 'tender-1', baseInput);
    expect(result).toEqual(duplicateResult);
  });

  it('should throw when tender is not found', async () => {
    mocks.state.tender = null;
    const ctx = createCtx();
    await expect(adjustTip(ctx, 'tender-999', baseInput)).rejects.toThrow('not found');
  });

  it('should throw when tender is not in captured status', async () => {
    mocks.state.tender = { ...mocks.state.tender, status: 'voided' };
    const ctx = createCtx();
    await expect(adjustTip(ctx, 'tender-1', baseInput)).rejects.toThrow("expected 'captured'");
  });

  it('should throw when tender has been reversed', async () => {
    mocks.state.existingReversals = [{ id: 'rev-1', originalTenderId: 'tender-1' }];
    const ctx = createCtx();
    await expect(adjustTip(ctx, 'tender-1', baseInput)).rejects.toThrow('Cannot adjust tip on a reversed tender');
  });

  it('should return no-change result when tip amount is unchanged', async () => {
    const ctx = createCtx();
    const result = await adjustTip(ctx, 'tender-1', { ...baseInput, newTipAmount: 200 });

    expect(result.delta).toBe(0);
    expect(result.previousTipAmount).toBe(200);
    expect(result.newTipAmount).toBe(200);
  });

  it('should increase tip successfully', async () => {
    const ctx = createCtx();
    const result = await adjustTip(ctx, 'tender-1', { ...baseInput, newTipAmount: 500 });

    expect(result.previousTipAmount).toBe(200);
    expect(result.newTipAmount).toBe(500);
    expect(result.delta).toBe(300);
    expect(result.orderId).toBe('order-1');
  });

  it('should decrease tip successfully', async () => {
    const ctx = createCtx();
    const result = await adjustTip(ctx, 'tender-1', { ...baseInput, newTipAmount: 50 });

    expect(result.previousTipAmount).toBe(200);
    expect(result.newTipAmount).toBe(50);
    expect(result.delta).toBe(-150);
  });

  it('should remove tip entirely (set to zero)', async () => {
    const ctx = createCtx();
    const result = await adjustTip(ctx, 'tender-1', { ...baseInput, newTipAmount: 0 });

    expect(result.previousTipAmount).toBe(200);
    expect(result.newTipAmount).toBe(0);
    expect(result.delta).toBe(-200);
  });

  it('should emit tender.tip_adjusted.v1 event for non-zero delta', async () => {
    const ctx = createCtx();
    await adjustTip(ctx, 'tender-1', baseInput);

    expect(mocks.buildEventFromContext).toHaveBeenCalledWith(
      ctx, 'tender.tip_adjusted.v1',
      expect.objectContaining({ tenderId: 'tender-1', orderId: 'order-1', previousTipAmount: 200, newTipAmount: 500, delta: 300 }),
    );
  });

  it('should not emit event when delta is zero', async () => {
    const ctx = createCtx();
    await adjustTip(ctx, 'tender-1', { ...baseInput, newTipAmount: 200 });

    // delta=0 returns early with empty events array
    expect(mocks.buildEventFromContext).not.toHaveBeenCalled();
  });

  it('should call auditLog after successful adjustment', async () => {
    const ctx = createCtx();
    await adjustTip(ctx, 'tender-1', baseInput);
    expect(mocks.auditLog).toHaveBeenCalledWith(ctx, 'tender.tip_adjusted', 'tender', 'tender-1');
  });
});
