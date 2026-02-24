import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const { mockWithTenant, mockGetWorkflowConfig, mockGetCloseChecklist, mockAuditLog } = vi.hoisted(() => ({
  mockWithTenant: vi.fn(),
  mockGetWorkflowConfig: vi.fn(),
  mockGetCloseChecklist: vi.fn(),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  erpCloseOrchestratorRuns: { id: 'id', tenantId: 'tenantId' },
}));

vi.mock('@oppsera/shared', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    generateUlid: vi.fn(() => 'run-id-001'),
  };
});

vi.mock('@oppsera/core/erp', () => ({
  getWorkflowConfig: mockGetWorkflowConfig,
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mockAuditLog,
}));

vi.mock('../queries/get-close-checklist', () => ({
  getCloseChecklist: mockGetCloseChecklist,
}));

import { runCloseOrchestrator } from '../commands/run-close-orchestrator';
import type { RequestContext } from '@oppsera/core/auth/context';

const buildCtx = (): RequestContext => ({
  tenantId: 'tnt_test',
  user: { id: 'user_01', email: 'test@example.com', role: 'Owner' } as any,
  requestId: 'req-001',
  locationId: null,
} as any);

describe('runCloseOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: period_close is autoMode=true
    mockGetWorkflowConfig.mockResolvedValue({
      autoMode: true,
      approvalRequired: false,
      userVisible: true,
      customSettings: {},
    });

    // Default: withTenant executes the callback with a mock tx
    mockWithTenant.mockImplementation(async (_id: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
        execute: vi.fn().mockResolvedValue([]),
      };
      return fn(mockTx);
    });
  });

  it('creates a run record', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [],
      postingPeriod: '2026-02',
    });

    const result = await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    expect(result.runId).toBe('run-id-001');
    // withTenant called at least once (for insert + update)
    expect(mockWithTenant).toHaveBeenCalled();
  });

  it('marks already-passing steps as passed', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [
        { label: 'Trial balance', status: 'pass', detail: 'Balanced' },
        { label: 'Bank reconciliation', status: 'pass', detail: 'All matched' },
      ],
      postingPeriod: '2026-02',
    });

    const result = await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    expect(result.totalSteps).toBe(2);
    expect(result.completedSteps).toBe(2);
    expect(result.status).toBe('completed');
    expect(result.stepResults[0]!.status).toBe('passed');
    expect(result.stepResults[1]!.status).toBe('passed');
  });

  it('auto-executes draft_entries step when autoMode is on', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [
        { label: 'Open draft journal entries', status: 'fail', detail: '3 drafts remaining' },
      ],
      postingPeriod: '2026-02',
    });

    // Mock the auto-execute SQL to succeed
    mockWithTenant.mockImplementation(async (_id: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
        execute: vi.fn().mockResolvedValue([]),
      };
      return fn(mockTx);
    });

    const result = await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    expect(result.stepResults[0]!.status).toBe('auto_executed');
    expect(result.completedSteps).toBe(1);
  });

  it('skips warning items', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [
        { label: 'Legacy GL warning', status: 'warning', detail: 'Legacy GL posting is still enabled' },
      ],
      postingPeriod: '2026-02',
    });

    const result = await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    expect(result.skippedSteps).toBe(1);
    expect(result.stepResults[0]!.status).toBe('skipped');
  });

  it('marks non-auto-executable fail items as manual_required', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [
        { label: 'Some manual step', status: 'fail', detail: 'Requires manual action' },
      ],
      postingPeriod: '2026-02',
    });

    const result = await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    expect(result.stepResults[0]!.status).toBe('manual_required');
    expect(result.remainingManualSteps).toContain('Some manual step');
    expect(result.status).toBe('partial');
  });

  it('handles step execution failures gracefully', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [
        { label: 'Open draft journal entries', status: 'fail', detail: '3 drafts' },
      ],
      postingPeriod: '2026-02',
    });

    // Make the auto-execute step throw (call #2), but allow the final update (call #3)
    let callCount = 0;
    mockWithTenant.mockImplementation(async (_id: string, fn: (tx: unknown) => Promise<unknown>) => {
      callCount++;
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
        execute: vi.fn().mockImplementation(() => {
          if (callCount === 2) throw new Error('DB connection failed');
          return [];
        }),
      };
      return fn(mockTx);
    });

    const result = await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    expect(result.failedSteps).toBe(1);
    expect(result.stepResults[0]!.status).toBe('failed');
    expect(result.stepResults[0]!.error).toContain('DB connection failed');
    expect(result.status).toBe('failed');
  });

  it('does not auto-execute when autoMode is false', async () => {
    mockGetWorkflowConfig.mockResolvedValue({
      autoMode: false,
      approvalRequired: true,
      userVisible: true,
      customSettings: {},
    });

    mockGetCloseChecklist.mockResolvedValue({
      items: [
        { label: 'Open draft journal entries', status: 'fail', detail: '3 drafts remaining' },
      ],
      postingPeriod: '2026-02',
    });

    const result = await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    // With autoMode off, the draft_entries step should be treated as manual_required
    expect(result.stepResults[0]!.status).toBe('manual_required');
    expect(result.remainingManualSteps).toContain('Open draft journal entries');
  });

  it('returns completed status when all steps pass', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [
        { label: 'Trial balance', status: 'pass', detail: 'Balanced' },
        { label: 'Bank reconciliation', status: 'pass', detail: 'All matched' },
        { label: 'AP reconciliation', status: 'pass', detail: 'Reconciled' },
      ],
      postingPeriod: '2026-02',
    });

    const result = await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    expect(result.status).toBe('completed');
    expect(result.completedSteps).toBe(3);
    expect(result.failedSteps).toBe(0);
    expect(result.remainingManualSteps).toHaveLength(0);
  });

  it('logs audit event after run', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [],
      postingPeriod: '2026-02',
    });

    await runCloseOrchestrator(buildCtx(), { businessDate: '2026-02-24' });
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'accounting.close_orchestrator.run',
      'erp_close_orchestrator_run',
      'run-id-001',
    );
  });

  it('derives posting period from business date', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [],
      postingPeriod: '2026-12',
    });

    await runCloseOrchestrator(buildCtx(), { businessDate: '2026-12-31' });
    expect(mockGetCloseChecklist).toHaveBeenCalledWith(
      expect.objectContaining({ postingPeriod: '2026-12' }),
    );
  });

  it('accepts optional locationId', async () => {
    mockGetCloseChecklist.mockResolvedValue({
      items: [],
      postingPeriod: '2026-02',
    });

    const result = await runCloseOrchestrator(buildCtx(), {
      businessDate: '2026-02-24',
      locationId: 'loc_01',
    });
    expect(result.runId).toBeDefined();
  });
});
