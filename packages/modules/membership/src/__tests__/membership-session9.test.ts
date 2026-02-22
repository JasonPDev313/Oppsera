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
  membershipAccounts: {
    id: 'id', tenantId: 'tenant_id', status: 'status', holdCharging: 'hold_charging',
    accountNumber: 'account_number', primaryMemberId: 'primary_member_id',
    autopayEnabled: 'autopay_enabled',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  autopayProfiles: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    paymentMethodId: 'payment_method_id', strategy: 'strategy',
    fixedAmountCents: 'fixed_amount_cents', selectedAccountTypes: 'selected_account_types',
    isActive: 'is_active', lastRunAt: 'last_run_at', nextRunAt: 'next_run_at',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  autopayRuns: {
    id: 'id', tenantId: 'tenant_id', runDate: 'run_date', status: 'status',
    totalProfilesCount: 'total_profiles_count', successCount: 'success_count',
    failedCount: 'failed_count', skippedCount: 'skipped_count',
    totalCollectedCents: 'total_collected_cents', startedAt: 'started_at',
    completedAt: 'completed_at', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  autopayAttempts: {
    id: 'id', tenantId: 'tenant_id', runId: 'run_id',
    membershipAccountId: 'membership_account_id', paymentMethodId: 'payment_method_id',
    amountCents: 'amount_cents', status: 'status', failureReason: 'failure_reason',
    attemptNumber: 'attempt_number', arTransactionId: 'ar_transaction_id',
    nextRetryAt: 'next_retry_at', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  lateFeeAssessments: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    assessmentDate: 'assessment_date', overdueAmountCents: 'overdue_amount_cents',
    feeAmountCents: 'fee_amount_cents', arTransactionId: 'ar_transaction_id',
    waived: 'waived', waivedBy: 'waived_by', waivedReason: 'waived_reason',
    createdAt: 'created_at',
  },
  membershipHolds: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    holdType: 'hold_type', reason: 'reason', placedBy: 'placed_by',
    placedAt: 'placed_at', liftedBy: 'lifted_by', liftedAt: 'lifted_at',
    liftedReason: 'lifted_reason', isActive: 'is_active', createdAt: 'created_at',
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

// Pure helper functions — real implementations, no mocks
import { computeRetrySchedule, computeLateFee } from '../helpers/autopay-retry';

// Commands (use mocked DB)
import { configureAutopayProfile } from '../commands/configure-autopay-profile';
import { runAutopayBatch } from '../commands/run-autopay-batch';
import { retryFailedAutopay } from '../commands/retry-failed-autopay';
import { applyLateFee } from '../commands/apply-late-fee';
import { setChargingHold } from '../commands/set-charging-hold';
import { liftHold } from '../commands/lift-hold';
import { freezeMembership } from '../commands/freeze-membership';

// Queries (use mocked DB)
import { getAutopayProfile } from '../queries/get-autopay-profile';
import { getRiskDashboard } from '../queries/get-risk-dashboard';
import { getCollectionsTimeline } from '../queries/get-collections-timeline';

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
// 1. Autopay Retry Helper Tests (pure functions — no mocks needed)
// ═══════════════════════════════════════════════════════════════════

describe('Session 9 — Autopay Retry Helpers', () => {
  describe('computeRetrySchedule', () => {
    it('attempt 1 → shouldRetry=true, +3 days, dunningLevel=reminder', () => {
      const result = computeRetrySchedule(1, '2025-06-01');

      expect(result.shouldRetry).toBe(true);
      expect(result.dunningLevel).toBe('reminder');
      // +3 days from June 1 = June 4
      const retryDate = new Date(result.nextRetryAt!);
      expect(retryDate.getUTCDate()).toBe(4);
      expect(retryDate.getUTCMonth()).toBe(5); // June is 0-indexed month 5
    });

    it('attempt 2 → shouldRetry=true, +7 days, dunningLevel=warning', () => {
      const result = computeRetrySchedule(2, '2025-06-01');

      expect(result.shouldRetry).toBe(true);
      expect(result.dunningLevel).toBe('warning');
      // +7 days from June 1 = June 8
      const retryDate = new Date(result.nextRetryAt!);
      expect(retryDate.getUTCDate()).toBe(8);
      expect(retryDate.getUTCMonth()).toBe(5);
    });

    it('attempt 3 → shouldRetry=false, null nextRetryAt, dunningLevel=final_notice', () => {
      const result = computeRetrySchedule(3, '2025-06-01');

      expect(result.shouldRetry).toBe(false);
      expect(result.nextRetryAt).toBeNull();
      expect(result.dunningLevel).toBe('final_notice');
    });

    it('attempt 4+ → same as attempt 3 (no further retries)', () => {
      const result = computeRetrySchedule(5, '2025-06-01');

      expect(result.shouldRetry).toBe(false);
      expect(result.nextRetryAt).toBeNull();
      expect(result.dunningLevel).toBe('final_notice');
    });
  });

  describe('computeLateFee', () => {
    it('computes basic percentage fee', () => {
      // $100.00 overdue, 1.5% fee (150 bps) = $1.50
      const fee = computeLateFee(10000, 150);
      expect(fee).toBe(150);
    });

    it('applies minimum fee when computed is lower', () => {
      // $10.00 overdue, 1% fee (100 bps) = $0.10 computed, min $5.00
      const fee = computeLateFee(1000, 100, 500);
      expect(fee).toBe(500);
    });

    it('applies maximum cap', () => {
      // $10,000.00 overdue, 5% fee (500 bps) = $500.00 computed, max $100.00
      const fee = computeLateFee(1000000, 500, 0, 10000);
      expect(fee).toBe(10000);
    });

    it('returns 0 for 0 overdue amount', () => {
      const fee = computeLateFee(0, 150, 500, 10000);
      expect(fee).toBe(0);
    });

    it('returns 0 for negative overdue amount', () => {
      const fee = computeLateFee(-5000, 150, 500, 10000);
      expect(fee).toBe(0);
    });

    it('applies minimum and maximum together (min wins when fee < min)', () => {
      // $5.00 overdue, 1% (100 bps) = $0.05 computed, min $2.00, max $50.00
      const fee = computeLateFee(500, 100, 200, 5000);
      expect(fee).toBe(200);
    });

    it('applies minimum and maximum together (max wins when fee > max)', () => {
      // $50,000.00 overdue, 10% (1000 bps) = $5,000.00 computed, min $2.00, max $100.00
      const fee = computeLateFee(5000000, 1000, 200, 10000);
      expect(fee).toBe(10000);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 9 — Commands', () => {
  describe('configureAutopayProfile', () => {
    beforeEach(resetMocks);

    it('creates new profile when none exists', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const createdProfile = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
        paymentMethodId: 'pm_001',
        strategy: 'full_balance',
        isActive: true,
      };

      // Select 1: membership account lookup
      mockSelectReturns.mockReturnValueOnce([account]);
      // Select 2: existing profile lookup (none exists)
      mockSelectReturns.mockReturnValueOnce([]);
      // Insert 1: create profile
      mockInsertReturns.mockReturnValueOnce([createdProfile]);

      const result = await configureAutopayProfile(makeCtx(), {
        membershipAccountId: 'acct_001',
        paymentMethodId: 'pm_001',
        strategy: 'full_balance',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ulid_test_001');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('updates existing profile when one exists', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const existingProfile = { id: 'profile_existing' };
      const updatedProfile = {
        id: 'profile_existing',
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
        paymentMethodId: 'pm_002',
        strategy: 'fixed_amount',
        fixedAmountCents: 5000,
        isActive: true,
      };

      // Select 1: membership account lookup
      mockSelectReturns.mockReturnValueOnce([account]);
      // Select 2: existing profile found
      mockSelectReturns.mockReturnValueOnce([existingProfile]);
      // Returning from update (via updateWhere → returning chain)
      mockInsertReturns.mockReturnValueOnce([updatedProfile]);

      const result = await configureAutopayProfile(makeCtx(), {
        membershipAccountId: 'acct_001',
        paymentMethodId: 'pm_002',
        strategy: 'fixed_amount',
        fixedAmountCents: 5000,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('profile_existing');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('throws NotFoundError when membership account does not exist', async () => {
      // Select 1: membership account not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        configureAutopayProfile(makeCtx(), {
          membershipAccountId: 'nonexistent',
          strategy: 'full_balance',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('runAutopayBatch', () => {
    beforeEach(resetMocks);

    it('creates run and attempts for active profiles', async () => {
      const runRow = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        runDate: '2025-06-01',
        status: 'pending',
        totalProfilesCount: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalCollectedCents: 0,
      };
      const profile1 = {
        id: 'prof_001',
        membershipAccountId: 'acct_001',
        paymentMethodId: 'pm_001',
        strategy: 'full_balance',
        fixedAmountCents: 0,
      };
      const attemptRow = {
        id: 'ulid_test_001',
        runId: 'ulid_test_001',
        membershipAccountId: 'acct_001',
        status: 'pending',
      };

      // Insert 1: create the autopay run
      mockInsertReturns.mockReturnValueOnce([runRow]);
      // Select 1: active profiles found
      mockSelectReturns.mockReturnValueOnce([profile1]);
      // Insert 2: create attempt for profile1
      mockInsertReturns.mockReturnValueOnce([attemptRow]);

      const result = await runAutopayBatch(makeCtx(), {
        runDate: '2025-06-01',
      });

      expect(result).toBeDefined();
      expect(result.totalProfilesCount).toBe(1);
      expect(result.attemptCount).toBe(1);
    });

    it('emits batch started event', async () => {
      const { buildEventFromContext } = await import('@oppsera/core/events/build-event');
      const runRow = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        runDate: '2025-06-01',
        status: 'pending',
      };

      // Insert 1: run
      mockInsertReturns.mockReturnValueOnce([runRow]);
      // Select 1: no active profiles
      mockSelectReturns.mockReturnValueOnce([]);

      await runAutopayBatch(makeCtx(), { runDate: '2025-06-01' });

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        'membership.autopay.batch.started.v1',
        expect.objectContaining({
          runId: 'ulid_test_001',
          runDate: '2025-06-01',
        }),
      );
    });

    it('handles case with no active profiles (creates run with 0 counts)', async () => {
      const runRow = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        runDate: '2025-06-01',
        status: 'pending',
        totalProfilesCount: 0,
      };

      // Insert 1: create the autopay run
      mockInsertReturns.mockReturnValueOnce([runRow]);
      // Select 1: no active profiles
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await runAutopayBatch(makeCtx(), {
        runDate: '2025-06-01',
      });

      expect(result).toBeDefined();
      expect(result.totalProfilesCount).toBe(0);
      expect(result.attemptCount).toBe(0);
    });
  });

  describe('retryFailedAutopay', () => {
    beforeEach(resetMocks);

    it('schedules retry for attempt with attempt < 3', async () => {
      const failedAttempt = {
        id: 'attempt_001',
        runId: 'run_001',
        membershipAccountId: 'acct_001',
        paymentMethodId: 'pm_001',
        amountCents: 5000,
        status: 'failed',
        attemptNumber: 1,
      };
      const newAttempt = {
        id: 'ulid_test_001',
        runId: 'run_001',
        membershipAccountId: 'acct_001',
        status: 'pending',
        attemptNumber: 2,
      };

      // Select 1: find existing failed attempt
      mockSelectReturns.mockReturnValueOnce([failedAttempt]);
      // Insert 1: create new retry attempt
      mockInsertReturns.mockReturnValueOnce([newAttempt]);

      const result = await retryFailedAutopay(makeCtx(), {
        attemptId: 'attempt_001',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ulid_test_001');
      expect(result.attemptNumber).toBe(2);
    });

    it('marks permanently failed for attempt >= 3', async () => {
      const failedAttempt = {
        id: 'attempt_003',
        runId: 'run_001',
        membershipAccountId: 'acct_001',
        paymentMethodId: 'pm_001',
        amountCents: 5000,
        status: 'failed',
        attemptNumber: 3,
      };

      // Select 1: find the failed attempt
      mockSelectReturns.mockReturnValueOnce([failedAttempt]);

      const result = await retryFailedAutopay(makeCtx(), {
        attemptId: 'attempt_003',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('permanently_failed');
      expect(result.dunningLevel).toBe('final_notice');
    });

    it('throws NotFoundError for unknown attempt', async () => {
      // Select 1: attempt not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        retryFailedAutopay(makeCtx(), {
          attemptId: 'nonexistent',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('applyLateFee', () => {
    beforeEach(resetMocks);

    it('creates late fee assessment record', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const assessment = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
        assessmentDate: '2025-06-01',
        overdueAmountCents: 50000,
        feeAmountCents: 750,
        waived: false,
      };

      // Select 1: membership account lookup
      mockSelectReturns.mockReturnValueOnce([account]);
      // Insert 1: create assessment
      mockInsertReturns.mockReturnValueOnce([assessment]);

      const result = await applyLateFee(makeCtx(), {
        membershipAccountId: 'acct_001',
        overdueAmountCents: 50000,
        feeAmountCents: 750,
        assessmentDate: '2025-06-01',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ulid_test_001');
      expect(result.feeAmountCents).toBe(750);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('throws NotFoundError when membership account does not exist', async () => {
      // Select 1: account not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        applyLateFee(makeCtx(), {
          membershipAccountId: 'nonexistent',
          overdueAmountCents: 50000,
          feeAmountCents: 750,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('setChargingHold', () => {
    beforeEach(resetMocks);

    it('creates hold record and updates holdCharging on account', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const hold = {
        id: 'ulid_test_001',
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
        holdType: 'charging',
        reason: 'Delinquent 60+ days',
        placedBy: 'user_001',
        isActive: true,
      };

      // Select 1: membership account lookup
      mockSelectReturns.mockReturnValueOnce([account]);
      // Insert 1: create hold
      mockInsertReturns.mockReturnValueOnce([hold]);

      const result = await setChargingHold(makeCtx(), {
        membershipAccountId: 'acct_001',
        reason: 'Delinquent 60+ days',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ulid_test_001');
      expect(result.holdType).toBe('charging');
      expect(result.isActive).toBe(true);
      // Verify the account update was called (holdCharging = true)
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('throws NotFoundError when membership account does not exist', async () => {
      // Select 1: account not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        setChargingHold(makeCtx(), {
          membershipAccountId: 'nonexistent',
          reason: 'Delinquent',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('liftHold', () => {
    beforeEach(resetMocks);

    it('lifts hold (sets is_active=false, lifted fields)', async () => {
      const hold = {
        id: 'hold_001',
        membershipAccountId: 'acct_001',
        holdType: 'charging',
        isActive: true,
      };

      // Select 1: hold lookup
      mockSelectReturns.mockReturnValueOnce([hold]);
      // Select 2: remaining active holds check (none remaining)
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await liftHold(makeCtx(), {
        holdId: 'hold_001',
        reason: 'Payment received',
      });

      expect(result).toBeDefined();
      expect(result.holdId).toBe('hold_001');
      expect(result.status).toBe('lifted');
      expect(result.accountHoldCleared).toBe(true);
      // Verify the update was called to set isActive=false
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('throws NotFoundError for unknown hold', async () => {
      // Select 1: hold not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        liftHold(makeCtx(), {
          holdId: 'nonexistent',
          reason: 'Payment received',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('freezeMembership', () => {
    beforeEach(resetMocks);

    it('sets account status to frozen', async () => {
      const account = {
        id: 'acct_001',
        status: 'active',
        accountNumber: 'M-10001',
        primaryMemberId: 'member_001',
      };

      // Select 1: account lookup
      mockSelectReturns.mockReturnValueOnce([account]);

      const result = await freezeMembership(makeCtx(), {
        membershipAccountId: 'acct_001',
        reason: 'Non-payment for 90+ days',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('frozen');
      expect(result.previousStatus).toBe('active');
      expect(result.reason).toBe('Non-payment for 90+ days');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('rejects non-active/non-suspended accounts', async () => {
      const account = {
        id: 'acct_001',
        status: 'closed',
        accountNumber: 'M-10001',
        primaryMemberId: 'member_001',
      };

      // Select 1: account with status 'closed'
      mockSelectReturns.mockReturnValueOnce([account]);

      await expect(
        freezeMembership(makeCtx(), {
          membershipAccountId: 'acct_001',
          reason: 'Attempting to freeze closed account',
        }),
      ).rejects.toThrow(/only active or suspended/i);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 9 — Queries', () => {
  describe('getAutopayProfile', () => {
    beforeEach(resetMocks);

    it('returns profile data when found', async () => {
      const profileRow = {
        id: 'profile_001',
        membershipAccountId: 'acct_001',
        paymentMethodId: 'pm_001',
        strategy: 'full_balance',
        fixedAmountCents: 0,
        selectedAccountTypes: ['dues', 'minimums'],
        isActive: true,
        lastRunAt: new Date('2025-05-15T10:00:00Z'),
        nextRunAt: new Date('2025-06-01T10:00:00Z'),
      };

      // Select 1: profile found
      mockSelectReturns.mockReturnValueOnce([profileRow]);

      const result = await getAutopayProfile({
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('profile_001');
      expect(result!.strategy).toBe('full_balance');
      expect(result!.isActive).toBe(true);
      expect(result!.selectedAccountTypes).toEqual(['dues', 'minimums']);
      expect(result!.lastRunAt).toBe('2025-05-15T10:00:00.000Z');
    });

    it('returns null when not found', async () => {
      // Select 1: no profile
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getAutopayProfile({
        tenantId: TENANT_A,
        membershipAccountId: 'nonexistent',
      });

      expect(result).toBeNull();
    });
  });

  describe('getRiskDashboard', () => {
    beforeEach(resetMocks);

    it('returns counts and lists', async () => {
      // Execute 1: status count aggregation
      mockExecute.mockResolvedValueOnce([
        { status: 'active', cnt: 50 },
        { status: 'frozen', cnt: 3 },
        { status: 'suspended', cnt: 2 },
      ]);
      // Execute 2: accounts with holdCharging = true
      mockExecute.mockResolvedValueOnce([{ cnt: 5 }]);
      // Select 1: active holds (via orderBy terminal)
      mockSelectReturns.mockReturnValueOnce([
        {
          id: 'hold_001',
          membershipAccountId: 'acct_001',
          holdType: 'charging',
          reason: 'Late payment',
          placedBy: 'user_001',
          placedAt: new Date('2025-05-20T10:00:00Z'),
        },
      ]);
      // Select 2: recent late fees (via orderBy terminal)
      mockSelectReturns.mockReturnValueOnce([
        {
          id: 'lf_001',
          membershipAccountId: 'acct_002',
          assessmentDate: '2025-05-15',
          overdueAmountCents: 10000,
          feeAmountCents: 150,
          waived: false,
        },
      ]);

      const result = await getRiskDashboard({
        tenantId: TENANT_A,
      });

      expect(result.totalActiveAccounts).toBe(50);
      expect(result.frozenAccounts).toBe(3);
      expect(result.suspendedAccounts).toBe(2);
      expect(result.accountsWithHolds).toBe(5);
      expect(result.activeHolds).toHaveLength(1);
      expect(result.activeHolds[0]!.holdType).toBe('charging');
      expect(result.recentLateFees).toHaveLength(1);
      expect(result.recentLateFees[0]!.feeAmountCents).toBe(150);
    });

    it('returns zeros and empty arrays when no data', async () => {
      // Execute 1: no accounts
      mockExecute.mockResolvedValueOnce([]);
      // Execute 2: no holds
      mockExecute.mockResolvedValueOnce([{ cnt: 0 }]);
      // Select 1: no active holds
      mockSelectReturns.mockReturnValueOnce([]);
      // Select 2: no late fees
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getRiskDashboard({
        tenantId: TENANT_A,
      });

      expect(result.totalActiveAccounts).toBe(0);
      expect(result.frozenAccounts).toBe(0);
      expect(result.suspendedAccounts).toBe(0);
      expect(result.accountsWithHolds).toBe(0);
      expect(result.activeHolds).toEqual([]);
      expect(result.recentLateFees).toEqual([]);
    });
  });

  describe('getCollectionsTimeline', () => {
    beforeEach(resetMocks);

    it('returns merged timeline entries sorted by date', async () => {
      // Select 1: autopay attempts (via orderBy terminal)
      mockSelectReturns.mockReturnValueOnce([
        {
          id: 'att_001',
          amountCents: 5000,
          status: 'success',
          attemptNumber: 1,
          failureReason: null,
          createdAt: new Date('2025-06-03T10:00:00Z'),
        },
      ]);
      // Select 2: late fee assessments (via orderBy terminal)
      mockSelectReturns.mockReturnValueOnce([
        {
          id: 'lf_001',
          assessmentDate: '2025-06-02',
          overdueAmountCents: 10000,
          feeAmountCents: 150,
          waived: false,
        },
      ]);
      // Select 3: membership holds (via orderBy terminal)
      mockSelectReturns.mockReturnValueOnce([
        {
          id: 'hold_001',
          holdType: 'charging',
          reason: 'Delinquent',
          placedAt: new Date('2025-06-01T10:00:00Z'),
          liftedAt: null,
          liftedReason: null,
          isActive: true,
        },
      ]);

      const result = await getCollectionsTimeline({
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
      });

      expect(result.length).toBe(3);
      // Most recent first (sorted descending)
      expect(result[0]!.type).toBe('autopay_attempt');
      expect(result[0]!.description).toContain('succeeded');
      expect(result[1]!.type).toBe('late_fee');
      expect(result[1]!.description).toContain('assessed');
      expect(result[2]!.type).toBe('hold_placed');
      expect(result[2]!.description).toContain('charging hold placed');
    });

    it('returns empty array when no events', async () => {
      // Select 1: no autopay attempts
      mockSelectReturns.mockReturnValueOnce([]);
      // Select 2: no late fees
      mockSelectReturns.mockReturnValueOnce([]);
      // Select 3: no holds
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getCollectionsTimeline({
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
      });

      expect(result).toEqual([]);
    });
  });
});
