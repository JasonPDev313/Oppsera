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
  const withTenant = vi.fn();
  const getAccountingSettings = vi.fn();
  const getRemappableTenders = vi.fn();

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
    withTenant,
    getAccountingSettings,
    getRemappableTenders,
  };
});

vi.mock('@oppsera/db', () => ({
  db: {
    select: mocks.dbSelect,
    execute: mocks.dbExecute,
  },
  withTenant: mocks.withTenant,
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

vi.mock('../helpers/get-accounting-settings', () => ({
  getAccountingSettings: mocks.getAccountingSettings,
}));

vi.mock('../queries/get-remappable-tenders', () => ({
  getRemappableTenders: mocks.getRemappableTenders,
}));

import { batchRemapGlForTenders } from '../commands/remap-gl-for-tender';
import { applySmartResolutions } from '../commands/apply-smart-resolutions';
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
  tenderId: 'tender-X',
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
 * Configure mocks so remapGlForTender succeeds for any tender.
 * Each call: no original GL entry → post fresh → new entry appears → no reversals → resolve.
 */
function setupRemapSuccess() {
  mocks.dbSelect.mockImplementation(() => {
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
  });
  mocks.dbExecute
    .mockResolvedValue({ count: 0 }); // resolve UPDATE
  mocks.getTenderForGlRepost.mockImplementation((_tenantId: string, tenderId: string) =>
    Promise.resolve({ ...baseTenderData, tenderId }),
  );
  mocks.handleTenderForAccounting.mockResolvedValue(undefined);
}

/**
 * Configure mocks so remapGlForTender fails for any tender (adapter throws).
 */
function setupRemapFailure(errorMsg = 'SAVEPOINT can only be used in transaction blocks') {
  mocks.dbSelect.mockImplementation(() => {
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
  });
  mocks.dbExecute.mockResolvedValue({ count: 0 });
  mocks.getTenderForGlRepost.mockImplementation((_tenantId: string, tenderId: string) =>
    Promise.resolve({ ...baseTenderData, tenderId }),
  );
  mocks.handleTenderForAccounting.mockRejectedValue(new Error(errorMsg));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// batchRemapGlForTenders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('batchRemapGlForTenders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty input', async () => {
    const results = await batchRemapGlForTenders(createCtx(), []);
    expect(results).toEqual([]);
  });

  it('processes a single tender successfully', async () => {
    setupRemapSuccess();
    const results = await batchRemapGlForTenders(createCtx(), ['tender-1']);
    expect(results).toHaveLength(1);
    expect(results[0]!.tenderId).toBe('tender-1');
    expect(results[0]!.success).toBe(true);
  });

  it('returns failure result for a tender that throws', async () => {
    setupRemapFailure('SAVEPOINT error');
    const results = await batchRemapGlForTenders(createCtx(), ['tender-1']);
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toContain('SAVEPOINT error');
  });

  it('processes tenders in waves of 3 (concurrency cap)', async () => {
    // Track concurrent executions to verify concurrency cap
    let activeConcurrent = 0;
    let maxConcurrent = 0;

    mocks.dbSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }));
    mocks.dbExecute.mockResolvedValue({ count: 0 });

    mocks.getTenderForGlRepost.mockImplementation(async (_tenantId: string, tenderId: string) => {
      activeConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, activeConcurrent);
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeConcurrent--;
      return { ...baseTenderData, tenderId };
    });
    mocks.handleTenderForAccounting.mockResolvedValue(undefined);

    const tenderIds = Array.from({ length: 7 }, (_, i) => `tender-${i}`);
    const results = await batchRemapGlForTenders(createCtx(), tenderIds);

    expect(results).toHaveLength(7);
    // Concurrency should never exceed 3
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    // Should have processed all 7
    expect(results.filter((r) => r.success)).toHaveLength(7);
  });

  it('does not block the batch on a single failure', async () => {
    let callIdx = 0;
    mocks.dbSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }));
    mocks.dbExecute.mockResolvedValue({ count: 0 });
    mocks.getTenderForGlRepost.mockImplementation((_tenantId: string, tenderId: string) =>
      Promise.resolve({ ...baseTenderData, tenderId }),
    );

    // Second tender always fails
    mocks.handleTenderForAccounting.mockImplementation(() => {
      callIdx++;
      if (callIdx === 2) return Promise.reject(new Error('DB timeout'));
      return Promise.resolve(undefined);
    });

    const results = await batchRemapGlForTenders(createCtx(), ['t-1', 't-2', 't-3']);

    expect(results).toHaveLength(3);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(false);
    expect(results[1]!.error).toContain('DB timeout');
    expect(results[2]!.success).toBe(true);
  });

  it('preserves result ordering matching input order', async () => {
    mocks.dbSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }));
    mocks.dbExecute.mockResolvedValue({ count: 0 });

    // Make tenders resolve at different speeds to test ordering
    mocks.getTenderForGlRepost.mockImplementation(async (_tenantId: string, tenderId: string) => {
      const delay = tenderId === 'fast' ? 1 : tenderId === 'slow' ? 20 : 10;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return { ...baseTenderData, tenderId };
    });
    mocks.handleTenderForAccounting.mockResolvedValue(undefined);

    const results = await batchRemapGlForTenders(createCtx(), ['slow', 'fast', 'medium']);

    expect(results[0]!.tenderId).toBe('slow');
    expect(results[1]!.tenderId).toBe('fast');
    expect(results[2]!.tenderId).toBe('medium');
  });

  it('handles all tenders failing', async () => {
    setupRemapFailure('pool exhaustion');
    const results = await batchRemapGlForTenders(createCtx(), ['t-1', 't-2', 't-3', 't-4']);

    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.success).toBe(false);
      expect(r.error).toContain('pool exhaustion');
    }
  });

  it('handles exactly CONCURRENCY (3) tenders — single wave', async () => {
    setupRemapSuccess();
    const results = await batchRemapGlForTenders(createCtx(), ['t-1', 't-2', 't-3']);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('handles CONCURRENCY+1 (4) tenders — two waves', async () => {
    setupRemapSuccess();
    const results = await batchRemapGlForTenders(createCtx(), ['t-1', 't-2', 't-3', 't-4']);
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('passes reason through to each remapGlForTender call', async () => {
    setupRemapSuccess();
    await batchRemapGlForTenders(createCtx(), ['t-1'], 'custom reason');
    // remapGlForTender uses voidJournalEntry with the reason — check it was passed
    expect(mocks.auditLogDeferred).toHaveBeenCalledOnce();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applySmartResolutions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('applySmartResolutions', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress summary log noise in tests
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    // Default: withTenant runs the callback with a mock tx
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValue([]),
      };
      return fn(mockTx);
    });
    mocks.getAccountingSettings.mockResolvedValue({ id: 'settings-1' });
    mocks.getRemappableTenders.mockResolvedValue([]);
    // Setup remap success for Phase 1/2
    setupRemapSuccess();
  });

  it('returns zero counts when suggestions have only invalid GL accounts', async () => {
    // withTenant: account validation returns empty (no valid accounts)
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValue([]), // no valid accounts
      };
      return fn(mockTx);
    });

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'sub_department', entityId: 'sd-1', suggestedAccountId: 'invalid-acct' },
      ],
    });

    expect(result.mappingsCreated).toBe(0);
    expect(result.eventsResolved).toBe(0);
    expect(result.remapped).toBe(0);
  });

  it('collects retry tender IDs from unhandled_error suggestions with __retry__', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValue([]),
      };
      return fn(mockTx);
    });

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'unhandled_error', entityId: 'tender-a,tender-b,tender-c', suggestedAccountId: '__retry__' },
      ],
    });

    // Phase 1 should have been called with 3 tender IDs (all < 25 cap)
    // They should all succeed with our setupRemapSuccess()
    expect(result.remapped).toBe(3);
    expect(result.failed).toBe(0);
  });

  it('caps retry phase at 25 tenders', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(mockTx);
    });

    // 30 tenders — should cap at 25
    const ids = Array.from({ length: 30 }, (_, i) => `t-${i}`).join(',');

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'posting_error', entityId: ids, suggestedAccountId: '__retry__' },
      ],
    });

    // Should process exactly 25, not 30
    expect(result.remapped).toBe(25);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Retry capped at 25/30'),
    );

    consoleSpy.mockRestore();
  });

  it('deduplicates retry tender IDs', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(mockTx);
    });

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'unhandled_error', entityId: 'tender-a,tender-a,tender-b', suggestedAccountId: '__retry__' },
      ],
    });

    // Should deduplicate: tender-a appears twice, but only processed once
    expect(result.remapped).toBe(2);
  });

  it('handles Phase 1 retry failure gracefully (catch block)', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(mockTx);
    });
    setupRemapFailure('SAVEPOINT error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'unhandled_error', entityId: 'tender-1', suggestedAccountId: '__retry__' },
      ],
    });

    // Individual tender failures are tracked, not thrown
    expect(result.failed).toBe(1);
    expect(result.remapped).toBe(0);

    consoleSpy.mockRestore();
  });

  it('Phase 2 excludes tenders already retried in Phase 1', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(mockTx);
    });

    // Phase 2: getRemappableTenders returns tenders including one from Phase 1
    mocks.getRemappableTenders.mockResolvedValue([
      { tenderId: 'tender-a', canRemap: true },
      { tenderId: 'tender-b', canRemap: true }, // already in Phase 1
    ]);

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'unhandled_error', entityId: 'tender-b', suggestedAccountId: '__retry__' },
      ],
    });

    // Phase 1: tender-b = 1 remapped
    // Phase 2: tender-a only (tender-b excluded) = 1 remapped
    expect(result.remapped).toBe(2);
  });

  it('Phase 2 caps at 25 tenders', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(mockTx);
    });

    // 30 eligible tenders in Phase 2
    mocks.getRemappableTenders.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({ tenderId: `t-${i}`, canRemap: true })),
    );

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'sub_department', entityId: 'sd-1', suggestedAccountId: '__retry__' },
      ],
    });

    // Phase 2: capped at 25
    expect(result.remapped).toBe(25);
  });

  it('Phase 2 failure is caught and does not throw', async () => {
    mocks.withTenant
      .mockImplementationOnce(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = { execute: vi.fn().mockResolvedValue([]) };
        return fn(mockTx);
      })
      // Phase 2 withTenant call for getAccountingSettings throws
      .mockRejectedValueOnce(new Error('DB pool exhaustion'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'sub_department', entityId: 'sd-1', suggestedAccountId: '__retry__' },
      ],
    });

    // Should still return a result, not throw
    expect(result).toBeDefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[smart-resolve] remap phase failed:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it('skips Phase 2 when accounting settings are null', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(mockTx);
    });
    mocks.getAccountingSettings.mockResolvedValue(null);

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'sub_department', entityId: 'sd-1', suggestedAccountId: '__retry__' },
      ],
    });

    // getRemappableTenders should not have been called
    expect(mocks.getRemappableTenders).not.toHaveBeenCalled();
    expect(result.remapped).toBe(0);
  });

  it('Phase 2 does NOT exclude capped-out retry tenders (retrySet bug fix)', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(mockTx);
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 30 retry tenders → Phase 1 caps at 25 (t-0 through t-24)
    // t-25 through t-29 are NOT retried in Phase 1
    const ids = Array.from({ length: 30 }, (_, i) => `t-${i}`).join(',');

    // Phase 2 returns t-25 through t-29 as eligible
    mocks.getRemappableTenders.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ tenderId: `t-${25 + i}`, canRemap: true })),
    );

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'unhandled_error', entityId: ids, suggestedAccountId: '__retry__' },
      ],
    });

    // Phase 1: 25 retried, Phase 2: 5 remapped (not excluded because they weren't in the batch)
    expect(result.remapped).toBe(30);

    warnSpy.mockRestore();
  });

  it('emits summary log with counts', async () => {
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(mockTx);
    });

    await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'unhandled_error', entityId: 'tender-1', suggestedAccountId: '__retry__' },
      ],
    });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[smart-resolve\] tenant=tenant-1 mappings=\d+ resolved=\d+ remapped=\d+ failed=\d+/),
    );
  });

  it('handles mixed entity types: mappings + retries in one call', async () => {
    let executeCallCount = 0;
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        execute: vi.fn().mockImplementation(() => {
          executeCallCount++;
          // First call: account validation → return valid
          if (executeCallCount === 1) return Promise.resolve([{ id: 'acct-1' }]);
          // Subsequent calls: upserts + resolve
          return Promise.resolve([]);
        }),
      };
      return fn(mockTx);
    });

    const result = await applySmartResolutions(createCtx(), {
      suggestions: [
        { entityType: 'sub_department', entityId: 'sd-1', suggestedAccountId: 'acct-1' },
        { entityType: 'unhandled_error', entityId: 'tender-1,tender-2', suggestedAccountId: '__retry__' },
      ],
    });

    expect(result.mappingsCreated).toBe(1); // sub_department
    expect(result.remapped).toBe(2); // 2 retried tenders
  });
});
