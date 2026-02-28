import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────

let lastEmittedEvents: unknown[] = [];

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn() },
  createAdminClient: vi.fn(() => ({ transaction: vi.fn() })),
  withTenant: vi.fn(),
  expenses: {
    id: 'id',
    tenantId: 'tenant_id',
    status: 'status',
    version: 'version',
    employeeUserId: 'employee_user_id',
    amount: 'amount',
    expenseNumber: 'expense_number',
    expensePolicyId: 'expense_policy_id',
    category: 'category',
    receiptUrl: 'receipt_url',
  },
  expensePolicies: {
    id: 'id',
    tenantId: 'tenant_id',
    isActive: 'is_active',
    isDefault: 'is_default',
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
}));

vi.mock('@oppsera/core/helpers', () => ({
  checkIdempotency: vi.fn().mockResolvedValue({ isDuplicate: false }),
  saveIdempotencyKey: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports ─────────────────────────────────────────────────────

import { submitExpense } from '../commands/submit-expense';

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
    status: 'draft',
    expense_date: '2026-03-01',
    vendor_name: 'Office Depot',
    category: 'supplies',
    description: 'Office supplies',
    amount: '125.50',
    currency: 'USD',
    payment_method: 'personal_card',
    is_reimbursable: true,
    gl_account_id: 'acct-expense',
    project_id: null,
    receipt_url: null,
    receipt_file_name: null,
    gl_journal_entry_id: null,
    submitted_at: null,
    approved_at: null,
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
  // Drizzle maps snake_case → camelCase; commands access camelCase properties
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

function makePolicyRow(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 'policy-1',
    tenant_id: TENANT_ID,
    name: 'Default Policy',
    description: 'Default expense policy',
    auto_approve_threshold: '100.00',
    requires_receipt_above: '25.00',
    max_amount_per_expense: '5000.00',
    allowed_categories: null,
    approver_role: 'manager',
    is_default: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
  return {
    ...base,
    tenantId: base.tenant_id,
    autoApproveThreshold: base.auto_approve_threshold,
    requiresReceiptAbove: base.requires_receipt_above,
    maxAmountPerExpense: base.max_amount_per_expense,
    allowedCategories: base.allowed_categories,
    approverRole: base.approver_role,
    isDefault: base.is_default,
    isActive: base.is_active,
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
  } as unknown as import('@oppsera/core').RequestContext;
}

// ── Tests ───────────────────────────────────────────────────────

describe('Expense Approval & Policy Constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastEmittedEvents = [];
  });

  // ── Max Amount Per Expense ──────────────────────────────────

  describe('maxAmountPerExpense', () => {
    it('rejects when expense amount exceeds policy maximum', async () => {
      const expense = makeExpenseRow({ amount: '6000.00', expense_policy_id: 'policy-1' });
      const policy = makePolicyRow({ max_amount_per_expense: '5000.00' });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[expense]];

      await expect(
        submitExpense(createCtx(), EXPENSE_ID),
      ).rejects.toThrow(/exceeds policy maximum/);
    });

    it('allows when amount equals policy maximum', async () => {
      const expense = makeExpenseRow({ amount: '5000.00', expense_policy_id: 'policy-1', receipt_url: 'https://storage/receipt.jpg' });
      const policy = makePolicyRow({ max_amount_per_expense: '5000.00' });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
    });

    it('skips max amount check when policy has no max', async () => {
      const expense = makeExpenseRow({ amount: '99999.00', expense_policy_id: 'policy-1', receipt_url: 'https://storage/receipt.jpg' });
      const policy = makePolicyRow({ max_amount_per_expense: null });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
    });
  });

  // ── Allowed Categories ─────────────────────────────────────

  describe('allowedCategories', () => {
    it('rejects when category not in allowed list', async () => {
      const expense = makeExpenseRow({
        category: 'entertainment',
        expense_policy_id: 'policy-1',
      });
      const policy = makePolicyRow({
        allowed_categories: ['supplies', 'travel', 'meals'],
      });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];

      await expect(
        submitExpense(createCtx(), EXPENSE_ID),
      ).rejects.toThrow(/not allowed by expense policy/);
    });

    it('allows when category is in allowed list', async () => {
      const expense = makeExpenseRow({
        category: 'travel',
        expense_policy_id: 'policy-1',
        receipt_url: 'https://storage/receipt.jpg',
      });
      const policy = makePolicyRow({
        allowed_categories: ['supplies', 'travel', 'meals'],
      });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
    });

    it('skips category check when allowedCategories is null', async () => {
      const expense = makeExpenseRow({
        category: 'anything',
        expense_policy_id: 'policy-1',
        receipt_url: 'https://storage/receipt.jpg',
      });
      const policy = makePolicyRow({ allowed_categories: null });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
    });

    it('skips category check when allowedCategories is empty', async () => {
      const expense = makeExpenseRow({
        category: 'anything',
        expense_policy_id: 'policy-1',
        receipt_url: 'https://storage/receipt.jpg',
      });
      const policy = makePolicyRow({ allowed_categories: [] });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
    });
  });

  // ── Receipt Requirement ────────────────────────────────────

  describe('requiresReceiptAbove', () => {
    it('rejects when receipt missing and amount exceeds threshold', async () => {
      const expense = makeExpenseRow({
        amount: '50.00',
        receipt_url: null,
        expense_policy_id: 'policy-1',
      });
      const policy = makePolicyRow({ requires_receipt_above: '25.00' });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];

      await expect(
        submitExpense(createCtx(), EXPENSE_ID),
      ).rejects.toThrow(/Receipt required/);
    });

    it('allows when receipt is present and amount exceeds threshold', async () => {
      const expense = makeExpenseRow({
        amount: '50.00',
        receipt_url: 'https://storage/receipt.jpg',
        expense_policy_id: 'policy-1',
      });
      const policy = makePolicyRow({ requires_receipt_above: '25.00' });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
    });

    it('allows when amount is below receipt threshold without receipt', async () => {
      const expense = makeExpenseRow({
        amount: '20.00',
        receipt_url: null,
        expense_policy_id: 'policy-1',
      });
      const policy = makePolicyRow({ requires_receipt_above: '25.00' });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
    });

    it('skips receipt check when requiresReceiptAbove is null', async () => {
      const expense = makeExpenseRow({
        amount: '10000.00',
        receipt_url: null,
        expense_policy_id: 'policy-1',
      });
      const policy = makePolicyRow({ requires_receipt_above: null, max_amount_per_expense: null });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
    });
  });

  // ── Auto-Approve Threshold ─────────────────────────────────

  describe('autoApproveThreshold', () => {
    it('auto-approves when amount is below threshold', async () => {
      const expense = makeExpenseRow({
        amount: '50.00',
        expense_policy_id: 'policy-1',
        receipt_url: 'https://storage/receipt.jpg',
      });
      const policy = makePolicyRow({ auto_approve_threshold: '100.00' });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'approved', approved_by: 'system' }]];

      await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );

      // Auto-approve emits TWO events: submitted + approved
      expect(lastEmittedEvents).toHaveLength(2);
      const [submitted, approved] = lastEmittedEvents as Array<{ type: string; data: Record<string, unknown> }>;
      expect(submitted!.type).toBe('expense.submitted.v1');
      expect(submitted!.data.autoApproved).toBe(true);
      expect(approved!.type).toBe('expense.approved.v1');
      expect(approved!.data.approvedBy).toBe('system');
      expect(approved!.data.autoApproved).toBe(true);
    });

    it('auto-approves when amount equals threshold', async () => {
      const expense = makeExpenseRow({
        amount: '100.00',
        expense_policy_id: 'policy-1',
        receipt_url: 'https://storage/receipt.jpg',
      });
      const policy = makePolicyRow({ auto_approve_threshold: '100.00' });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'approved', approved_by: 'system' }]];

      await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );

      expect(lastEmittedEvents).toHaveLength(2);
    });

    it('does not auto-approve when amount exceeds threshold', async () => {
      const expense = makeExpenseRow({
        amount: '150.00',
        expense_policy_id: 'policy-1',
        receipt_url: 'https://storage/receipt.jpg',
      });
      const policy = makePolicyRow({ auto_approve_threshold: '100.00' });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );

      // Only submitted event, no auto-approve
      expect(lastEmittedEvents).toHaveLength(1);
      const [submitted] = lastEmittedEvents as Array<{ type: string; data: Record<string, unknown> }>;
      expect(submitted!.type).toBe('expense.submitted.v1');
      expect(submitted!.data.autoApproved).toBe(false);
    });

    it('skips auto-approve when threshold is null', async () => {
      const expense = makeExpenseRow({
        amount: '1.00',
        expense_policy_id: 'policy-1',
      });
      const policy = makePolicyRow({ auto_approve_threshold: null });

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );

      expect(lastEmittedEvents).toHaveLength(1);
      const [submitted] = lastEmittedEvents as Array<{ type: string; data: Record<string, unknown> }>;
      expect(submitted!.type).toBe('expense.submitted.v1');
      expect(submitted!.data.autoApproved).toBe(false);
    });
  });

  // ── Submit from Rejected Status ────────────────────────────

  describe('submit from rejected status', () => {
    it('allows resubmission of rejected expenses', async () => {
      const expense = makeExpenseRow({
        status: 'rejected',
        rejected_at: '2026-03-01T12:00:00Z',
        rejection_reason: 'Missing documentation',
        receipt_url: 'https://storage/receipt.jpg',
        expense_policy_id: 'policy-1',
      });
      const policy = makePolicyRow();

      const tx = createMockTx();
      tx._selectResults = [[expense], [policy]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
      expect(lastEmittedEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── No Policy ──────────────────────────────────────────────

  describe('no policy attached', () => {
    it('submits without policy checks when no policy assigned', async () => {
      const expense = makeExpenseRow({
        expense_policy_id: null,
        amount: '99999.00',
        receipt_url: null,
        category: 'anything',
      });

      const tx = createMockTx();
      // Only one select result — no policy lookup
      tx._selectResults = [[expense]];
      tx._returningResults = [[{ ...expense, status: 'submitted' }]];

      const result = await submitExpense(
        createCtx(),
        EXPENSE_ID,
      );
      expect(result).toBeDefined();
      expect(lastEmittedEvents).toHaveLength(1);
    });
  });

  // ── Invalid Status Rejection ───────────────────────────────

  describe('status validation', () => {
    it('rejects submission from approved status', async () => {
      const expense = makeExpenseRow({ status: 'approved' });

      const tx = createMockTx();
      tx._selectResults = [[expense]];

      await expect(
        submitExpense(createCtx(), EXPENSE_ID),
      ).rejects.toThrow();
    });

    it('rejects submission from posted status', async () => {
      const expense = makeExpenseRow({ status: 'posted' });

      const tx = createMockTx();
      tx._selectResults = [[expense]];

      await expect(
        submitExpense(createCtx(), EXPENSE_ID),
      ).rejects.toThrow();
    });
  });
});
