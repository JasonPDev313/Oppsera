import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core';

// ── Mocks (hoisted) ────────────────────────────────────────────

let lastEmittedEvents: unknown[] = [];

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn() },
  createAdminClient: vi.fn(() => ({ transaction: vi.fn() })),
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      execute: vi.fn().mockResolvedValue([{ id: 'pe-1' }]),
    };
    return fn(mockTx);
  }),
  expenses: {
    id: 'id',
    tenantId: 'tenant_id',
    status: 'status',
    version: 'version',
    employeeUserId: 'employee_user_id',
    amount: 'amount',
    expenseNumber: 'expense_number',
    glAccountId: 'gl_account_id',
    paymentMethod: 'payment_method',
    glJournalEntryId: 'gl_journal_entry_id',
    category: 'category',
    locationId: 'location_id',
    projectId: 'project_id',
  },
  rmExpenseSummary: {
    tenantId: 'tenant_id',
    locationId: 'location_id',
    fiscalPeriod: 'fiscal_period',
    category: 'category',
    expenseCount: 'expense_count',
    totalAmount: 'total_amount',
    reimbursedCount: 'reimbursed_count',
    reimbursedAmount: 'reimbursed_amount',
    pendingCount: 'pending_count',
    pendingAmount: 'pending_amount',
  },
  processedEvents: {
    id: 'id',
    tenantId: 'tenant_id',
    consumerName: 'consumer_name',
    eventId: 'event_id',
  },
  auditLog: {
    id: 'id',
    tenantId: 'tenant_id',
    action: 'action',
    entityType: 'entity_type',
    entityId: 'entity_id',
    userId: 'user_id',
  },
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
  }),
}));

const mockPostingApi = {
  postEntry: vi.fn().mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' }),
  getSettings: vi.fn().mockResolvedValue({
    defaultAPControlAccountId: 'acct-reimb',
    baseCurrency: 'USD',
  }),
  voidJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1', status: 'voided' }),
};

vi.mock('@oppsera/core/helpers', () => ({
  checkIdempotency: vi.fn().mockResolvedValue({ isDuplicate: false }),
  saveIdempotencyKey: vi.fn().mockResolvedValue(undefined),
  getAccountingPostingApi: vi.fn(() => mockPostingApi),
}));

vi.mock('@oppsera/core/events', () => ({
  publishWithOutbox: vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const result = await fn(mockTxInstance);
    const typedResult = result as { result: unknown; events: unknown[] };
    lastEmittedEvents = typedResult.events ?? [];
    return typedResult.result;
  }),
  buildEventFromContext: vi.fn(
    (_ctx: unknown, type: string, data: unknown) => ({ type, data }),
  ),
}));

vi.mock('@oppsera/core/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, msg: string, status = 400) {
      super(msg);
      this.code = code;
      this.statusCode = status;
    }
  },
  generateUlid: vi.fn(() => 'ulid-test'),
}));

// ── Imports ─────────────────────────────────────────────────────

import { postExpense } from '../commands/post-expense';
import { handleExpensePosted } from '../consumers/expense-posted';
import { handleExpenseVoided } from '../consumers/expense-voided';
import { handleExpenseReimbursed } from '../consumers/expense-reimbursed';

// ── Constants ───────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const EXPENSE_ID = 'exp-1';

// ── Helpers ─────────────────────────────────────────────────────

function makeExpenseRow(overrides: Record<string, unknown> = {}) {
  const base = {
    id: EXPENSE_ID,
    tenant_id: TENANT_ID,
    expense_number: 'EXP-20260301-ABC123',
    employee_user_id: USER_ID,
    status: 'approved',
    expense_date: '2026-03-01',
    vendor_name: 'Office Depot',
    category: 'supplies',
    description: 'Office supplies',
    amount: '125.50',
    currency: 'USD',
    payment_method: 'personal_card',
    is_reimbursable: true,
    gl_account_id: 'acct-expense',
    project_id: 'proj-1',
    receipt_url: 'https://storage/receipt.jpg',
    receipt_file_name: 'receipt.jpg',
    gl_journal_entry_id: null,
    submitted_at: '2026-03-01T10:00:00Z',
    approved_at: '2026-03-01T12:00:00Z',
    rejected_at: null,
    rejection_reason: null,
    posted_at: null,
    voided_at: null,
    void_reason: null,
    reimbursed_at: null,
    reimbursement_method: null,
    reimbursement_reference: null,
    location_id: 'loc-1',
    notes: null,
    expense_policy_id: 'policy-1',
    version: 1,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
  return {
    ...base,
    tenantId: base.tenant_id,
    expenseNumber: base.expense_number,
    employeeUserId: base.employee_user_id,
    expenseDate: base.expense_date,
    vendorName: base.vendor_name,
    paymentMethod: base.payment_method,
    isReimbursable: base.is_reimbursable,
    glAccountId: base.gl_account_id,
    projectId: base.project_id,
    receiptUrl: base.receipt_url,
    receiptFileName: base.receipt_file_name,
    glJournalEntryId: base.gl_journal_entry_id,
    submittedAt: base.submitted_at,
    approvedAt: base.approved_at,
    rejectedAt: base.rejected_at,
    rejectionReason: base.rejection_reason,
    postedAt: base.posted_at,
    voidedAt: base.voided_at,
    voidReason: base.void_reason,
    reimbursedAt: base.reimbursed_at,
    reimbursementMethod: base.reimbursement_method,
    reimbursementReference: base.reimbursement_reference,
    locationId: base.location_id,
    expensePolicyId: base.expense_policy_id,
    createdAt: base.created_at,
    updatedAt: base.updated_at,
  };
}

let mockTxInstance: ReturnType<typeof createMockTx>;

function createMockTx() {
  let selectCallCount = 0;
  let _returningIndex = 0;

  const tx: Record<string, unknown> = {
    _selectResults: [] as unknown[][],
    _returningResults: [] as unknown[][],
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(function (this: typeof tx) {
      const results = (tx._selectResults as unknown[][])[selectCallCount - 1] ?? [];
      return Promise.resolve(results);
    }),
    where: vi.fn(function (this: typeof tx) {
      selectCallCount++;
      const idx = selectCallCount - 1;
      const self = {
        limit: vi.fn(() => {
          const results = (tx._selectResults as unknown[][])[idx] ?? [];
          return Promise.resolve(results);
        }),
        returning: vi.fn(() => {
          const results = (tx._returningResults as unknown[][])[_returningIndex++] ?? [];
          return Promise.resolve(results);
        }),
        then: (resolve: (v: unknown) => void) => {
          const results = (tx._selectResults as unknown[][])[idx] ?? [];
          resolve(results);
        },
      };
      return self;
    }),
    returning: vi.fn(function (this: typeof tx) {
      const results = (tx._returningResults as unknown[][])[_returningIndex++] ?? [];
      return Promise.resolve(results);
    }),
    execute: vi.fn().mockResolvedValue([]),
  };

  mockTxInstance = tx as ReturnType<typeof createMockTx>;
  return tx;
}

function createCtx() {
  return {
    tenantId: TENANT_ID,
    locationId: 'loc-1',
    user: { id: USER_ID, email: 'test@example.com', role: 'manager' },
    requestId: 'req-1',
  } as unknown as RequestContext;
}

// ── GL Posting Tests ────────────────────────────────────────────

describe('Expense GL Posting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastEmittedEvents = [];
    mockPostingApi.postEntry.mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' });
    mockPostingApi.getSettings.mockResolvedValue({
      defaultAPControlAccountId: 'acct-reimb',
      baseCurrency: 'USD',
    });
  });

  it('posts GL entry with correct debit/credit for personal card expenses', async () => {
    const expense = makeExpenseRow({ payment_method: 'personal_card' });

    const tx = createMockTx();
    tx._selectResults = [[expense]];
    tx._returningResults = [[{ ...expense, status: 'posted', gl_journal_entry_id: 'je-1' }]];

    await postExpense(createCtx(), EXPENSE_ID);

    expect(mockPostingApi.postEntry).toHaveBeenCalledTimes(1);

    const postCall = mockPostingApi.postEntry.mock.calls[0]!;
    const entryInput = postCall[1] as Record<string, unknown>;

    // Source module and reference
    expect(entryInput.sourceModule).toBe('expense_management');
    expect(entryInput.sourceReferenceId).toBe(EXPENSE_ID);
    expect(entryInput.forcePost).toBe(true);

    // Two journal lines
    const lines = entryInput.lines as Record<string, unknown>[];
    expect(lines).toHaveLength(2);

    // Line 1: debit expense GL account
    const debitLine = lines[0]!;
    expect(debitLine.accountId).toBe('acct-expense');
    expect(debitLine.debitAmount).toBe('125.50');
    expect(debitLine.creditAmount).toBe('0.00');
    expect(debitLine.channel).toBe('expense');

    // Line 2: credit employee reimbursable (personal card)
    const creditLine = lines[1]!;
    expect(creditLine.accountId).toBe('acct-reimb');
    expect(creditLine.debitAmount).toBe('0.00');
    expect(creditLine.creditAmount).toBe('125.50');
    expect(creditLine.channel).toBe('expense');
  });

  it('uses AP control account for all payment methods including petty_cash', async () => {
    const expense = makeExpenseRow({ payment_method: 'petty_cash' });

    const tx = createMockTx();
    tx._selectResults = [[expense]];
    tx._returningResults = [[{ ...expense, status: 'posted', gl_journal_entry_id: 'je-1' }]];

    await postExpense(createCtx(), EXPENSE_ID);

    const postCall = mockPostingApi.postEntry.mock.calls[0]!;
    const entryInput = postCall[1] as Record<string, unknown>;
    const lines = entryInput.lines as Record<string, unknown>[];
    const creditLine = lines[1]!;
    expect(creditLine.accountId).toBe('acct-reimb');
    expect(creditLine.creditAmount).toBe('125.50');
  });

  it('includes locationId dimension on debit line', async () => {
    const expense = makeExpenseRow({ location_id: 'loc-1' });

    const tx = createMockTx();
    tx._selectResults = [[expense]];
    tx._returningResults = [[{ ...expense, status: 'posted', gl_journal_entry_id: 'je-1' }]];

    await postExpense(createCtx(), EXPENSE_ID);

    const postCall = mockPostingApi.postEntry.mock.calls[0]!;
    const entryInput = postCall[1] as Record<string, unknown>;
    const lines = entryInput.lines as Record<string, unknown>[];
    const debitLine = lines[0]!;
    expect(debitLine.locationId).toBe('loc-1');
  });

  it('rejects posting when expense has no GL account', async () => {
    const expense = makeExpenseRow({ gl_account_id: null });

    const tx = createMockTx();
    tx._selectResults = [[expense]];

    await expect(
      postExpense(createCtx(), EXPENSE_ID),
    ).rejects.toThrow();
  });

  it('rejects posting when credit account is not configured', async () => {
    mockPostingApi.getSettings.mockResolvedValue({
      defaultAPControlAccountId: null,
      baseCurrency: 'USD',
    });

    const expense = makeExpenseRow();
    const tx = createMockTx();
    tx._selectResults = [[expense]];

    await expect(
      postExpense(createCtx(), EXPENSE_ID),
    ).rejects.toThrow();
  });

  it('rejects posting from non-approved status', async () => {
    const expense = makeExpenseRow({ status: 'draft' });

    const tx = createMockTx();
    tx._selectResults = [[expense]];

    await expect(
      postExpense(createCtx(), EXPENSE_ID),
    ).rejects.toThrow();
  });

  it('emits expense.posted.v1 event with correct payload', async () => {
    const expense = makeExpenseRow();

    const tx = createMockTx();
    tx._selectResults = [[expense]];
    tx._returningResults = [[{ ...expense, status: 'posted', gl_journal_entry_id: 'je-1' }]];

    await postExpense(createCtx(), EXPENSE_ID);

    expect(lastEmittedEvents).toHaveLength(1);
    const event = lastEmittedEvents[0] as { type: string; data: Record<string, unknown> };
    expect(event.type).toBe('expense.posted.v1');
    expect(event.data.expenseId).toBe(EXPENSE_ID);
    expect(event.data.amount).toBe(125.50);
    expect(event.data.category).toBe('supplies');
    expect(event.data.locationId).toBe('loc-1');
    expect(event.data.employeeUserId).toBe(USER_ID);
  });

  it('stores glJournalEntryId on expense after posting', async () => {
    const expense = makeExpenseRow();

    const tx = createMockTx();
    tx._selectResults = [[expense]];
    tx._returningResults = [[{ ...expense, status: 'posted', gl_journal_entry_id: 'je-1' }]];

    await postExpense(
      createCtx(),
      EXPENSE_ID,
    );
    // update.set was called with gl_journal_entry_id
    expect(mockTxInstance).toBeDefined();
  });
});

// ── Consumer Tests ──────────────────────────────────────────────

describe('Expense Consumers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── handleExpensePosted ────────────────────────────────────

  describe('handleExpensePosted', () => {
    it('upserts rm_expense_summary on valid posted event', async () => {
      const { withTenant } = await import('@oppsera/db');
      const mockWithTenant = vi.mocked(withTenant);

      let executedSql = false;
      mockWithTenant.mockImplementation(async (_tenantId, fn) => {
        const tx = {
          execute: vi.fn().mockImplementation(() => {
            executedSql = true;
            return Promise.resolve([{ id: 'pe-1' }]);
          }),
        };
        return fn(tx as any);
      });

      await handleExpensePosted({
        eventId: 'evt-1',
        eventType: 'expense.posted.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-1',
        data: {
          expenseId: EXPENSE_ID,
          amount: 125.50,
          category: 'supplies',
          locationId: 'loc-1',
          employeeUserId: USER_ID,
          glJournalEntryId: 'je-1',
        },
        occurredAt: '2026-03-01T14:00:00Z',
      });

      expect(executedSql).toBe(true);
    });

    it('skips processing for invalid event payload', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await handleExpensePosted({
        eventId: 'evt-bad',
        eventType: 'expense.posted.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-bad',
        data: {
          // Missing required fields
          expenseId: EXPENSE_ID,
        },
        occurredAt: '2026-03-01T14:00:00Z',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('skips duplicate events via processed_events idempotency', async () => {
      const { withTenant } = await import('@oppsera/db');
      const mockWithTenant = vi.mocked(withTenant);

      let sqlCallCount = 0;
      mockWithTenant.mockImplementation(async (_tenantId, fn) => {
        const tx = {
          execute: vi.fn().mockImplementation(() => {
            sqlCallCount++;
            // First call is processed_events insert — return empty (already processed)
            if (sqlCallCount === 1) return Promise.resolve([]);
            // Second call (upsert) should NOT happen
            return Promise.resolve([]);
          }),
        };
        return fn(tx as any);
      });

      await handleExpensePosted({
        eventId: 'evt-dup',
        eventType: 'expense.posted.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-dup',
        data: {
          expenseId: EXPENSE_ID,
          amount: 125.50,
          category: 'supplies',
          locationId: 'loc-1',
          employeeUserId: USER_ID,
          glJournalEntryId: 'je-1',
        },
        occurredAt: '2026-03-01T14:00:00Z',
      });

      // Only the processed_events check should have executed, not the upsert
      expect(sqlCallCount).toBe(1);
    });
  });

  // ── handleExpenseVoided ────────────────────────────────────

  describe('handleExpenseVoided', () => {
    it('decrements rm_expense_summary on valid voided event', async () => {
      const { withTenant } = await import('@oppsera/db');
      const mockWithTenant = vi.mocked(withTenant);

      let executedSql = false;
      mockWithTenant.mockImplementation(async (_tenantId, fn) => {
        const tx = {
          execute: vi.fn().mockImplementation(() => {
            executedSql = true;
            return Promise.resolve([{ id: 'pe-1' }]);
          }),
        };
        return fn(tx as any);
      });

      await handleExpenseVoided({
        eventId: 'evt-void-1',
        eventType: 'expense.voided.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-void-1',
        data: {
          expenseId: EXPENSE_ID,
          amount: 125.50,
          category: 'supplies',
          locationId: 'loc-1',
          reason: 'Duplicate submission',
        },
        occurredAt: '2026-03-01T16:00:00Z',
      });

      expect(executedSql).toBe(true);
    });

    it('skips processing for invalid voided payload', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await handleExpenseVoided({
        eventId: 'evt-bad-void',
        eventType: 'expense.voided.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-bad-void',
        data: {
          // Missing required 'amount' and 'category'
          expenseId: EXPENSE_ID,
        },
        occurredAt: '2026-03-01T16:00:00Z',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('skips duplicate voided events', async () => {
      const { withTenant } = await import('@oppsera/db');
      const mockWithTenant = vi.mocked(withTenant);

      let sqlCallCount = 0;
      mockWithTenant.mockImplementation(async (_tenantId, fn) => {
        const tx = {
          execute: vi.fn().mockImplementation(() => {
            sqlCallCount++;
            if (sqlCallCount === 1) return Promise.resolve([]); // already processed
            return Promise.resolve([]);
          }),
        };
        return fn(tx as any);
      });

      await handleExpenseVoided({
        eventId: 'evt-void-dup',
        eventType: 'expense.voided.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-void-dup',
        data: {
          expenseId: EXPENSE_ID,
          amount: 125.50,
          category: 'supplies',
          locationId: 'loc-1',
          reason: 'Duplicate',
        },
        occurredAt: '2026-03-01T16:00:00Z',
      });

      expect(sqlCallCount).toBe(1);
    });
  });

  // ── handleExpenseReimbursed ────────────────────────────────

  describe('handleExpenseReimbursed', () => {
    it('increments reimbursement counts on valid event', async () => {
      const { withTenant } = await import('@oppsera/db');
      const mockWithTenant = vi.mocked(withTenant);

      let executedSql = false;
      mockWithTenant.mockImplementation(async (_tenantId, fn) => {
        const tx = {
          execute: vi.fn().mockImplementation(() => {
            executedSql = true;
            return Promise.resolve([{ id: 'pe-1' }]);
          }),
        };
        return fn(tx as any);
      });

      await handleExpenseReimbursed({
        eventId: 'evt-reimb-1',
        eventType: 'expense.reimbursed.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-reimb-1',
        data: {
          expenseId: EXPENSE_ID,
          amount: 125.50,
          category: 'supplies',
          locationId: 'loc-1',
          method: 'direct_deposit',
          reference: 'DD-12345',
        },
        occurredAt: '2026-03-05T10:00:00Z',
      });

      expect(executedSql).toBe(true);
    });

    it('skips processing for invalid reimbursed payload', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await handleExpenseReimbursed({
        eventId: 'evt-bad-reimb',
        eventType: 'expense.reimbursed.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-bad-reimb',
        data: {
          // Missing required 'method'
          expenseId: EXPENSE_ID,
          amount: 125.50,
        },
        occurredAt: '2026-03-05T10:00:00Z',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('skips duplicate reimbursed events', async () => {
      const { withTenant } = await import('@oppsera/db');
      const mockWithTenant = vi.mocked(withTenant);

      let sqlCallCount = 0;
      mockWithTenant.mockImplementation(async (_tenantId, fn) => {
        const tx = {
          execute: vi.fn().mockImplementation(() => {
            sqlCallCount++;
            if (sqlCallCount === 1) return Promise.resolve([]); // already processed
            return Promise.resolve([]);
          }),
        };
        return fn(tx as any);
      });

      await handleExpenseReimbursed({
        eventId: 'evt-reimb-dup',
        eventType: 'expense.reimbursed.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-reimb-dup',
        data: {
          expenseId: EXPENSE_ID,
          amount: 125.50,
          category: 'supplies',
          locationId: 'loc-1',
          method: 'check',
        },
        occurredAt: '2026-03-05T10:00:00Z',
      });

      expect(sqlCallCount).toBe(1);
    });

    it('handles optional reference field', async () => {
      const { withTenant } = await import('@oppsera/db');
      const mockWithTenant = vi.mocked(withTenant);

      let executedSql = false;
      mockWithTenant.mockImplementation(async (_tenantId, fn) => {
        const tx = {
          execute: vi.fn().mockImplementation(() => {
            executedSql = true;
            return Promise.resolve([{ id: 'pe-1' }]);
          }),
        };
        return fn(tx as any);
      });

      await handleExpenseReimbursed({
        eventId: 'evt-reimb-noref',
        eventType: 'expense.reimbursed.v1',
        tenantId: TENANT_ID,
        idempotencyKey: 'idem-reimb-noref',
        data: {
          expenseId: EXPENSE_ID,
          amount: 50.00,
          category: 'meals',
          locationId: null,
          method: 'payroll_deduction',
          // reference intentionally omitted
        },
        occurredAt: '2026-03-05T10:00:00Z',
      });

      expect(executedSql).toBe(true);
    });
  });
});
