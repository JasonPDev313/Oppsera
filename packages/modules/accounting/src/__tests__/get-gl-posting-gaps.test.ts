import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const withTenant = vi.fn();
  const getTendersSummary = vi.fn();
  return { withTenant, getTendersSummary };
});

vi.mock('@oppsera/db', () => ({
  withTenant: mocks.withTenant,
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ _tag: 'sql', args })),
    { raw: vi.fn((s: string) => s), join: vi.fn() },
  ),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ _tag: 'sql', args })),
    { raw: vi.fn((s: string) => s), join: vi.fn() },
  ),
}));

vi.mock('@oppsera/core/helpers/reconciliation-read-api', () => ({
  getReconciliationReadApi: () => ({
    getTendersSummary: mocks.getTendersSummary,
  }),
}));

import { getGlPostingGaps } from '../queries/get-gl-posting-gaps';

function buildWithTenantExecute(rows: Record<string, unknown>[]) {
  mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: any) => Promise<unknown>) => {
    const tx = {
      execute: vi.fn().mockResolvedValue(rows),
    };
    return fn(tx);
  });
}

describe('getGlPostingGaps — locationId filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTendersSummary.mockResolvedValue({ tenderCount: 0 });
  });

  it('should pass locationId to getTendersSummary when provided', async () => {
    buildWithTenantExecute([{ gl_tender_count: 5 }]);
    mocks.getTendersSummary.mockResolvedValue({ tenderCount: 5 });

    await getGlPostingGaps({
      tenantId: 'tenant-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      locationId: 'loc-1',
    });

    expect(mocks.getTendersSummary).toHaveBeenCalledWith(
      'tenant-1',
      '2026-01-01',
      '2026-01-31',
      'loc-1',
      'pos',
    );
  });

  it('should pass undefined locationId to getTendersSummary when omitted', async () => {
    buildWithTenantExecute([{ gl_tender_count: 3 }]);
    mocks.getTendersSummary.mockResolvedValue({ tenderCount: 3 });

    await getGlPostingGaps({
      tenantId: 'tenant-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    expect(mocks.getTendersSummary).toHaveBeenCalledWith(
      'tenant-1',
      '2026-01-01',
      '2026-01-31',
      undefined,
      'pos',
    );
  });

  it('should include AND location_id clause in GL coverage SQL when locationId provided', async () => {
    let capturedExecuteArg: unknown = null;
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockImplementation((sqlArg: unknown) => {
          capturedExecuteArg = sqlArg;
          return Promise.resolve([{ gl_tender_count: 2 }]);
        }),
      };
      return fn(tx);
    });
    mocks.getTendersSummary.mockResolvedValue({ tenderCount: 2 });

    await getGlPostingGaps({
      tenantId: 'tenant-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      locationId: 'loc-42',
    });

    // The SQL arg should contain the location_id value injected via template literal
    const sqlStr = JSON.stringify(capturedExecuteArg);
    expect(sqlStr).toContain('loc-42');
  });

  it('should NOT include location_id value in GL coverage SQL when locationId omitted', async () => {
    let capturedExecuteArg: unknown = null;
    mocks.withTenant.mockImplementation(async (_tenantId: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockImplementation((sqlArg: unknown) => {
          capturedExecuteArg = sqlArg;
          return Promise.resolve([{ gl_tender_count: 0 }]);
        }),
      };
      return fn(tx);
    });
    mocks.getTendersSummary.mockResolvedValue({ tenderCount: 0 });

    await getGlPostingGaps({
      tenantId: 'tenant-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    const sqlStr = JSON.stringify(capturedExecuteArg);
    // Without locationId the conditional sql`` branch produces an empty fragment
    // so loc-* values should not appear
    expect(sqlStr).not.toMatch(/loc-/);
  });

  it('should return isFullyCovered=true when tendersWithGl equals totalTenders', async () => {
    buildWithTenantExecute([{ gl_tender_count: 10 }]);
    mocks.getTendersSummary.mockResolvedValue({ tenderCount: 10 });

    const result = await getGlPostingGaps({
      tenantId: 'tenant-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      locationId: 'loc-1',
    });

    expect(result.isFullyCovered).toBe(true);
    expect(result.tendersWithoutGl).toBe(0);
    expect(result.totalTenders).toBe(10);
    expect(result.tendersWithGl).toBe(10);
  });

  it('should detect gaps and return tendersWithoutGl > 0 with locationId filter', async () => {
    // GL coverage query returns 3 entries, but tender summary shows 5 tenders
    mocks.withTenant
      .mockResolvedValueOnce({ glTenderCount: 3 }) // first withTenant call: GL coverage
      .mockResolvedValueOnce(['tender-4', 'tender-5']); // second withTenant call: fetchMissingTenderIds
    mocks.getTendersSummary.mockResolvedValue({ tenderCount: 5 });

    const result = await getGlPostingGaps({
      tenantId: 'tenant-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      locationId: 'loc-1',
    });

    expect(result.isFullyCovered).toBe(false);
    expect(result.tendersWithoutGl).toBe(2);
    expect(result.totalTenders).toBe(5);
    expect(result.tendersWithGl).toBe(3);
  });
});
