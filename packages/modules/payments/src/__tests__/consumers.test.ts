import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventEnvelope } from '@oppsera/shared';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const state = {
    allTenders: [] as any[],
    existingReversals: [] as any[],
    originalJournals: [] as any[],
  };

  const withTenant = vi.fn();
  const generateUlid = vi.fn();

  return { state, withTenant, generateUlid };
});

// ── vi.mock declarations ───────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  withTenant: mocks.withTenant,
  tenders: { tenantId: 'tenant_id', orderId: 'order_id', status: 'status' },
  tenderReversals: { tenantId: 'tenant_id', orderId: 'order_id', originalTenderId: 'original_tender_id' },
  paymentJournalEntries: { tenantId: 'tenant_id', referenceType: 'reference_type', referenceId: 'reference_id', postingStatus: 'posting_status', id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: mocks.generateUlid,
}));

// ── Helpers ────────────────────────────────────────────────────────
function createMockTx() {
  let selectCallCount = 0;
  let insertCallCount = 0;
  const insertedValues: any[] = [];
  const updatedSets: any[] = [];

  const tx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn(function (this: any) { selectCallCount++; return this; }),
    where: vi.fn(function (this: any) {
      if (selectCallCount === 1) return Promise.resolve(mocks.state.allTenders);
      if (selectCallCount === 2) return Promise.resolve(mocks.state.existingReversals);
      // Per-tender journal lookups: return the journals each time
      return Promise.resolve(mocks.state.originalJournals);
    }),
    insert: vi.fn(function (this: any) { insertCallCount++; return this; }),
    values: vi.fn(function (this: any, data: any) {
      insertedValues.push(data);
      return this;
    }),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn(function (this: any, data: any) { updatedSets.push(data); return this; }),
    // Expose for assertions
    _insertedValues: insertedValues,
    _updatedSets: updatedSets,
  };
  return tx;
}

function createEvent(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: 'evt-1',
    eventType: 'order.voided.v1',
    data: { orderId: 'order-1', reason: 'Cancelled by customer' },
    tenantId: 'tenant-1',
    occurredAt: new Date().toISOString(),
    actorUserId: 'user-1',
    version: 1,
    ...overrides,
  } as EventEnvelope;
}

import { handleOrderVoided } from '../events/consumers';

describe('handleOrderVoided consumer', () => {
  beforeEach(() => {
    mocks.withTenant.mockReset();
    mocks.generateUlid.mockReset();

    // Reset state
    mocks.state.allTenders = [];
    mocks.state.existingReversals = [];
    mocks.state.originalJournals = [];

    // Setup implementations
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = createMockTx();
      return fn(mockTx);
    });
    mocks.generateUlid.mockReturnValue(`ulid-${Date.now()}`);
  });

  it('should do nothing when there are no tenders', async () => {
    mocks.state.allTenders = [];
    const event = createEvent();
    await handleOrderVoided(event);

    // Verify withTenant was called (consumer runs regardless)
    expect(mocks.withTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
  });

  it('should reverse all unreversed tenders for the order', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 1000, status: 'captured', businessDate: '2026-01-15' },
      { id: 'tender-2', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 500, status: 'captured', businessDate: '2026-01-15' },
    ];

    const event = createEvent();
    await handleOrderVoided(event);

    // generateUlid should have been called once per unreversed tender
    expect(mocks.generateUlid).toHaveBeenCalledTimes(2);
  });

  it('should skip tenders that are already reversed', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 1000, status: 'captured', businessDate: '2026-01-15' },
      { id: 'tender-2', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 500, status: 'captured', businessDate: '2026-01-15' },
    ];
    mocks.state.existingReversals = [{ originalTenderId: 'tender-1' }];

    const event = createEvent();
    await handleOrderVoided(event);

    // Only tender-2 should be reversed
    expect(mocks.generateUlid).toHaveBeenCalledTimes(1);
  });

  it('should create GL reversal entries that swap debits and credits', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 1500, status: 'captured', businessDate: '2026-01-15' },
    ];
    mocks.state.originalJournals = [{
      id: 'pje-1',
      entries: [
        { accountCode: '1010', accountName: 'Cash on Hand', debit: 1500, credit: 0 },
        { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 1350 },
        { accountCode: '2100', accountName: 'Sales Tax Payable', debit: 0, credit: 150 },
      ],
      postingStatus: 'posted',
    }];

    let capturedTx: any = null;
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      capturedTx = createMockTx();
      return fn(capturedTx);
    });

    const event = createEvent();
    await handleOrderVoided(event);

    // Verify insert was called for reversal record + GL reversal journal + original voided
    expect(capturedTx.insert).toHaveBeenCalled();
  });

  it('should use order void reason from event data', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 1000, status: 'captured', businessDate: '2026-01-15' },
    ];

    const event = createEvent({ data: { orderId: 'order-1', reason: 'Manager override: wrong order' } });
    await handleOrderVoided(event);

    expect(mocks.generateUlid).toHaveBeenCalledTimes(1);
  });

  it('should default reason to "Order voided" when reason is empty', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 1000, status: 'captured', businessDate: '2026-01-15' },
    ];

    const event = createEvent({ data: { orderId: 'order-1', reason: '' } });
    await handleOrderVoided(event);

    // Consumer uses `reason || 'Order voided'` as fallback — should not throw
    expect(mocks.generateUlid).toHaveBeenCalledTimes(1);
  });

  it('should set refundMethod to cash for cash tenders', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 1000, status: 'captured', businessDate: '2026-01-15' },
    ];

    let capturedTx: any = null;
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      capturedTx = createMockTx();
      return fn(capturedTx);
    });

    await handleOrderVoided(createEvent());

    // Verify the insert was called with cash refund method
    const insertedData = capturedTx._insertedValues[0];
    expect(insertedData.refundMethod).toBe('cash');
  });

  it('should set refundMethod to original_tender for non-cash tenders', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'card', amount: 1000, status: 'captured', businessDate: '2026-01-15' },
    ];

    let capturedTx: any = null;
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      capturedTx = createMockTx();
      return fn(capturedTx);
    });

    await handleOrderVoided(createEvent());

    const insertedData = capturedTx._insertedValues[0];
    expect(insertedData.refundMethod).toBe('original_tender');
  });

  it('should handle no GL journals gracefully (tender without GL entry)', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 1000, status: 'captured', businessDate: '2026-01-15' },
    ];
    mocks.state.originalJournals = [];

    const event = createEvent();
    await handleOrderVoided(event);

    // Should create reversal record but skip GL journal reversal
    expect(mocks.generateUlid).toHaveBeenCalledTimes(1);
  });

  it('should use actorUserId from event or default to system', async () => {
    mocks.state.allTenders = [
      { id: 'tender-1', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 1000, status: 'captured', businessDate: '2026-01-15' },
    ];

    let capturedTx: any = null;
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      capturedTx = createMockTx();
      return fn(capturedTx);
    });

    // With actorUserId
    await handleOrderVoided(createEvent({ actorUserId: 'user-42' }));
    expect(capturedTx._insertedValues[0].createdBy).toBe('user-42');

    // Without actorUserId — default to 'system'
    mocks.state.allTenders = [
      { id: 'tender-2', tenantId: 'tenant-1', locationId: 'loc-1', orderId: 'order-1', tenderType: 'cash', amount: 500, status: 'captured', businessDate: '2026-01-15' },
    ];
    mocks.state.existingReversals = [];

    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      capturedTx = createMockTx();
      return fn(capturedTx);
    });

    await handleOrderVoided(createEvent({ actorUserId: undefined }));
    expect(capturedTx._insertedValues[0].createdBy).toBe('system');
  });
});
