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
    id: 'id', tenantId: 'tenant_id', accountNumber: 'account_number',
    status: 'status', startDate: 'start_date', endDate: 'end_date',
    primaryMemberId: 'primary_member_id', billingEmail: 'billing_email',
    billingAddressJson: 'billing_address_json', statementDayOfMonth: 'statement_day_of_month',
    paymentTermsDays: 'payment_terms_days', autopayEnabled: 'autopay_enabled',
    creditLimitCents: 'credit_limit_cents', holdCharging: 'hold_charging',
    billingAccountId: 'billing_account_id', customerId: 'customer_id',
    notes: 'notes', metadata: 'metadata', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipAccountingSettings: {
    id: 'id', tenantId: 'tenant_id', clubModel: 'club_model',
    recognitionPolicy: 'recognition_policy',
    defaultDuesRevenueAccountId: 'default_dues_revenue_account_id',
    defaultDeferredRevenueAccountId: 'default_deferred_revenue_account_id',
    defaultInitiationRevenueAccountId: 'default_initiation_revenue_account_id',
    defaultNotesReceivableAccountId: 'default_notes_receivable_account_id',
    defaultInterestIncomeAccountId: 'default_interest_income_account_id',
    defaultCapitalContributionAccountId: 'default_capital_contribution_account_id',
    defaultBadDebtAccountId: 'default_bad_debt_account_id',
    defaultLateFeeAccountId: 'default_late_fee_account_id',
    defaultMinimumRevenueAccountId: 'default_minimum_revenue_account_id',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  initiationContracts: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    contractDate: 'contract_date', initiationFeeCents: 'initiation_fee_cents',
    downPaymentCents: 'down_payment_cents', financedPrincipalCents: 'financed_principal_cents',
    aprBps: 'apr_bps', termMonths: 'term_months', paymentDayOfMonth: 'payment_day_of_month',
    status: 'status', recognitionPolicySnapshot: 'recognition_policy_snapshot',
    glInitiationRevenueAccountId: 'gl_initiation_revenue_account_id',
    glNotesReceivableAccountId: 'gl_notes_receivable_account_id',
    glInterestIncomeAccountId: 'gl_interest_income_account_id',
    glCapitalContributionAccountId: 'gl_capital_contribution_account_id',
    glDeferredRevenueAccountId: 'gl_deferred_revenue_account_id',
    paidPrincipalCents: 'paid_principal_cents', paidInterestCents: 'paid_interest_cents',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  initiationAmortSchedule: {
    id: 'id', tenantId: 'tenant_id', contractId: 'contract_id',
    periodIndex: 'period_index', dueDate: 'due_date', paymentCents: 'payment_cents',
    principalCents: 'principal_cents', interestCents: 'interest_cents',
    status: 'status', arTransactionId: 'ar_transaction_id',
    billedAt: 'billed_at', paidAt: 'paid_at',
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
  sql: Object.assign(vi.fn(), { raw: vi.fn(), join: vi.fn() }),
}));

// ── Imports ─────────────────────────────────────────────────────────

// Pure helper functions — real implementations, no mocks
import {
  generateAmortSchedule,
  computePayoffQuote,
  recalculateAfterExtraPrincipal,
} from '../helpers/amortization';

// Commands (use mocked DB)
import { createInitiationContract } from '../commands/create-initiation-contract';
import { billInitiationInstallment } from '../commands/bill-initiation-installment';
import { recordExtraPrincipal } from '../commands/record-extra-principal';
import { cancelInitiationContract } from '../commands/cancel-initiation-contract';
import { computePayoffQuoteCommand } from '../commands/compute-payoff-quote';

// Queries (use mocked DB)
import { getInitiationSchedule } from '../queries/get-initiation-schedule';
import { getInitiationSummary } from '../queries/get-initiation-summary';
import { getDeferredRevenueSchedule } from '../queries/get-deferred-revenue-schedule';

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

function makeContractRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contract_001',
    tenantId: TENANT_A,
    membershipAccountId: 'acct_001',
    contractDate: '2025-01-15',
    initiationFeeCents: 1200000, // $12,000
    downPaymentCents: 200000, // $2,000
    financedPrincipalCents: 1000000, // $10,000
    aprBps: 0,
    termMonths: 12,
    paymentDayOfMonth: 15,
    status: 'active',
    recognitionPolicySnapshot: { clubModel: 'for_profit', snapshotAt: '2025-01-15T00:00:00.000Z' },
    glInitiationRevenueAccountId: 'gl_rev_001',
    glNotesReceivableAccountId: 'gl_nr_001',
    glInterestIncomeAccountId: null,
    glCapitalContributionAccountId: null,
    glDeferredRevenueAccountId: null,
    paidPrincipalCents: 0,
    paidInterestCents: 0,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    ...overrides,
  };
}

function makeSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settings_001',
    tenantId: TENANT_A,
    clubModel: 'for_profit',
    recognitionPolicy: null,
    defaultDuesRevenueAccountId: 'gl_dues_001',
    defaultDeferredRevenueAccountId: 'gl_def_001',
    defaultInitiationRevenueAccountId: 'gl_rev_001',
    defaultNotesReceivableAccountId: 'gl_nr_001',
    defaultInterestIncomeAccountId: 'gl_int_001',
    defaultCapitalContributionAccountId: 'gl_cap_001',
    defaultBadDebtAccountId: null,
    defaultLateFeeAccountId: null,
    defaultMinimumRevenueAccountId: null,
    ...overrides,
  };
}

function makeScheduleEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched_001',
    tenantId: TENANT_A,
    contractId: 'contract_001',
    periodIndex: 0,
    dueDate: '2025-01-15',
    paymentCents: 83334,
    principalCents: 83334,
    interestCents: 0,
    status: 'scheduled',
    arTransactionId: null,
    billedAt: null,
    paidAt: null,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Amortization Helper Tests (pure functions — no mocks needed)
// ═══════════════════════════════════════════════════════════════════

describe('Session 8 — Amortization Helpers', () => {
  describe('generateAmortSchedule', () => {
    it('returns empty for 0 principal', () => {
      const result = generateAmortSchedule(0, 0, 12, '2025-01-15', 15);
      expect(result).toEqual([]);
    });

    it('returns empty for 0 term months', () => {
      const result = generateAmortSchedule(100000, 0, 0, '2025-01-15', 15);
      expect(result).toEqual([]);
    });

    it('generates equal division for 0% APR', () => {
      // $10,000 financed over 12 months at 0% = $833.33/mo (last absorbs remainder)
      const schedule = generateAmortSchedule(1000000, 0, 12, '2025-01-15', 15);

      expect(schedule).toHaveLength(12);
      // All entries have 0 interest at 0%
      for (const entry of schedule) {
        expect(entry.interestCents).toBe(0);
        expect(entry.principalCents).toBe(entry.paymentCents);
      }
    });

    it('sum of principalCents equals original principal at 0% APR', () => {
      const principal = 1000000;
      const schedule = generateAmortSchedule(principal, 0, 12, '2025-01-15', 15);

      const totalPrincipal = schedule.reduce((sum, e) => sum + e.principalCents, 0);
      expect(totalPrincipal).toBe(principal);
    });

    it('last payment absorbs remainder at 0% APR', () => {
      // 1000001 / 12 = 83333.416... => base = 83333, remainder = 1000001 - 83333*12 = 5
      const schedule = generateAmortSchedule(1000001, 0, 12, '2025-01-15', 15);

      const basePayment = Math.floor(1000001 / 12);
      const remainder = 1000001 - basePayment * 12;

      // Non-last entries get the base payment
      for (let i = 0; i < 11; i++) {
        expect(schedule[i]!.paymentCents).toBe(basePayment);
      }
      // Last entry absorbs the remainder
      expect(schedule[11]!.paymentCents).toBe(basePayment + remainder);
    });

    it('generates schedule with interest for 5% APR', () => {
      const schedule = generateAmortSchedule(1000000, 500, 12, '2025-01-15', 15);

      expect(schedule).toHaveLength(12);
      // First entry should have non-zero interest
      expect(schedule[0]!.interestCents).toBeGreaterThan(0);
      // Interest should decrease over time (amortizing)
      expect(schedule[0]!.interestCents).toBeGreaterThan(schedule[10]!.interestCents);
    });

    it('sum of principalCents equals original principal with interest', () => {
      const principal = 1000000;
      const schedule = generateAmortSchedule(principal, 500, 12, '2025-01-15', 15);

      const totalPrincipal = schedule.reduce((sum, e) => sum + e.principalCents, 0);
      expect(totalPrincipal).toBe(principal);
    });

    it('advances dates correctly with paymentDayOfMonth', () => {
      const schedule = generateAmortSchedule(100000, 0, 3, '2025-03-15', 15);

      expect(schedule[0]!.dueDate).toBe('2025-03-15');
      expect(schedule[1]!.dueDate).toBe('2025-04-15');
      expect(schedule[2]!.dueDate).toBe('2025-05-15');
    });

    it('clamps day-of-month for short months', () => {
      // Payment on the 31st — February should clamp to 28
      const schedule = generateAmortSchedule(100000, 0, 3, '2025-01-31', 31);

      expect(schedule[0]!.dueDate).toBe('2025-01-31');
      expect(schedule[1]!.dueDate).toBe('2025-02-28');
      expect(schedule[2]!.dueDate).toBe('2025-03-31');
    });

    it('period indexes are sequential starting from 0', () => {
      const schedule = generateAmortSchedule(100000, 0, 6, '2025-01-15', 15);

      for (let i = 0; i < schedule.length; i++) {
        expect(schedule[i]!.periodIndex).toBe(i);
      }
    });
  });

  describe('computePayoffQuote', () => {
    it('returns 0 for 0 remaining principal', () => {
      const quote = computePayoffQuote(0, 500, '2025-01-15', '2025-06-15');
      expect(quote.payoffAmountCents).toBe(0);
      expect(quote.accruedInterestCents).toBe(0);
      expect(quote.principalCents).toBe(0);
    });

    it('returns just principal for 0% APR', () => {
      const quote = computePayoffQuote(500000, 0, '2025-01-15', '2025-06-15');
      expect(quote.payoffAmountCents).toBe(500000);
      expect(quote.accruedInterestCents).toBe(0);
      expect(quote.principalCents).toBe(500000);
    });

    it('returns principal + accrued interest for non-zero APR', () => {
      const quote = computePayoffQuote(1000000, 500, '2025-01-15', '2025-02-14');

      // 5% APR, daily rate = 0.05/365 ~= 0.000136986
      // 30 days of accrual on $10,000 => ~$41.10
      expect(quote.principalCents).toBe(1000000);
      expect(quote.accruedInterestCents).toBeGreaterThan(0);
      expect(quote.payoffAmountCents).toBe(quote.principalCents + quote.accruedInterestCents);
    });

    it('accrued interest increases with elapsed time', () => {
      const quote30 = computePayoffQuote(1000000, 500, '2025-01-15', '2025-02-14');
      const quote60 = computePayoffQuote(1000000, 500, '2025-01-15', '2025-03-16');

      expect(quote60.accruedInterestCents).toBeGreaterThan(quote30.accruedInterestCents);
    });
  });

  describe('recalculateAfterExtraPrincipal', () => {
    it('delegates to generateAmortSchedule with new principal', () => {
      const result = recalculateAfterExtraPrincipal(
        500000, // remaining after extra payment
        0,
        6, // remaining term
        '2025-07-15',
        15,
      );

      const direct = generateAmortSchedule(500000, 0, 6, '2025-07-15', 15);

      expect(result).toEqual(direct);
    });

    it('returns empty when remaining principal is 0', () => {
      const result = recalculateAfterExtraPrincipal(0, 0, 6, '2025-07-15', 15);
      expect(result).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 8 — Commands', () => {
  describe('createInitiationContract', () => {
    beforeEach(resetMocks);

    it('creates contract and schedule entries', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const settings = makeSettingsRow();
      const createdContract = makeContractRow();

      // Select 1: membership account lookup
      mockSelectReturns.mockReturnValueOnce([account]);
      // Select 2: accounting settings
      mockSelectReturns.mockReturnValueOnce([settings]);
      // Insert 1: contract row
      mockInsertReturns.mockReturnValueOnce([createdContract]);
      // Insert 2: schedule entries (batch insert, no returning needed)
      mockInsertReturns.mockReturnValueOnce(undefined);

      const result = await createInitiationContract(makeCtx(), {
        membershipAccountId: 'acct_001',
        contractDate: '2025-01-15',
        initiationFeeCents: 1200000,
        downPaymentCents: 200000,
        termMonths: 12,
        paymentDayOfMonth: 15,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('contract_001');
    });

    it('validates membership account exists', async () => {
      // Empty select = account not found
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        createInitiationContract(makeCtx(), {
          membershipAccountId: 'nonexistent',
          contractDate: '2025-01-15',
          initiationFeeCents: 1200000,
          downPaymentCents: 200000,
          termMonths: 12,
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('rejects when financed principal is not positive', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const settings = makeSettingsRow();

      mockSelectReturns.mockReturnValueOnce([account]);
      mockSelectReturns.mockReturnValueOnce([settings]);

      // initiationFeeCents = downPaymentCents = 1000 => financedPrincipal = 0
      await expect(
        createInitiationContract(makeCtx(), {
          membershipAccountId: 'acct_001',
          contractDate: '2025-01-15',
          initiationFeeCents: 1000,
          downPaymentCents: 1000,
          termMonths: 12,
        }),
      ).rejects.toThrow(/greater than zero/i);
    });

    it('snapshots recognition policy from settings', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const settings = makeSettingsRow({ clubModel: 'member_owned', recognitionPolicy: 'straight_line' });
      const createdContract = makeContractRow({
        recognitionPolicySnapshot: {
          clubModel: 'member_owned',
          recognitionPolicy: 'straight_line',
        },
      });

      mockSelectReturns.mockReturnValueOnce([account]);
      mockSelectReturns.mockReturnValueOnce([settings]);
      mockInsertReturns.mockReturnValueOnce([createdContract]);
      mockInsertReturns.mockReturnValueOnce(undefined);

      const result = await createInitiationContract(makeCtx(), {
        membershipAccountId: 'acct_001',
        contractDate: '2025-01-15',
        initiationFeeCents: 1200000,
        downPaymentCents: 200000,
        termMonths: 12,
      });

      expect(result).toBeDefined();
      // Contract was inserted — verify via mockInsert having been called
      expect(mockInsert).toHaveBeenCalled();
    });

    it('calls auditLog after creation', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const settings = makeSettingsRow();
      const createdContract = makeContractRow();

      mockSelectReturns.mockReturnValueOnce([account]);
      mockSelectReturns.mockReturnValueOnce([settings]);
      mockInsertReturns.mockReturnValueOnce([createdContract]);
      mockInsertReturns.mockReturnValueOnce(undefined);

      await createInitiationContract(makeCtx(), {
        membershipAccountId: 'acct_001',
        contractDate: '2025-01-15',
        initiationFeeCents: 1200000,
        downPaymentCents: 200000,
        termMonths: 12,
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
        'membership.initiation.contract.created',
        'initiation_contract',
        'contract_001',
      );
    });

    it('uses default GL accounts from settings when not specified', async () => {
      const account = { id: 'acct_001', status: 'active' };
      const settings = makeSettingsRow({
        defaultInitiationRevenueAccountId: 'gl_default_rev',
        defaultNotesReceivableAccountId: 'gl_default_nr',
      });
      const createdContract = makeContractRow({
        glInitiationRevenueAccountId: 'gl_default_rev',
        glNotesReceivableAccountId: 'gl_default_nr',
      });

      mockSelectReturns.mockReturnValueOnce([account]);
      mockSelectReturns.mockReturnValueOnce([settings]);
      mockInsertReturns.mockReturnValueOnce([createdContract]);
      mockInsertReturns.mockReturnValueOnce(undefined);

      const result = await createInitiationContract(makeCtx(), {
        membershipAccountId: 'acct_001',
        contractDate: '2025-01-15',
        initiationFeeCents: 1200000,
        downPaymentCents: 200000,
        termMonths: 12,
      });

      expect(result).toBeDefined();
      expect(mockValues).toHaveBeenCalled();
    });
  });

  describe('billInitiationInstallment', () => {
    beforeEach(resetMocks);

    it('marks schedule entry as billed', async () => {
      const contract = { id: 'contract_001', status: 'active', membershipAccountId: 'acct_001' };
      const scheduleEntry = makeScheduleEntryRow({ status: 'scheduled' });

      // Select 1: contract lookup
      mockSelectReturns.mockReturnValueOnce([contract]);
      // Select 2: schedule entry lookup
      mockSelectReturns.mockReturnValueOnce([scheduleEntry]);

      const result = await billInitiationInstallment(makeCtx(), {
        contractId: 'contract_001',
        periodIndex: 0,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('billed');
      expect(result.contractId).toBe('contract_001');
      expect(result.periodIndex).toBe(0);
    });

    it('rejects if contract is not active', async () => {
      const contract = { id: 'contract_001', status: 'cancelled', membershipAccountId: 'acct_001' };

      mockSelectReturns.mockReturnValueOnce([contract]);

      await expect(
        billInitiationInstallment(makeCtx(), {
          contractId: 'contract_001',
          periodIndex: 0,
        }),
      ).rejects.toThrow(/status/i);
    });

    it('rejects if already billed (409)', async () => {
      const contract = { id: 'contract_001', status: 'active', membershipAccountId: 'acct_001' };
      const scheduleEntry = makeScheduleEntryRow({ status: 'billed' });

      mockSelectReturns.mockReturnValueOnce([contract]);
      mockSelectReturns.mockReturnValueOnce([scheduleEntry]);

      await expect(
        billInitiationInstallment(makeCtx(), {
          contractId: 'contract_001',
          periodIndex: 0,
        }),
      ).rejects.toThrow(/already/i);
    });

    it('throws NotFoundError when contract not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        billInitiationInstallment(makeCtx(), {
          contractId: 'nonexistent',
          periodIndex: 0,
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('throws NotFoundError when schedule entry not found', async () => {
      const contract = { id: 'contract_001', status: 'active', membershipAccountId: 'acct_001' };

      mockSelectReturns.mockReturnValueOnce([contract]);
      mockSelectReturns.mockReturnValueOnce([]); // no schedule entry

      await expect(
        billInitiationInstallment(makeCtx(), {
          contractId: 'contract_001',
          periodIndex: 99,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('recordExtraPrincipal', () => {
    beforeEach(resetMocks);

    it('updates paidPrincipalCents on the contract', async () => {
      const contract = makeContractRow({
        financedPrincipalCents: 1000000,
        paidPrincipalCents: 200000,
        aprBps: 0,
      });

      mockSelectReturns.mockReturnValueOnce([contract]);

      const result = await recordExtraPrincipal(makeCtx(), {
        contractId: 'contract_001',
        amountCents: 300000,
      });

      expect(result).toBeDefined();
      expect(result.paidPrincipalCents).toBe(500000); // 200000 + 300000
      expect(result.remainingPrincipalCents).toBe(500000); // 1000000 - 500000
      expect(result.status).toBe('active');
    });

    it('rejects amount exceeding remaining principal', async () => {
      const contract = makeContractRow({
        financedPrincipalCents: 1000000,
        paidPrincipalCents: 900000,
      });

      mockSelectReturns.mockReturnValueOnce([contract]);

      await expect(
        recordExtraPrincipal(makeCtx(), {
          contractId: 'contract_001',
          amountCents: 200000, // only 100000 remaining
        }),
      ).rejects.toThrow(/exceeds remaining/i);
    });

    it('sets status to paid_off when fully paid', async () => {
      const contract = makeContractRow({
        financedPrincipalCents: 1000000,
        paidPrincipalCents: 700000,
      });

      mockSelectReturns.mockReturnValueOnce([contract]);

      const result = await recordExtraPrincipal(makeCtx(), {
        contractId: 'contract_001',
        amountCents: 300000, // exactly remaining amount
      });

      expect(result.status).toBe('paid_off');
      expect(result.remainingPrincipalCents).toBe(0);
    });

    it('rejects when contract is not active', async () => {
      const contract = makeContractRow({ status: 'paid_off' });

      mockSelectReturns.mockReturnValueOnce([contract]);

      await expect(
        recordExtraPrincipal(makeCtx(), {
          contractId: 'contract_001',
          amountCents: 100000,
        }),
      ).rejects.toThrow(/status/i);
    });

    it('throws NotFoundError when contract not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        recordExtraPrincipal(makeCtx(), {
          contractId: 'nonexistent',
          amountCents: 100000,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('cancelInitiationContract', () => {
    beforeEach(resetMocks);

    it('sets status to cancelled', async () => {
      const contract = makeContractRow({ status: 'active', financedPrincipalCents: 1000000, paidPrincipalCents: 300000 });

      mockSelectReturns.mockReturnValueOnce([contract]);

      const result = await cancelInitiationContract(makeCtx(), {
        contractId: 'contract_001',
        reason: 'Member resigned',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('cancelled');
      expect(result.reason).toBe('Member resigned');
    });

    it('rejects if contract is not active', async () => {
      const contract = makeContractRow({ status: 'paid_off' });

      mockSelectReturns.mockReturnValueOnce([contract]);

      await expect(
        cancelInitiationContract(makeCtx(), {
          contractId: 'contract_001',
          reason: 'Test reason',
        }),
      ).rejects.toThrow(/only active/i);
    });

    it('throws NotFoundError when contract not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        cancelInitiationContract(makeCtx(), {
          contractId: 'nonexistent',
          reason: 'Test reason',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('calls auditLog after cancellation', async () => {
      const contract = makeContractRow({ status: 'active' });

      mockSelectReturns.mockReturnValueOnce([contract]);

      await cancelInitiationContract(makeCtx(), {
        contractId: 'contract_001',
        reason: 'Member resigned',
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
        'membership.initiation.contract.cancelled',
        'initiation_contract',
        'contract_001',
      );
    });
  });

  describe('computePayoffQuoteCommand', () => {
    beforeEach(resetMocks);

    it('returns payoff with accrued interest', async () => {
      const contract = makeContractRow({
        financedPrincipalCents: 1000000,
        paidPrincipalCents: 200000,
        aprBps: 500,
        contractDate: '2025-01-15',
      });
      const lastPaidEntry = {
        dueDate: '2025-03-15',
        paidAt: '2025-03-15',
      };

      // Select 1: contract lookup
      mockSelectReturns.mockReturnValueOnce([contract]);
      // Select 2: last paid schedule entry
      mockSelectReturns.mockReturnValueOnce([lastPaidEntry]);

      const result = await computePayoffQuoteCommand(makeCtx(), {
        contractId: 'contract_001',
        payoffDate: '2025-04-15',
      });

      expect(result.contractId).toBe('contract_001');
      expect(result.payoffDate).toBe('2025-04-15');
      expect(result.principalCents).toBe(800000); // 1000000 - 200000
      expect(result.accruedInterestCents).toBeGreaterThan(0);
      expect(result.payoffAmountCents).toBe(result.principalCents + result.accruedInterestCents);
    });

    it('uses contract date when no payments made', async () => {
      const contract = makeContractRow({
        financedPrincipalCents: 1000000,
        paidPrincipalCents: 0,
        aprBps: 500,
        contractDate: '2025-01-15',
      });

      // Select 1: contract lookup
      mockSelectReturns.mockReturnValueOnce([contract]);
      // Select 2: no paid entries
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await computePayoffQuoteCommand(makeCtx(), {
        contractId: 'contract_001',
        payoffDate: '2025-03-15',
      });

      // Interest accrued from contract date (Jan 15) to payoff (Mar 15) = 59 days
      expect(result.principalCents).toBe(1000000);
      expect(result.accruedInterestCents).toBeGreaterThan(0);
    });

    it('returns 0% APR payoff = just principal', async () => {
      const contract = makeContractRow({
        financedPrincipalCents: 1000000,
        paidPrincipalCents: 400000,
        aprBps: 0,
        contractDate: '2025-01-15',
      });

      mockSelectReturns.mockReturnValueOnce([contract]);
      mockSelectReturns.mockReturnValueOnce([]); // no paid entries

      const result = await computePayoffQuoteCommand(makeCtx(), {
        contractId: 'contract_001',
        payoffDate: '2025-06-15',
      });

      expect(result.payoffAmountCents).toBe(600000); // 1000000 - 400000
      expect(result.accruedInterestCents).toBe(0);
    });

    it('throws NotFoundError when contract not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        computePayoffQuoteCommand(makeCtx(), {
          contractId: 'nonexistent',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('rejects for non-active contracts', async () => {
      const contract = makeContractRow({ status: 'cancelled' });

      mockSelectReturns.mockReturnValueOnce([contract]);

      await expect(
        computePayoffQuoteCommand(makeCtx(), {
          contractId: 'contract_001',
        }),
      ).rejects.toThrow(/status/i);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 8 — Queries', () => {
  describe('getInitiationSchedule', () => {
    beforeEach(resetMocks);

    it('returns contract with ordered schedule entries', async () => {
      const contractRow = {
        id: 'contract_001',
        membershipAccountId: 'acct_001',
        contractDate: '2025-01-15',
        initiationFeeCents: 1200000,
        downPaymentCents: 200000,
        financedPrincipalCents: 1000000,
        aprBps: 0,
        termMonths: 12,
        status: 'active',
        paidPrincipalCents: 0,
        paidInterestCents: 0,
        recognitionPolicySnapshot: { clubModel: 'for_profit' },
      };

      const scheduleRows = [
        makeScheduleEntryRow({ periodIndex: 0, dueDate: '2025-01-15' }),
        makeScheduleEntryRow({ id: 'sched_002', periodIndex: 1, dueDate: '2025-02-15' }),
      ];

      // Select 1: contract
      mockSelectReturns.mockReturnValueOnce([contractRow]);
      // Select 2: schedule entries (terminal via .orderBy)
      mockSelectReturns.mockReturnValueOnce(scheduleRows);

      const result = await getInitiationSchedule({
        tenantId: TENANT_A,
        contractId: 'contract_001',
      });

      expect(result.contract.id).toBe('contract_001');
      expect(result.contract.financedPrincipalCents).toBe(1000000);
      expect(result.schedule).toHaveLength(2);
      expect(result.schedule[0]!.periodIndex).toBe(0);
      expect(result.schedule[1]!.periodIndex).toBe(1);
    });

    it('throws NotFoundError when contract not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        getInitiationSchedule({
          tenantId: TENANT_A,
          contractId: 'nonexistent',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('getInitiationSummary', () => {
    beforeEach(resetMocks);

    it('returns summaries with progress percentage and next payment', async () => {
      const contractRow = {
        id: 'contract_001',
        contractDate: '2025-01-15',
        initiationFeeCents: 1200000,
        downPaymentCents: 200000,
        financedPrincipalCents: 1000000,
        aprBps: 0,
        termMonths: 12,
        status: 'active',
        paidPrincipalCents: 500000,
        paidInterestCents: 0,
      };
      const nextPaymentRow = {
        dueDate: '2025-07-15',
        paymentCents: 83334,
      };

      // Select 1: contracts for the account
      mockSelectReturns.mockReturnValueOnce([contractRow]);
      // Select 2: next scheduled payment for contract_001
      mockSelectReturns.mockReturnValueOnce([nextPaymentRow]);

      const summaries = await getInitiationSummary({
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
      });

      expect(summaries).toHaveLength(1);
      expect(summaries[0]!.id).toBe('contract_001');
      expect(summaries[0]!.remainingPrincipalCents).toBe(500000);
      expect(summaries[0]!.progressPercent).toBe(50); // 500000/1000000 * 100
      expect(summaries[0]!.nextPaymentDate).toBe('2025-07-15');
      expect(summaries[0]!.nextPaymentCents).toBe(83334);
    });

    it('returns null next payment when all are billed/paid', async () => {
      const contractRow = {
        id: 'contract_001',
        contractDate: '2025-01-15',
        initiationFeeCents: 1200000,
        downPaymentCents: 200000,
        financedPrincipalCents: 1000000,
        aprBps: 0,
        termMonths: 12,
        status: 'paid_off',
        paidPrincipalCents: 1000000,
        paidInterestCents: 0,
      };

      // Select 1: contracts
      mockSelectReturns.mockReturnValueOnce([contractRow]);
      // Select 2: no scheduled payments remain
      mockSelectReturns.mockReturnValueOnce([]);

      const summaries = await getInitiationSummary({
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
      });

      expect(summaries[0]!.nextPaymentDate).toBeNull();
      expect(summaries[0]!.nextPaymentCents).toBeNull();
      expect(summaries[0]!.progressPercent).toBe(100);
    });

    it('returns empty array when no contracts exist', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      const summaries = await getInitiationSummary({
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
      });

      expect(summaries).toEqual([]);
    });
  });

  describe('getDeferredRevenueSchedule', () => {
    beforeEach(resetMocks);

    it('computes recognized vs deferred for contracts', async () => {
      const contractRow = {
        id: 'contract_001',
        membershipAccountId: 'acct_001',
        contractDate: '2025-01-15',
        initiationFeeCents: 1200000,
        paidPrincipalCents: 600000,
        paidInterestCents: 10000,
        recognitionPolicySnapshot: { clubModel: 'for_profit' },
      };
      const nextScheduled = {
        dueDate: '2025-07-15',
      };

      // Select 1: contracts
      mockSelectReturns.mockReturnValueOnce([contractRow]);
      // Select 2: next scheduled entry for contract_001
      mockSelectReturns.mockReturnValueOnce([nextScheduled]);

      const result = await getDeferredRevenueSchedule({
        tenantId: TENANT_A,
      });

      expect(result.entries).toHaveLength(1);
      // recognized = paidPrincipal + paidInterest = 610000
      expect(result.entries[0]!.recognizedCents).toBe(610000);
      // deferred = initiationFee - recognized = 1200000 - 610000 = 590000
      expect(result.entries[0]!.deferredCents).toBe(590000);
      expect(result.entries[0]!.clubModel).toBe('for_profit');
      expect(result.entries[0]!.nextRecognitionDate).toBe('2025-07-15');
      expect(result.totalRecognizedCents).toBe(610000);
      expect(result.totalDeferredCents).toBe(590000);
    });

    it('filters by membership account when specified', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await getDeferredRevenueSchedule({
        tenantId: TENANT_A,
        membershipAccountId: 'acct_001',
      });

      // The where clause was invoked (filter applied)
      expect(mockWhere).toHaveBeenCalled();
    });

    it('returns empty when no matching contracts', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getDeferredRevenueSchedule({
        tenantId: TENANT_A,
        membershipAccountId: 'nonexistent',
      });

      expect(result.entries).toEqual([]);
      expect(result.totalDeferredCents).toBe(0);
      expect(result.totalRecognizedCents).toBe(0);
    });
  });
});
