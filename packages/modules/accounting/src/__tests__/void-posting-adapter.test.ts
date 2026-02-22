import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const getAccountingSettings = vi.fn();
  const voidJournalEntry = vi.fn();
  const logUnmappedEvent = vi.fn();

  // Mutable result that the DB query chain will resolve to
  let _queryResult: any[] = [];

  const db = {
    select: vi.fn(),
  };

  function setupDbChain() {
    db.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(_queryResult)),
      })),
    }));
  }

  function setQueryResult(val: any[]) {
    _queryResult = val;
  }

  return {
    getAccountingSettings,
    voidJournalEntry,
    logUnmappedEvent,
    db,
    setupDbChain,
    setQueryResult,
  };
});

vi.mock('@oppsera/db', () => ({
  db: mocks.db,
  glJournalEntries: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceModule: 'source_module',
    status: 'status',
    memo: 'memo',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: string, b: string) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
}));

vi.mock('../helpers/get-accounting-settings', () => ({
  getAccountingSettings: mocks.getAccountingSettings,
}));

vi.mock('../commands/void-journal-entry', () => ({
  voidJournalEntry: mocks.voidJournalEntry,
}));

vi.mock('../helpers/resolve-mapping', () => ({
  logUnmappedEvent: mocks.logUnmappedEvent,
}));

import { handleOrderVoidForAccounting } from '../adapters/void-posting-adapter';
import type { EventEnvelope } from '@oppsera/shared';

function createVoidEvent(dataOverrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: 'evt-void-1',
    eventType: 'order.voided.v1',
    tenantId: 'tenant-1',
    occurredAt: new Date().toISOString(),
    data: {
      orderId: 'order-1',
      reason: 'Customer requested void',
      locationId: 'loc-1',
      businessDate: '2025-01-15',
      total: 5000,
      ...dataOverrides,
    },
    actorUserId: 'user-1',
    version: 1,
  } as unknown as EventEnvelope;
}

const defaultSettings = {
  tenantId: 'tenant-1',
  baseCurrency: 'USD',
  enableLegacyGlPosting: false,
  enableCogsPosting: false,
  defaultTipsPayableAccountId: null,
  defaultServiceChargeRevenueAccountId: null,
  enableUndepositedFundsWorkflow: false,
};

describe('handleOrderVoidForAccounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup db chain after clearing
    mocks.setupDbChain();
    // Default: settings exist
    mocks.getAccountingSettings.mockResolvedValue(defaultSettings);
    // Default: no GL entries found
    mocks.setQueryResult([]);
  });

  // ── Skip scenarios ────────────────────────────────────────────────

  it('should skip when no accounting settings', async () => {
    mocks.getAccountingSettings.mockResolvedValue(null);

    await handleOrderVoidForAccounting(createVoidEvent());

    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.voidJournalEntry).not.toHaveBeenCalled();
  });

  it('should skip when no posted GL entries found for order', async () => {
    mocks.setQueryResult([]);

    await handleOrderVoidForAccounting(createVoidEvent());

    expect(mocks.db.select).toHaveBeenCalled();
    expect(mocks.voidJournalEntry).not.toHaveBeenCalled();
  });

  // ── Single tender void ────────────────────────────────────────────

  it('should void single GL entry for a single-tender order', async () => {
    mocks.setQueryResult([{ id: 'je-1' }]);
    mocks.voidJournalEntry.mockResolvedValue({});

    await handleOrderVoidForAccounting(createVoidEvent());

    expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(1);
    expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        requestId: 'pos-void-gl-order-1',
      }),
      'je-1',
      'Order voided: Customer requested void',
    );
  });

  // ── Multi-tender void ─────────────────────────────────────────────

  it('should void all GL entries for a multi-tender (split) order', async () => {
    mocks.setQueryResult([
      { id: 'je-1' },
      { id: 'je-2' },
      { id: 'je-3' },
    ]);
    mocks.voidJournalEntry.mockResolvedValue({});

    await handleOrderVoidForAccounting(createVoidEvent());

    expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(3);
    expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      'je-1',
      'Order voided: Customer requested void',
    );
    expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      'je-2',
      'Order voided: Customer requested void',
    );
    expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      'je-3',
      'Order voided: Customer requested void',
    );
  });

  // ── Idempotency ───────────────────────────────────────────────────

  it('should be idempotent (already-voided entries not returned by query)', async () => {
    // First call: entries found
    mocks.setQueryResult([{ id: 'je-1' }]);
    mocks.voidJournalEntry.mockResolvedValue({});
    await handleOrderVoidForAccounting(createVoidEvent());
    expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(1);

    // Second call: entries already voided, not returned by status='posted' filter
    mocks.setQueryResult([]);
    await handleOrderVoidForAccounting(createVoidEvent());
    expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(1); // still just 1
  });

  // ── Synthetic context ─────────────────────────────────────────────

  it('should pass synthetic system context to voidJournalEntry', async () => {
    mocks.setQueryResult([{ id: 'je-1' }]);
    mocks.voidJournalEntry.mockResolvedValue({});

    await handleOrderVoidForAccounting(createVoidEvent());

    const ctx = mocks.voidJournalEntry.mock.calls[0]![0];
    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.locationId).toBe('loc-1');
    expect(ctx.user.id).toBe('system');
    expect(ctx.user.email).toBe('system@oppsera.io');
    expect(ctx.requestId).toBe('pos-void-gl-order-1');
    expect(ctx.isPlatformAdmin).toBe(false);
  });

  // ── Void reason propagation ───────────────────────────────────────

  it('should pass void reason to voidJournalEntry', async () => {
    mocks.setQueryResult([{ id: 'je-1' }]);
    mocks.voidJournalEntry.mockResolvedValue({});

    await handleOrderVoidForAccounting(
      createVoidEvent({ reason: 'Duplicate order' }),
    );

    expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      'je-1',
      'Order voided: Duplicate order',
    );
  });

  it('should handle missing reason gracefully', async () => {
    mocks.setQueryResult([{ id: 'je-1' }]);
    mocks.voidJournalEntry.mockResolvedValue({});

    await handleOrderVoidForAccounting(
      createVoidEvent({ reason: '' }),
    );

    expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      'je-1',
      'Order voided: No reason provided',
    );
  });

  // ── Error handling ────────────────────────────────────────────────

  it('should never throw — logs error when voidJournalEntry fails', async () => {
    mocks.setQueryResult([{ id: 'je-1' }]);
    mocks.voidJournalEntry.mockRejectedValue(new Error('DB connection lost'));
    mocks.logUnmappedEvent.mockResolvedValue(undefined);

    await expect(
      handleOrderVoidForAccounting(createVoidEvent()),
    ).resolves.toBeUndefined();

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        eventType: 'order.voided.v1',
        sourceModule: 'pos',
        entityType: 'void_gl_error',
        entityId: 'je-1',
        reason: 'GL void failed: DB connection lost',
      }),
    );
  });

  it('should continue voiding other entries when one fails', async () => {
    mocks.setQueryResult([
      { id: 'je-1' },
      { id: 'je-2' },
      { id: 'je-3' },
    ]);
    mocks.voidJournalEntry
      .mockResolvedValueOnce({})                  // je-1: success
      .mockRejectedValueOnce(new Error('fail'))   // je-2: fail
      .mockResolvedValueOnce({});                  // je-3: success
    mocks.logUnmappedEvent.mockResolvedValue(undefined);

    await handleOrderVoidForAccounting(createVoidEvent());

    expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(3);
    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        entityId: 'je-2',
        entityType: 'void_gl_error',
      }),
    );
  });

  it('should never throw even when DB query fails', async () => {
    mocks.db.select.mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.reject(new Error('Connection timeout'))),
      })),
    }));
    mocks.logUnmappedEvent.mockResolvedValue(undefined);

    await expect(
      handleOrderVoidForAccounting(createVoidEvent()),
    ).resolves.toBeUndefined();

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        entityType: 'void_processing_error',
        reason: expect.stringContaining('Connection timeout'),
      }),
    );
  });

  it('should never throw even when logUnmappedEvent fails', async () => {
    mocks.db.select.mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.reject(new Error('Query failed'))),
      })),
    }));
    mocks.logUnmappedEvent.mockRejectedValue(new Error('Log failed too'));

    // Double failure — should still not throw
    await expect(
      handleOrderVoidForAccounting(createVoidEvent()),
    ).resolves.toBeUndefined();
  });
});
