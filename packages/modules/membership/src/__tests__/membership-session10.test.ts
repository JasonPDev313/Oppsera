import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_A = 'tenant_001';

// ── Mock Drizzle chain ──────────────────────────────────────────────

const mockSelectReturns = vi.fn();
const mockInsertReturns = vi.fn();
const mockUpdateReturns = vi.fn();

const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockLeftJoin = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockInsert = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockUpdate = vi.fn();
const mockExecute = vi.fn();

/**
 * Build a chainable result from `.where()` — when the query chains further
 * (`.limit()`, `.orderBy()`), those terminal calls consume from `mockSelectReturns`.
 * When `.where()` is the terminal call (awaited or iterated directly), the
 * `.then()` / `[Symbol.iterator]` hooks lazily consume from `mockSelectReturns`.
 */
function makeWhereResult() {
  let resolved: any[] | null = null;
  const resolve = () => {
    if (resolved === null) {
      const data = mockSelectReturns();
      resolved = Array.isArray(data) ? data : [];
    }
    return resolved;
  };
  return {
    orderBy: mockOrderBy,
    limit: mockLimit,
    returning: mockReturning,
    [Symbol.iterator]: () => resolve()[Symbol.iterator](),
    then: (onFulfilled: any) => onFulfilled(resolve()),
  };
}

function wireChain() {
  mockOrderBy.mockImplementation(() => {
    const result = mockSelectReturns();
    const arr = Array.isArray(result) ? result : [];
    (arr as any).limit = () => arr;
    return arr;
  });

  mockLimit.mockImplementation(() => mockSelectReturns());

  mockWhere.mockImplementation(() => makeWhereResult());

  mockLeftJoin.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
  }));
  mockFrom.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    leftJoin: mockLeftJoin,
  }));
  mockSelect.mockImplementation(() => ({ from: mockFrom }));
  mockInsert.mockImplementation(() => ({ values: mockValues }));
  mockValues.mockImplementation(() => ({
    returning: mockReturning,
    onConflictDoUpdate: vi.fn(() => ({ returning: mockReturning })),
  }));
  mockReturning.mockImplementation(() => mockInsertReturns());
  mockUpdate.mockImplementation(() => ({ set: mockSet }));
  mockSet.mockImplementation(() => ({ where: mockUpdateWhere }));
  mockUpdateWhere.mockImplementation(() => ({ returning: mockReturning }));
  mockExecute.mockResolvedValue([]);
}

// Initial wiring
wireChain();

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: any) => any) =>
    fn({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      execute: mockExecute,
    }),
  ),
  billingCycleRuns: {
    id: 'id', tenantId: 'tenant_id', cycleDate: 'cycle_date', status: 'status',
    steps: 'steps', startedBy: 'started_by', previewSummary: 'preview_summary',
    totalDuesBilledCents: 'total_dues_billed_cents',
    totalInitiationBilledCents: 'total_initiation_billed_cents',
    totalMinimumsChargedCents: 'total_minimums_charged_cents',
    totalLateFeesCents: 'total_late_fees_cents',
    totalStatementsGenerated: 'total_statements_generated',
    totalAutopayCollectedCents: 'total_autopay_collected_cents',
    exceptionsJson: 'exceptions_json',
    startedAt: 'started_at', completedAt: 'completed_at',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipSubscriptions: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    planId: 'plan_id', status: 'status', nextBillDate: 'next_bill_date',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipAccounts: {
    id: 'id', tenantId: 'tenant_id', status: 'status', holdCharging: 'hold_charging',
    accountNumber: 'account_number', primaryMemberId: 'primary_member_id',
    autopayEnabled: 'autopay_enabled',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipPlans: {
    id: 'id', tenantId: 'tenant_id', name: 'name', priceCents: 'price_cents',
    duesAmountCents: 'dues_amount_cents', billingFrequency: 'billing_frequency',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn((_ctx: any, fn: (tx: any) => any) =>
    fn({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      execute: mockExecute,
    }).then((r: any) => r.result),
  ),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, type, payload) => ({ type, payload })),
}));

const mockAuditLog = vi.fn();
vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ulid_test_001'),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) {
      super(id ? `${entity} ${id} not found` : `${entity} not found`);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(message: string) {
      super(message);
      this.name = 'ConflictError';
    }
  },
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    statusCode = 422;
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode = 400) {
      super(message);
      this.name = 'AppError';
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  desc: vi.fn((col) => ({ op: 'desc', col })),
  asc: vi.fn((col) => ({ op: 'asc', col })),
  inArray: vi.fn((col, vals) => ({ op: 'inArray', col, vals })),
  or: vi.fn((...args: any[]) => ({ op: 'or', args })),
  lte: vi.fn((a, b) => ({ op: 'lte', a, b })),
  isNull: vi.fn((col) => ({ op: 'isNull', col })),
  sql: Object.assign(vi.fn(), { raw: vi.fn(), join: vi.fn() }),
}));

// ── Imports ─────────────────────────────────────────────────────────

// Commands (use mocked DB)
import { previewBillingCycle } from '../commands/preview-billing-cycle';
import { executeBillingStep } from '../commands/execute-billing-step';
import { reviewAndCloseCycle } from '../commands/review-and-close-cycle';

// Queries (use mocked DB)
import { getBillingCyclePreview } from '../queries/get-billing-cycle-preview';
import { getBillingCycleRun } from '../queries/get-billing-cycle-run';

// ── Helpers ─────────────────────────────────────────────────────────

function makeCtx() {
  return {
    tenantId: TENANT_A,
    user: { id: 'user_001', email: 'test@example.com', role: 'owner' },
    requestId: 'req_001',
  } as any;
}

function resetMocks() {
  vi.clearAllMocks();

  // mockReset on data-return mocks to clear mockReturnValueOnce queues (gotcha #58)
  mockSelectReturns.mockReset();
  mockInsertReturns.mockReset();
  mockUpdateReturns.mockReset();

  // Set default return values
  mockSelectReturns.mockReturnValue([]);
  mockInsertReturns.mockReturnValue([]);
  mockUpdateReturns.mockReturnValue([]);
  mockExecute.mockResolvedValue([]);

  wireChain();
}

// ═══════════════════════════════════════════════════════════════════
// 1. Command Tests — previewBillingCycle
// ═══════════════════════════════════════════════════════════════════

describe('Session 10 — Commands', () => {
  describe('previewBillingCycle', () => {
    beforeEach(resetMocks);

    it('creates a billing cycle run with status=preview', async () => {
      const createdRun = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 3, totalDuesCents: 15000 },
        totalDuesBilledCents: 0,
        totalInitiationBilledCents: 0,
        totalMinimumsChargedCents: 0,
        totalLateFeesCents: 0,
        totalStatementsGenerated: 0,
        totalAutopayCollectedCents: 0,
      };

      // Select 1: check for existing active run (none found)
      mockSelectReturns.mockReturnValueOnce([]);
      // Select 2: active subscriptions for preview count
      mockSelectReturns.mockReturnValueOnce([
        { id: 'sub_001', planId: 'plan_001', membershipAccountId: 'acct_001' },
        { id: 'sub_002', planId: 'plan_001', membershipAccountId: 'acct_002' },
        { id: 'sub_003', planId: 'plan_002', membershipAccountId: 'acct_003' },
      ]);
      // Insert 1: create the billing cycle run
      mockInsertReturns.mockReturnValueOnce([createdRun]);

      const result = await previewBillingCycle(makeCtx(), {
        cycleDate: '2025-07-01',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ulid_test_001');
      expect(result.status).toBe('preview');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('builds preview summary with subscription counts', async () => {
      const createdRun = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 2, totalDuesCents: 10000 },
        totalDuesBilledCents: 0,
        totalInitiationBilledCents: 0,
        totalMinimumsChargedCents: 0,
        totalLateFeesCents: 0,
        totalStatementsGenerated: 0,
        totalAutopayCollectedCents: 0,
      };

      // Select 1: no existing active run
      mockSelectReturns.mockReturnValueOnce([]);
      // Select 2: active subscriptions
      mockSelectReturns.mockReturnValueOnce([
        { id: 'sub_001', planId: 'plan_001', membershipAccountId: 'acct_001' },
        { id: 'sub_002', planId: 'plan_001', membershipAccountId: 'acct_002' },
      ]);
      // Insert 1: create run
      mockInsertReturns.mockReturnValueOnce([createdRun]);

      const result = await previewBillingCycle(makeCtx(), {
        cycleDate: '2025-07-01',
      });

      expect(result).toBeDefined();
      expect(result.previewSummary).toBeDefined();
      expect(result.previewSummary.activeSubscriptionCount).toBe(2);
    });

    it('rejects when an active run already exists (409)', async () => {
      const existingRun = {
        id: 'existing_run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'in_progress',
      };

      // Select 1: existing active run found
      mockSelectReturns.mockReturnValueOnce([existingRun]);

      await expect(
        previewBillingCycle(makeCtx(), {
          cycleDate: '2025-07-01',
        }),
      ).rejects.toThrow(/already.*active|already exists|in.progress/i);
    });

    it('emits billing_cycle.preview.created event', async () => {
      const { buildEventFromContext } = await import('@oppsera/core/events/build-event');
      const createdRun = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 0, totalDuesCents: 0 },
        totalDuesBilledCents: 0,
        totalInitiationBilledCents: 0,
        totalMinimumsChargedCents: 0,
        totalLateFeesCents: 0,
        totalStatementsGenerated: 0,
        totalAutopayCollectedCents: 0,
      };

      // Select 1: no existing run
      mockSelectReturns.mockReturnValueOnce([]);
      // Select 2: no active subscriptions
      mockSelectReturns.mockReturnValueOnce([]);
      // Insert 1: create run
      mockInsertReturns.mockReturnValueOnce([createdRun]);

      await previewBillingCycle(makeCtx(), { cycleDate: '2025-07-01' });

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        'membership.billing_cycle.preview.created.v1',
        expect.objectContaining({
          runId: 'ulid_test_001',
          cycleDate: '2025-07-01',
        }),
      );
    });

    it('calls auditLog', async () => {
      const createdRun = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 0, totalDuesCents: 0 },
        totalDuesBilledCents: 0,
        totalInitiationBilledCents: 0,
        totalMinimumsChargedCents: 0,
        totalLateFeesCents: 0,
        totalStatementsGenerated: 0,
        totalAutopayCollectedCents: 0,
      };

      // Select 1: no existing run
      mockSelectReturns.mockReturnValueOnce([]);
      // Select 2: no subscriptions
      mockSelectReturns.mockReturnValueOnce([]);
      // Insert 1: create run
      mockInsertReturns.mockReturnValueOnce([createdRun]);

      await previewBillingCycle(makeCtx(), { cycleDate: '2025-07-01' });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('billing_cycle'),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. Command Tests — executeBillingStep
  // ═══════════════════════════════════════════════════════════════════

  describe('executeBillingStep', () => {
    beforeEach(resetMocks);

    it('updates run status to in_progress and appends step', async () => {
      const existingRun = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
        previewSummary: { activeSubscriptionCount: 5 },
      };
      const updatedRun = {
        ...existingRun,
        status: 'in_progress',
        steps: [{ stepName: 'preview_dues', executedAt: expect.any(String), executedBy: 'user_001' }],
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([existingRun]);
      // Update returning: updated run
      mockInsertReturns.mockReturnValueOnce([updatedRun]);

      const result = await executeBillingStep(makeCtx(), {
        runId: 'run_001',
        stepName: 'preview_dues',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('in_progress');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('stores exceptions for exception_review step', async () => {
      const existingRun = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'in_progress',
        steps: [{ stepName: 'preview_dues', executedAt: '2025-07-01T10:00:00Z' }],
        previewSummary: { activeSubscriptionCount: 5 },
        exceptionsJson: null,
      };
      const exceptions = [
        { membershipAccountId: 'acct_001', reason: 'Account on hold' },
        { membershipAccountId: 'acct_002', reason: 'Missing payment method' },
      ];
      const updatedRun = {
        ...existingRun,
        status: 'in_progress',
        steps: [
          ...existingRun.steps,
          { stepName: 'exception_review', executedAt: expect.any(String) },
        ],
        exceptionsJson: exceptions,
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([existingRun]);
      // Update returning: updated run with exceptions
      mockInsertReturns.mockReturnValueOnce([updatedRun]);

      const result = await executeBillingStep(makeCtx(), {
        runId: 'run_001',
        stepName: 'exception_review',
        exceptions,
      });

      expect(result).toBeDefined();
      expect(result.stepsCompleted).toBeGreaterThan(0);
    });

    it('throws NotFoundError for non-existent run', async () => {
      // Select 1: run not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        executeBillingStep(makeCtx(), {
          runId: 'nonexistent_run',
          stepName: 'preview_dues',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('rejects for completed run (cannot execute steps on completed cycle)', async () => {
      const completedRun = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'completed',
        steps: [
          { stepName: 'preview_dues' },
          { stepName: 'review_close' },
        ],
        completedAt: new Date('2025-07-01T18:00:00Z'),
      };

      // Select 1: run found but completed
      mockSelectReturns.mockReturnValueOnce([completedRun]);

      await expect(
        executeBillingStep(makeCtx(), {
          runId: 'run_001',
          stepName: 'generate_statements',
        }),
      ).rejects.toThrow(/completed|cannot execute|already closed/i);
    });

    it('emits billing_cycle.step.executed event', async () => {
      const { buildEventFromContext } = await import('@oppsera/core/events/build-event');
      const existingRun = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
        previewSummary: { activeSubscriptionCount: 3 },
      };
      const updatedRun = {
        ...existingRun,
        status: 'in_progress',
        steps: [{ stepName: 'compute_minimums' }],
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([existingRun]);
      // Update returning
      mockInsertReturns.mockReturnValueOnce([updatedRun]);

      await executeBillingStep(makeCtx(), {
        runId: 'run_001',
        stepName: 'compute_minimums',
      });

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        'membership.billing_cycle.step.executed.v1',
        expect.objectContaining({
          runId: 'run_001',
          stepName: 'compute_minimums',
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. Command Tests — reviewAndCloseCycle
  // ═══════════════════════════════════════════════════════════════════

  describe('reviewAndCloseCycle', () => {
    beforeEach(resetMocks);

    it('sets status to completed and completedAt', async () => {
      const existingRun = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'in_progress',
        steps: [
          { stepName: 'preview_dues' },
          { stepName: 'generate_statements' },
          { stepName: 'run_autopay' },
        ],
        totalDuesBilledCents: 50000,
        totalStatementsGenerated: 10,
      };
      const updatedRun = {
        ...existingRun,
        status: 'completed',
        completedAt: new Date('2025-07-01T18:00:00Z'),
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([existingRun]);
      // Update returning: completed run
      mockInsertReturns.mockReturnValueOnce([updatedRun]);

      const result = await reviewAndCloseCycle(makeCtx(), {
        runId: 'run_001',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('rejects for run not in in_progress state', async () => {
      const previewRun = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
      };

      // Select 1: run found but in preview state
      mockSelectReturns.mockReturnValueOnce([previewRun]);

      await expect(
        reviewAndCloseCycle(makeCtx(), {
          runId: 'run_001',
        }),
      ).rejects.toThrow(/in.progress|must be in_progress|not ready/i);
    });

    it('rejects for non-existent run', async () => {
      // Select 1: run not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        reviewAndCloseCycle(makeCtx(), {
          runId: 'nonexistent_run',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('emits billing_cycle.completed event', async () => {
      const { buildEventFromContext } = await import('@oppsera/core/events/build-event');
      const existingRun = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'in_progress',
        steps: [{ stepName: 'preview_dues' }],
        totalDuesBilledCents: 25000,
        totalStatementsGenerated: 5,
      };
      const updatedRun = {
        ...existingRun,
        status: 'completed',
        completedAt: new Date('2025-07-01T18:00:00Z'),
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([existingRun]);
      // Update returning
      mockInsertReturns.mockReturnValueOnce([updatedRun]);

      await reviewAndCloseCycle(makeCtx(), { runId: 'run_001' });

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        'membership.billing_cycle.completed.v1',
        expect.objectContaining({
          runId: 'run_001',
          cycleDate: '2025-07-01',
        }),
      );
    });

    it('calls auditLog', async () => {
      const existingRun = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'in_progress',
        steps: [{ stepName: 'preview_dues' }],
        totalDuesBilledCents: 25000,
      };
      const updatedRun = {
        ...existingRun,
        status: 'completed',
        completedAt: new Date('2025-07-01T18:00:00Z'),
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([existingRun]);
      // Update returning
      mockInsertReturns.mockReturnValueOnce([updatedRun]);

      await reviewAndCloseCycle(makeCtx(), { runId: 'run_001' });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('billing_cycle'),
        expect.any(String),
        expect.any(String),
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Query Tests — getBillingCyclePreview
// ═══════════════════════════════════════════════════════════════════

describe('Session 10 — Queries', () => {
  describe('getBillingCyclePreview', () => {
    beforeEach(resetMocks);

    it('returns full run data', async () => {
      const runRow = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 5, totalDuesCents: 25000 },
        totalDuesBilledCents: 0,
        totalInitiationBilledCents: 0,
        totalMinimumsChargedCents: 0,
        totalLateFeesCents: 0,
        totalStatementsGenerated: 0,
        totalAutopayCollectedCents: 0,
        exceptionsJson: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date('2025-07-01T08:00:00Z'),
        updatedAt: new Date('2025-07-01T08:00:00Z'),
      };

      // Select 1: find the run by ID
      mockSelectReturns.mockReturnValueOnce([runRow]);

      const result = await getBillingCyclePreview({
        tenantId: TENANT_A,
        runId: 'run_001',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('run_001');
      expect(result!.status).toBe('preview');
      expect(result!.cycleDate).toBe('2025-07-01');
    });

    it('throws NotFoundError for non-existent run', async () => {
      // Select 1: run not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        getBillingCyclePreview({
          tenantId: TENANT_A,
          runId: 'nonexistent',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('returns preview summary', async () => {
      const runRow = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'preview',
        steps: [],
        startedBy: 'user_001',
        previewSummary: {
          activeSubscriptionCount: 12,
          totalDuesCents: 60000,
          planBreakdown: [
            { planId: 'plan_001', planName: 'Gold', count: 8, totalCents: 40000 },
            { planId: 'plan_002', planName: 'Silver', count: 4, totalCents: 20000 },
          ],
        },
        totalDuesBilledCents: 0,
        totalInitiationBilledCents: 0,
        totalMinimumsChargedCents: 0,
        totalLateFeesCents: 0,
        totalStatementsGenerated: 0,
        totalAutopayCollectedCents: 0,
        exceptionsJson: null,
        createdAt: new Date('2025-07-01T08:00:00Z'),
        updatedAt: new Date('2025-07-01T08:00:00Z'),
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([runRow]);

      const result = await getBillingCyclePreview({
        tenantId: TENANT_A,
        runId: 'run_001',
      });

      expect(result!.previewSummary).toBeDefined();
      expect((result!.previewSummary as any).activeSubscriptionCount).toBe(12);
      expect((result!.previewSummary as any).totalDuesCents).toBe(60000);
    });

    it('returns steps array', async () => {
      const runRow = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'in_progress',
        steps: [
          { stepName: 'preview_dues', executedAt: '2025-07-01T10:00:00Z', executedBy: 'user_001' },
          { stepName: 'compute_minimums', executedAt: '2025-07-01T10:30:00Z', executedBy: 'user_001' },
        ],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 5 },
        totalDuesBilledCents: 25000,
        totalInitiationBilledCents: 0,
        totalMinimumsChargedCents: 5000,
        totalLateFeesCents: 0,
        totalStatementsGenerated: 0,
        totalAutopayCollectedCents: 0,
        exceptionsJson: null,
        createdAt: new Date('2025-07-01T08:00:00Z'),
        updatedAt: new Date('2025-07-01T10:30:00Z'),
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([runRow]);

      const result = await getBillingCyclePreview({
        tenantId: TENANT_A,
        runId: 'run_001',
      });

      expect(result!.steps).toHaveLength(2);
      expect(result!.steps[0]!.stepName).toBe('preview_dues');
      expect(result!.steps[1]!.stepName).toBe('compute_minimums');
    });

    it('returns totals', async () => {
      const runRow = {
        id: 'run_001',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'completed',
        steps: [
          { stepName: 'preview_dues' },
          { stepName: 'generate_statements' },
          { stepName: 'run_autopay' },
        ],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 10 },
        totalDuesBilledCents: 75000,
        totalInitiationBilledCents: 10000,
        totalMinimumsChargedCents: 3000,
        totalLateFeesCents: 500,
        totalStatementsGenerated: 10,
        totalAutopayCollectedCents: 60000,
        exceptionsJson: null,
        completedAt: new Date('2025-07-01T18:00:00Z'),
        createdAt: new Date('2025-07-01T08:00:00Z'),
        updatedAt: new Date('2025-07-01T18:00:00Z'),
      };

      // Select 1: find the run
      mockSelectReturns.mockReturnValueOnce([runRow]);

      const result = await getBillingCyclePreview({
        tenantId: TENANT_A,
        runId: 'run_001',
      });

      expect(result!.totalDuesBilledCents).toBe(75000);
      expect(result!.totalInitiationBilledCents).toBe(10000);
      expect(result!.totalMinimumsChargedCents).toBe(3000);
      expect(result!.totalLateFeesCents).toBe(500);
      expect(result!.totalStatementsGenerated).toBe(10);
      expect(result!.totalAutopayCollectedCents).toBe(60000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. Query Tests — getBillingCycleRun
  // ═══════════════════════════════════════════════════════════════════

  describe('getBillingCycleRun', () => {
    beforeEach(resetMocks);

    it('returns active run when no runId specified', async () => {
      const activeRun = {
        id: 'run_active',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'in_progress',
        steps: [{ stepName: 'preview_dues' }],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 5 },
        totalDuesBilledCents: 25000,
        totalInitiationBilledCents: 0,
        totalMinimumsChargedCents: 0,
        totalLateFeesCents: 0,
        totalStatementsGenerated: 0,
        totalAutopayCollectedCents: 0,
        exceptionsJson: null,
        startedAt: new Date('2025-07-01T08:00:00Z'),
        completedAt: null,
        createdAt: new Date('2025-07-01T08:00:00Z'),
        updatedAt: new Date('2025-07-01T10:00:00Z'),
      };

      // Select 1: find active run (status != completed and != cancelled)
      mockSelectReturns.mockReturnValueOnce([activeRun]);

      const result = await getBillingCycleRun({
        tenantId: TENANT_A,
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('run_active');
      expect(result!.status).toBe('in_progress');
    });

    it('returns null when no active run', async () => {
      // Select 1: no active runs found
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getBillingCycleRun({
        tenantId: TENANT_A,
      });

      expect(result).toBeNull();
    });

    it('returns specific run by ID', async () => {
      const specificRun = {
        id: 'run_specific_001',
        tenantId: TENANT_A,
        cycleDate: '2025-06-01',
        status: 'completed',
        steps: [
          { stepName: 'preview_dues' },
          { stepName: 'generate_statements' },
          { stepName: 'review_close' },
        ],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 8 },
        totalDuesBilledCents: 40000,
        totalInitiationBilledCents: 5000,
        totalMinimumsChargedCents: 2000,
        totalLateFeesCents: 300,
        totalStatementsGenerated: 8,
        totalAutopayCollectedCents: 35000,
        exceptionsJson: null,
        startedAt: new Date('2025-06-01T08:00:00Z'),
        completedAt: new Date('2025-06-01T18:00:00Z'),
        createdAt: new Date('2025-06-01T08:00:00Z'),
        updatedAt: new Date('2025-06-01T18:00:00Z'),
      };

      // Select 1: find run by specific ID
      mockSelectReturns.mockReturnValueOnce([specificRun]);

      const result = await getBillingCycleRun({
        tenantId: TENANT_A,
        runId: 'run_specific_001',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('run_specific_001');
      expect(result!.status).toBe('completed');
      expect(result!.cycleDate).toBe('2025-06-01');
    });

    it('throws NotFoundError for non-existent ID', async () => {
      // Select 1: run not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        getBillingCycleRun({
          tenantId: TENANT_A,
          runId: 'nonexistent_run_id',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('correctly maps all numeric fields', async () => {
      const runRow = {
        id: 'run_nums',
        tenantId: TENANT_A,
        cycleDate: '2025-07-01',
        status: 'completed',
        steps: [],
        startedBy: 'user_001',
        previewSummary: { activeSubscriptionCount: 20 },
        totalDuesBilledCents: 150000,
        totalInitiationBilledCents: 25000,
        totalMinimumsChargedCents: 8000,
        totalLateFeesCents: 1200,
        totalStatementsGenerated: 20,
        totalAutopayCollectedCents: 120000,
        exceptionsJson: [{ membershipAccountId: 'acct_fail', reason: 'Payment declined' }],
        startedAt: new Date('2025-07-01T08:00:00Z'),
        completedAt: new Date('2025-07-01T18:00:00Z'),
        createdAt: new Date('2025-07-01T08:00:00Z'),
        updatedAt: new Date('2025-07-01T18:00:00Z'),
      };

      // Select 1: find run by ID
      mockSelectReturns.mockReturnValueOnce([runRow]);

      const result = await getBillingCycleRun({
        tenantId: TENANT_A,
        runId: 'run_nums',
      });

      expect(result).not.toBeNull();
      // Verify all numeric fields are numbers (not strings from bigint)
      expect(typeof result!.totalDuesBilledCents).toBe('number');
      expect(result!.totalDuesBilledCents).toBe(150000);
      expect(typeof result!.totalInitiationBilledCents).toBe('number');
      expect(result!.totalInitiationBilledCents).toBe(25000);
      expect(typeof result!.totalMinimumsChargedCents).toBe('number');
      expect(result!.totalMinimumsChargedCents).toBe(8000);
      expect(typeof result!.totalLateFeesCents).toBe('number');
      expect(result!.totalLateFeesCents).toBe(1200);
      expect(typeof result!.totalStatementsGenerated).toBe('number');
      expect(result!.totalStatementsGenerated).toBe(20);
      expect(typeof result!.totalAutopayCollectedCents).toBe('number');
      expect(result!.totalAutopayCollectedCents).toBe(120000);
    });
  });
});
