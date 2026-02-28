import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Mocks ─────────────────────────────────────────────────────

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

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(async (_ctx: any, fn: any) => {
    const mockTx = createMockTx();
    const { result, events } = await fn(mockTx);
    lastEmittedEvents = events;
    return result;
  }),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, eventType, data) => ({
    eventId: `evt-${eventType}`,
    eventType,
    data,
    tenantId: TENANT_ID,
    occurredAt: new Date().toISOString(),
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

vi.mock('@oppsera/core/helpers/idempotency', () => ({
  checkIdempotency: vi.fn().mockResolvedValue({ isDuplicate: false }),
  saveIdempotencyKey: vi.fn(),
}));

vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: vi.fn(() => mockPostingApi),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${++ulidCounter}`),
  AppError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, status = 400) {
      super(message);
      this.code = code;
      this.statusCode = status;
    }
  },
}));

// ── Constants ─────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const EXPENSE_ID = 'exp-1';

let ulidCounter = 0;
let lastEmittedEvents: any[] = [];

const mockPostingApi = {
  postEntry: vi.fn().mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' }),
  getSettings: vi.fn().mockResolvedValue({
    defaultAPControlAccountId: 'acct-reimb',
    baseCurrency: 'USD',
  }),
  voidJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1', status: 'voided' }),
};

function makeExpenseRow(overrides: Record<string, unknown> = {}) {
  const base = {
    id: EXPENSE_ID,
    tenant_id: TENANT_ID,
    location_id: null,
    expense_number: 'EXP-20260228-aaaaaa',
    employee_user_id: USER_ID,
    expense_policy_id: null,
    status: 'draft',
    expense_date: '2026-02-28',
    vendor_name: 'Office Depot',
    category: 'supplies',
    description: 'Printer paper',
    amount: '125.50',
    currency: 'USD',
    payment_method: 'personal_card',
    is_reimbursable: true,
    gl_account_id: 'acct-expense',
    project_id: null,
    gl_journal_entry_id: null,
    submitted_at: null,
    submitted_by: null,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    posted_at: null,
    posted_by: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    reimbursed_at: null,
    reimbursement_method: null,
    reimbursement_reference: null,
    notes: null,
    metadata: {},
    client_request_id: null,
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
  // Drizzle maps snake_case → camelCase; commands access camelCase properties
  return {
    ...base,
    tenantId: base.tenant_id,
    locationId: base.location_id,
    expenseNumber: base.expense_number,
    employeeUserId: base.employee_user_id,
    expensePolicyId: base.expense_policy_id,
    expenseDate: base.expense_date,
    vendorName: base.vendor_name,
    paymentMethod: base.payment_method,
    isReimbursable: base.is_reimbursable,
    glAccountId: base.gl_account_id,
    projectId: base.project_id,
    glJournalEntryId: base.gl_journal_entry_id,
    submittedAt: base.submitted_at,
    submittedBy: base.submitted_by,
    approvedAt: base.approved_at,
    approvedBy: base.approved_by,
    rejectedAt: base.rejected_at,
    rejectedBy: base.rejected_by,
    rejectionReason: base.rejection_reason,
    postedAt: base.posted_at,
    postedBy: base.posted_by,
    voidedAt: base.voided_at,
    voidedBy: base.voided_by,
    voidReason: base.void_reason,
    reimbursedAt: base.reimbursed_at,
    reimbursementMethod: base.reimbursement_method,
    reimbursementReference: base.reimbursement_reference,
    clientRequestId: base.client_request_id,
    createdAt: base.created_at,
    updatedAt: base.updated_at,
  };
}

function _makePolicyRow(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 'policy-1',
    tenant_id: TENANT_ID,
    name: 'Default Policy',
    auto_approve_threshold: '100.00',
    requires_receipt_above: '25.00',
    max_amount_per_expense: '5000.00',
    allowed_categories: null,
    approver_role: 'manager',
    is_default: true,
    is_active: true,
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
  };
}

function createMockTx() {
  let selectCallCount = 0;
  const tx: any = {
    _selectResults: [] as unknown[][],
    _returningResults: [] as unknown[][],
    _returningIndex: 0,
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(function (this: any) {
      selectCallCount++;
      const results = this._selectResults;
      const idx = selectCallCount - 1;
      const data = idx < results.length ? results[idx] : [];
      // Make the chain thenable so await works
      tx._lastSelectResult = data;
      return tx;
    }),
    limit: vi.fn(function (this: any) {
      return Promise.resolve(this._lastSelectResult ?? []);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(function (this: any) {
      const idx = this._returningIndex++;
      return Promise.resolve(this._returningResults[idx] ?? []);
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  };

  // Make `where` chain awaitable (for select...from...where without limit)
  const origWhere = tx.where;
  tx.where = vi.fn(function (this: any, ...args: any[]) {
    const result = origWhere.apply(this, args);
    // When used after select().from(), make it thenable for patterns without limit()
    result.then = (resolve: any) => resolve(result._lastSelectResult ?? []);
    return result;
  });

  return tx;
}

function createCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    tenantId: TENANT_ID,
    user: { id: USER_ID, email: 'test@example.com', role: 'manager' },
    requestId: 'req-1',
    locationId: null,
    ...overrides,
  } as RequestContext;
}

// ── Imports (after mocks) ─────────────────────────────────────

import { createExpense } from '../commands/create-expense';
import { updateExpense } from '../commands/update-expense';
import { submitExpense } from '../commands/submit-expense';
import { approveExpense } from '../commands/approve-expense';
import { rejectExpense } from '../commands/reject-expense';
import { postExpense } from '../commands/post-expense';
import { voidExpense } from '../commands/void-expense';
import { markReimbursed } from '../commands/mark-reimbursed';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';

// ═══════════════════════════════════════════════════════════════
// Expense Lifecycle Tests
// ═══════════════════════════════════════════════════════════════

describe('Expense Management — Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ulidCounter = 0;
    lastEmittedEvents = [];
  });

  // ── createExpense ─────────────────────────────────────────

  describe('createExpense', () => {
    it('creates a draft expense with generated expense number', async () => {
      const createdRow = makeExpenseRow();
      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._returningResults = [[createdRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      const ctx = createCtx();
      const result = await createExpense(ctx, {
        expenseDate: '2026-02-28',
        category: 'supplies',
        amount: 125.50,
        vendorName: 'Office Depot',
        paymentMethod: 'personal_card',
        isReimbursable: true,
        glAccountId: 'acct-expense',
      });

      expect(result).toBeDefined();
      expect(publishWithOutbox).toHaveBeenCalledOnce();
      expect(auditLog).toHaveBeenCalledWith(ctx, 'expense.created', 'expense', expect.any(String));
    });

    it('checks idempotency inside the transaction', async () => {
      const createdRow = makeExpenseRow();
      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._returningResults = [[createdRow]];
        const { result } = await fn(tx);
        return result;
      });

      await createExpense(createCtx(), {
        expenseDate: '2026-02-28',
        category: 'supplies',
        amount: 50,
        clientRequestId: 'req-abc',
      });

      expect(checkIdempotency).toHaveBeenCalled();
    });

    it('returns existing result on duplicate request', async () => {
      const existingResult = makeExpenseRow({ id: 'exp-existing' });
      (checkIdempotency as any).mockResolvedValueOnce({
        isDuplicate: true,
        originalResult: existingResult,
      });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        const { result } = await fn(tx);
        return result;
      });

      const result = await createExpense(createCtx(), {
        expenseDate: '2026-02-28',
        category: 'supplies',
        amount: 50,
        clientRequestId: 'req-dup',
      });

      expect(result).toEqual(existingResult);
    });

    it('emits expense.created.v1 event', async () => {
      const createdRow = makeExpenseRow();
      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._returningResults = [[createdRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      await createExpense(createCtx(), {
        expenseDate: '2026-02-28',
        category: 'supplies',
        amount: 100,
      });

      expect(lastEmittedEvents).toHaveLength(1);
      expect(lastEmittedEvents[0].eventType).toBe('expense.created.v1');
    });
  });

  // ── updateExpense ─────────────────────────────────────────

  describe('updateExpense', () => {
    it('updates a draft expense', async () => {
      const draftRow = makeExpenseRow({ status: 'draft' });
      const updatedRow = makeExpenseRow({ status: 'draft', amount: '200.00', version: 2 });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[draftRow]];
        tx._returningResults = [[updatedRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      const result = await updateExpense(createCtx(), EXPENSE_ID, { amount: 200 });
      expect(result).toBeDefined();
      expect(lastEmittedEvents[0].eventType).toBe('expense.updated.v1');
    });

    it('allows editing a rejected expense and resets status to draft', async () => {
      const rejectedRow = makeExpenseRow({
        status: 'rejected',
        rejected_at: new Date(),
        rejected_by: 'admin-1',
        rejection_reason: 'Missing receipt',
      });
      const resetRow = makeExpenseRow({ status: 'draft', version: 2 });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[rejectedRow]];
        tx._returningResults = [[resetRow]];
        const { result } = await fn(tx);
        return result;
      });

      const result = await updateExpense(createCtx(), EXPENSE_ID, { amount: 130 });
      expect(result).toBeDefined();
    });

    it('rejects editing an approved expense', async () => {
      const approvedRow = makeExpenseRow({ status: 'approved' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[approvedRow]];
        return fn(tx);
      });

      await expect(updateExpense(createCtx(), EXPENSE_ID, { amount: 200 }))
        .rejects.toThrow(/Cannot edit expense/);
    });

    it('rejects editing with version conflict', async () => {
      const draftRow = makeExpenseRow({ status: 'draft', version: 3 });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[draftRow]];
        return fn(tx);
      });

      await expect(updateExpense(createCtx(), EXPENSE_ID, {
        amount: 200,
        expectedVersion: 1, // stale version
      })).rejects.toThrow(/modified by another user/);
    });
  });

  // ── submitExpense ─────────────────────────────────────────

  describe('submitExpense', () => {
    it('transitions draft → submitted', async () => {
      const draftRow = makeExpenseRow({ status: 'draft', amount: '500.00' });
      const submittedRow = makeExpenseRow({ status: 'submitted', submitted_at: new Date() });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [
          [draftRow],   // expense lookup
          [],           // policy lookup (no policy found)
        ];
        tx._returningResults = [[submittedRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      await submitExpense(createCtx(), EXPENSE_ID);
      expect(lastEmittedEvents.some((e: any) => e.eventType === 'expense.submitted.v1')).toBe(true);
    });

    it('rejects submission of a non-draft/non-rejected expense', async () => {
      const approvedRow = makeExpenseRow({ status: 'approved' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[approvedRow]];
        return fn(tx);
      });

      await expect(submitExpense(createCtx(), EXPENSE_ID))
        .rejects.toThrow(/Cannot submit/);
    });
  });

  // ── approveExpense ────────────────────────────────────────

  describe('approveExpense', () => {
    it('transitions submitted → approved', async () => {
      const submittedRow = makeExpenseRow({ status: 'submitted' });
      const approvedRow = makeExpenseRow({ status: 'approved', approved_at: new Date() });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[submittedRow]];
        tx._returningResults = [[approvedRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      await approveExpense(createCtx(), EXPENSE_ID);
      expect(lastEmittedEvents[0].eventType).toBe('expense.approved.v1');
    });

    it('rejects approval of non-submitted expense', async () => {
      const draftRow = makeExpenseRow({ status: 'draft' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[draftRow]];
        return fn(tx);
      });

      await expect(approveExpense(createCtx(), EXPENSE_ID))
        .rejects.toThrow(/Cannot approve/);
    });
  });

  // ── rejectExpense ─────────────────────────────────────────

  describe('rejectExpense', () => {
    it('transitions submitted → rejected with reason', async () => {
      const submittedRow = makeExpenseRow({ status: 'submitted' });
      const rejectedRow = makeExpenseRow({ status: 'rejected', rejection_reason: 'No receipt' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[submittedRow]];
        tx._returningResults = [[rejectedRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      await rejectExpense(createCtx(), {
        expenseId: EXPENSE_ID,
        reason: 'No receipt',
      });

      expect(lastEmittedEvents[0].eventType).toBe('expense.rejected.v1');
      expect(lastEmittedEvents[0].data.reason).toBe('No receipt');
    });

    it('rejects rejection of non-submitted expense', async () => {
      const draftRow = makeExpenseRow({ status: 'draft' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[draftRow]];
        return fn(tx);
      });

      await expect(rejectExpense(createCtx(), {
        expenseId: EXPENSE_ID,
        reason: 'Bad',
      })).rejects.toThrow(/Cannot reject/);
    });
  });

  // ── postExpense ───────────────────────────────────────────

  describe('postExpense', () => {
    it('transitions approved → posted with GL journal entry', async () => {
      const approvedRow = makeExpenseRow({ status: 'approved', gl_account_id: 'acct-expense' });
      const postedRow = makeExpenseRow({ status: 'posted', gl_journal_entry_id: 'je-1' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[approvedRow]];
        tx._returningResults = [[postedRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      const result = await postExpense(createCtx(), EXPENSE_ID);
      expect(result).toBeDefined();
      expect(lastEmittedEvents[0].eventType).toBe('expense.posted.v1');
      expect(mockPostingApi.postEntry).toHaveBeenCalledOnce();
    });

    it('rejects posting without glAccountId', async () => {
      const approvedRow = makeExpenseRow({ status: 'approved', gl_account_id: null });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[approvedRow]];
        return fn(tx);
      });

      await expect(postExpense(createCtx(), EXPENSE_ID))
        .rejects.toThrow(/GL account/);
    });

    it('rejects posting non-approved expense', async () => {
      const draftRow = makeExpenseRow({ status: 'draft' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[draftRow]];
        return fn(tx);
      });

      await expect(postExpense(createCtx(), EXPENSE_ID))
        .rejects.toThrow(/Cannot post/);
    });
  });

  // ── voidExpense ───────────────────────────────────────────

  describe('voidExpense', () => {
    it('transitions posted → voided and attempts GL reversal', async () => {
      const postedRow = makeExpenseRow({
        status: 'posted',
        gl_journal_entry_id: 'je-1',
      });
      const voidedRow = makeExpenseRow({ status: 'voided', void_reason: 'Duplicate' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[postedRow]];
        tx._returningResults = [[voidedRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      await voidExpense(createCtx(), {
        expenseId: EXPENSE_ID,
        reason: 'Duplicate',
      });

      expect(lastEmittedEvents[0].eventType).toBe('expense.voided.v1');
    });

    it('rejects voiding non-posted expense', async () => {
      const draftRow = makeExpenseRow({ status: 'draft' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[draftRow]];
        return fn(tx);
      });

      await expect(voidExpense(createCtx(), {
        expenseId: EXPENSE_ID,
        reason: 'Error',
      })).rejects.toThrow(/Cannot void/);
    });

    it('still voids even if GL reversal fails (never-throw pattern)', async () => {
      const postedRow = makeExpenseRow({
        status: 'posted',
        gl_journal_entry_id: 'je-1',
      });
      const voidedRow = makeExpenseRow({ status: 'voided' });

      mockPostingApi.postEntry.mockRejectedValueOnce(new Error('GL failure'));

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[postedRow]];
        tx._returningResults = [[voidedRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      // Should not throw even if GL posting fails
      const result = await voidExpense(createCtx(), {
        expenseId: EXPENSE_ID,
        reason: 'GL failure test',
      });
      expect(result).toBeDefined();
    });
  });

  // ── markReimbursed ────────────────────────────────────────

  describe('markReimbursed', () => {
    it('marks a posted expense as reimbursed', async () => {
      const postedRow = makeExpenseRow({
        status: 'posted',
        is_reimbursable: true,
        reimbursed_at: null,
      });
      const reimbursedRow = makeExpenseRow({
        status: 'posted',
        reimbursed_at: new Date(),
        reimbursement_method: 'direct_deposit',
      });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[postedRow]];
        tx._returningResults = [[reimbursedRow]];
        const { result, events } = await fn(tx);
        lastEmittedEvents = events;
        return result;
      });

      const result = await markReimbursed(createCtx(), {
        expenseId: EXPENSE_ID,
        method: 'direct_deposit',
        reference: 'ACH-12345',
      });

      expect(result).toBeDefined();
      expect(lastEmittedEvents[0].eventType).toBe('expense.reimbursed.v1');
    });

    it('rejects reimbursement of non-posted expense', async () => {
      const draftRow = makeExpenseRow({ status: 'draft' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[draftRow]];
        return fn(tx);
      });

      await expect(markReimbursed(createCtx(), {
        expenseId: EXPENSE_ID,
        method: 'check',
      })).rejects.toThrow();
    });

    it('rejects reimbursement of non-reimbursable expense', async () => {
      const postedRow = makeExpenseRow({
        status: 'posted',
        is_reimbursable: false,
      });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[postedRow]];
        return fn(tx);
      });

      await expect(markReimbursed(createCtx(), {
        expenseId: EXPENSE_ID,
        method: 'check',
      })).rejects.toThrow(/not.*reimbursable/);
    });

    it('rejects double reimbursement', async () => {
      const alreadyReimbursed = makeExpenseRow({
        status: 'posted',
        is_reimbursable: true,
        reimbursed_at: new Date(),
      });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const tx = createMockTx();
        tx._selectResults = [[alreadyReimbursed]];
        return fn(tx);
      });

      await expect(markReimbursed(createCtx(), {
        expenseId: EXPENSE_ID,
        method: 'check',
      })).rejects.toThrow(/already.*reimbursed/);
    });
  });

  // ── Not Found ─────────────────────────────────────────────

  describe('not found handling', () => {
    const commands = [
      { name: 'approveExpense', fn: () => approveExpense(createCtx(), 'missing') },
      { name: 'rejectExpense', fn: () => rejectExpense(createCtx(), { expenseId: 'missing', reason: 'test' }) },
      { name: 'postExpense', fn: () => postExpense(createCtx(), 'missing') },
      { name: 'voidExpense', fn: () => voidExpense(createCtx(), { expenseId: 'missing', reason: 'test' }) },
    ];

    for (const { name, fn } of commands) {
      it(`${name} throws when expense not found`, async () => {
        (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, txFn: any) => {
          const tx = createMockTx();
          tx._selectResults = [[]]; // empty result = not found
          return txFn(tx);
        });

        await expect(fn()).rejects.toThrow(/not found/i);
      });
    }
  });
});
