import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const dbExecute = vi.fn();
  const dbSelect = vi.fn();
  const voidJournalEntry = vi.fn();
  const handleTenderForAccounting = vi.fn();
  const handleTenderReversalForAccounting = vi.fn();
  const getReversalForGlRepost = vi.fn();
  const getTenderForGlRepost = vi.fn();
  const auditLogDeferred = vi.fn();
  const generateUlid = vi.fn(() => 'ulid-test');

  return {
    dbExecute,
    dbSelect,
    voidJournalEntry,
    handleTenderForAccounting,
    handleTenderReversalForAccounting,
    getReversalForGlRepost,
    getTenderForGlRepost,
    auditLogDeferred,
    generateUlid,
  };
});

vi.mock('@oppsera/db', () => ({
  db: {
    select: mocks.dbSelect,
    execute: mocks.dbExecute,
  },
  glJournalEntries: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceReferenceId: 'source_reference_id',
    status: 'status',
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(vi.fn((...args: unknown[]) => ({ _sql: args })), {
    raw: vi.fn((s: string) => s),
    join: vi.fn(),
  }),
  eq: vi.fn((_a: unknown, _b: unknown) => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('../commands/void-journal-entry', () => ({
  voidJournalEntry: mocks.voidJournalEntry,
}));

vi.mock('../adapters/pos-posting-adapter', () => ({
  handleTenderForAccounting: mocks.handleTenderForAccounting,
}));

vi.mock('../adapters/tender-reversal-posting-adapter', () => ({
  handleTenderReversalForAccounting: mocks.handleTenderReversalForAccounting,
}));

vi.mock('@oppsera/core/helpers/reconciliation-read-api', () => ({
  getReconciliationReadApi: () => ({
    getTenderForGlRepost: mocks.getTenderForGlRepost,
    getReversalForGlRepost: mocks.getReversalForGlRepost,
  }),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLogDeferred: mocks.auditLogDeferred,
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: mocks.generateUlid,
}));

import { remapGlForTender } from '../commands/remap-gl-for-tender';
import type { RequestContext } from '@oppsera/core/auth/context';

function createCtx(): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
  } as unknown as RequestContext;
}

const baseTenderData = {
  tenderId: 'tender-1',
  orderId: 'order-1',
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  tenderType: 'cash',
  paymentMethod: 'cash',
  amount: 1000,
  tipAmount: 0,
  customerId: null,
  terminalId: null,
  tenderSequence: 1,
  isFullyPaid: true,
  orderTotal: 1000,
  subtotal: 900,
  taxTotal: 100,
  discountTotal: 0,
  serviceChargeTotal: 0,
  totalTendered: 1000,
  businessDate: '2026-01-15',
  lines: [],
};

/**
 * Configure mocks.dbSelect to return different rows on successive calls.
 * call 1: original GL entry select (before void)
 * call 2: new GL entry select (after posting)
 */
function setupDbSelect(firstCallRows: unknown[], secondCallRows: unknown[]) {
  let callCount = 0;
  mocks.dbSelect.mockImplementation(() => {
    callCount++;
    const rows = callCount === 1 ? firstCallRows : secondCallRows;
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
  });
}

describe('remapGlForTender — reversal_no_original resolve gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenderForGlRepost.mockResolvedValue(baseTenderData);
    mocks.handleTenderForAccounting.mockResolvedValue(undefined);
  });

  it('should resolve reversal_no_original event when getReversalForGlRepost returns data and handleTenderReversalForAccounting succeeds', async () => {
    const reversalData = {
      reversalId: 'reversal-1',
      originalTenderId: 'tender-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      amount: 1000,
      reason: 'customer_request',
      reversalType: 'refund',
      refundMethod: 'cash',
      businessDate: '2026-01-15',
    };

    // No original GL entry; new entry appears after posting
    setupDbSelect([], [{ id: 'je-new-1' }]);

    // pendingReversals SELECT returns one row; resolve reversal UPDATE; final resolve UPDATE
    mocks.dbExecute
      .mockResolvedValueOnce([{ id: 'unmapped-1', reversal_id: 'reversal-1' }])
      .mockResolvedValueOnce(undefined)     // resolve reversal UPDATE (resolved_at = NOW())
      .mockResolvedValueOnce({ count: 0 }); // final resolve UPDATE

    mocks.getReversalForGlRepost.mockResolvedValue(reversalData);
    mocks.handleTenderReversalForAccounting.mockResolvedValue(undefined);

    const result = await remapGlForTender(createCtx(), 'tender-1');

    expect(result.success).toBe(true);
    expect(mocks.getReversalForGlRepost).toHaveBeenCalledWith('tenant-1', 'reversal-1');
    expect(mocks.handleTenderReversalForAccounting).toHaveBeenCalledOnce();
    // 3 execute calls: pendingReversals SELECT + resolve reversal UPDATE + final resolve UPDATE
    expect(mocks.dbExecute).toHaveBeenCalledTimes(3);
    // Second call is the resolve UPDATE — verify it sets resolved_at
    const resolveCall = JSON.stringify(mocks.dbExecute.mock.calls[1]![0]);
    expect(resolveCall).toContain('resolved_at');
  });

  it('should leave reversal_no_original unresolved when getReversalForGlRepost returns null', async () => {
    // No original GL entry, no new entry either
    setupDbSelect([], []);

    // pendingReversals SELECT returns one row; update-reason UPDATE; final resolve UPDATE
    mocks.dbExecute
      .mockResolvedValueOnce([{ id: 'unmapped-1', reversal_id: 'reversal-1' }])
      .mockResolvedValueOnce(undefined)     // update reason (leave unresolved — no resolved_at)
      .mockResolvedValueOnce({ count: 0 }); // final resolve UPDATE

    mocks.getReversalForGlRepost.mockResolvedValue(null); // reversal record not found

    const result = await remapGlForTender(createCtx(), 'tender-1');

    expect(result.success).toBe(true);
    expect(mocks.getReversalForGlRepost).toHaveBeenCalledWith('tenant-1', 'reversal-1');
    // handleTenderReversalForAccounting should NOT have been called
    expect(mocks.handleTenderReversalForAccounting).not.toHaveBeenCalled();
    // The second execute call updates reason but does NOT set resolved_at
    const updateCall = JSON.stringify(mocks.dbExecute.mock.calls[1]![0]);
    expect(updateCall).toContain('reason');
    expect(updateCall).not.toContain('resolved_at');
  });

  it('should leave reversal_no_original unresolved when handleTenderReversalForAccounting throws', async () => {
    const reversalData = {
      reversalId: 'reversal-1',
      originalTenderId: 'tender-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      amount: 1000,
      reason: 'customer_request',
      reversalType: 'refund',
      refundMethod: 'cash',
      businessDate: '2026-01-15',
    };

    // No original GL entry, no new entry
    setupDbSelect([], []);

    // pendingReversals SELECT returns one row; final resolve UPDATE only (no reversal resolve)
    mocks.dbExecute
      .mockResolvedValueOnce([{ id: 'unmapped-1', reversal_id: 'reversal-1' }])
      .mockResolvedValueOnce({ count: 0 }); // final resolve UPDATE

    mocks.getReversalForGlRepost.mockResolvedValue(reversalData);
    mocks.handleTenderReversalForAccounting.mockRejectedValue(new Error('GL adapter failure'));

    const result = await remapGlForTender(createCtx(), 'tender-1');

    // The overall remap should still succeed — reversal errors are non-fatal
    expect(result.success).toBe(true);
    expect(mocks.handleTenderReversalForAccounting).toHaveBeenCalledOnce();
    // Only 2 execute calls: pendingReversals SELECT + final resolve UPDATE
    // No individual resolve UPDATE for the failed reversal row
    expect(mocks.dbExecute).toHaveBeenCalledTimes(2);
    // The only resolve UPDATE is the final bulk one (not the per-reversal one)
    const finalCall = JSON.stringify(mocks.dbExecute.mock.calls[1]![0]);
    expect(finalCall).toContain('resolved_at');
  });
});
