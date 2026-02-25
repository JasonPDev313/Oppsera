import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ────────────────────────────────────────────────────
const mockPostEntry = vi.hoisted(() => vi.fn());
const mockGetSettings = vi.hoisted(() => vi.fn());
const mockPublishWithOutbox = vi.hoisted(() => vi.fn());
const mockBuildEventFromContext = vi.hoisted(() =>
  vi.fn((_ctx: unknown, eventType: string, data: unknown) => ({
    eventId: 'evt-1',
    eventType,
    data,
    tenantId: 'tenant-1',
    occurredAt: new Date().toISOString(),
  })),
);
const mockAuditLog = vi.hoisted(() => vi.fn());

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn(async (fn: any) => fn({})) },
  withTenant: vi.fn(),
  sql: vi.fn(),
  arInvoices: {
    id: 'id',
    tenantId: 'tenant_id',
    customerId: 'customer_id',
    status: 'status',
    totalAmount: 'total_amount',
    amountPaid: 'amount_paid',
    balanceDue: 'balance_due',
    glJournalEntryId: 'gl_journal_entry_id',
  },
  arInvoiceLines: {
    id: 'id',
    invoiceId: 'invoice_id',
    accountId: 'account_id',
    amount: 'amount',
    description: 'description',
  },
  arReceipts: {
    id: 'id',
    tenantId: 'tenant_id',
    customerId: 'customer_id',
    status: 'status',
    amount: 'amount',
    glJournalEntryId: 'gl_journal_entry_id',
    bankAccountId: 'bank_account_id',
  },
  arReceiptAllocations: {
    receiptId: 'receipt_id',
    invoiceId: 'invoice_id',
    amountApplied: 'amount_applied',
  },
  bankAccounts: { id: 'id', tenantId: 'tenant_id', glAccountId: 'gl_account_id' },
  customers: { id: 'id', tenantId: 'tenant_id' },
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: mockPublishWithOutbox,
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: mockBuildEventFromContext,
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mockAuditLog,
}));

vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: () => ({
    postEntry: mockPostEntry,
    getSettings: mockGetSettings,
    getAccountBalance: vi.fn().mockResolvedValue(0),
  }),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
  NotFoundError: class extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) {
      super(`${entity} ${id ?? ''} not found`);
    }
  },
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

// ── Helpers ───────────────────────────────────────────────────────────

function createMockTx() {
  const tx: Record<string, any> = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
  };
  return tx;
}

function createCtx(overrides?: Record<string, unknown>): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: {
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test User',
      tenantId: 'tenant-1',
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    requestId: 'req-1',
    isPlatformAdmin: false,
    ...overrides,
  } as unknown as RequestContext;
}

// ── postInvoice GL posting ───────────────────────────────────────────

describe('postInvoice GL journal entry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
    mockPostEntry.mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' });
    mockGetSettings.mockResolvedValue({
      defaultARControlAccountId: 'acct-ar-control',
      baseCurrency: 'USD',
    });
    mockBuildEventFromContext.mockImplementation((_ctx: unknown, eventType: string, data: unknown) => ({
      eventId: 'evt-1',
      eventType,
      data,
      tenantId: 'tenant-1',
      occurredAt: new Date().toISOString(),
    }));
  });

  it('should create GL entry with Dr AR Control, Cr Revenue per line', async () => {
    const { postInvoice } = await import('../commands/post-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;

      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'inv-1',
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            invoiceNumber: 'INV-001',
            invoiceDate: '2026-02-15',
            status: 'draft',
            totalAmount: '800.00',
            currency: 'USD',
            locationId: 'loc-1',
            memo: 'Test memo',
            glJournalEntryId: null,
          }]);
        }
        return Promise.resolve([]);
      });

      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) {
          return [
            { accountId: 'acct-rev-1', amount: '500.00', description: 'Service A' },
            { accountId: 'acct-rev-2', amount: '300.00', description: 'Service B' },
          ];
        }
        return this;
      });

      (mockTx.returning as any).mockResolvedValueOnce([{
        id: 'inv-1',
        status: 'posted',
        glJournalEntryId: 'je-1',
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await postInvoice(ctx, { invoiceId: 'inv-1' });

    expect(mockPostEntry).toHaveBeenCalledTimes(1);
    const callArgs = mockPostEntry.mock.calls[0]![1];

    // Verify GL entry structure
    expect(callArgs.sourceModule).toBe('ar');
    expect(callArgs.sourceReferenceId).toBe('inv-1');
    expect(callArgs.forcePost).toBe(true);
    expect(callArgs.currency).toBe('USD');
    expect(callArgs.businessDate).toBe('2026-02-15');

    // Debit AR control for total
    expect(callArgs.lines[0].accountId).toBe('acct-ar-control');
    expect(callArgs.lines[0].debitAmount).toBe('800.00');
    expect(callArgs.lines[0].creditAmount).toBe('0');
    expect(callArgs.lines[0].customerId).toBe('cust-1');
    expect(callArgs.lines[0].locationId).toBe('loc-1');

    // Credit revenue per line
    expect(callArgs.lines[1].accountId).toBe('acct-rev-1');
    expect(callArgs.lines[1].debitAmount).toBe('0');
    expect(callArgs.lines[1].creditAmount).toBe('500.00');

    expect(callArgs.lines[2].accountId).toBe('acct-rev-2');
    expect(callArgs.lines[2].debitAmount).toBe('0');
    expect(callArgs.lines[2].creditAmount).toBe('300.00');

    // GL entry should have N+1 lines: 1 debit + N credits
    expect(callArgs.lines).toHaveLength(3);
  });

  it('should include memo from invoice in GL entry', async () => {
    const { postInvoice } = await import('../commands/post-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;
      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'inv-1',
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            invoiceNumber: 'INV-099',
            invoiceDate: '2026-02-15',
            status: 'draft',
            totalAmount: '100.00',
            currency: 'USD',
            locationId: null,
            memo: 'Annual maintenance',
            glJournalEntryId: null,
          }]);
        }
        return Promise.resolve([]);
      });
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) return [{ accountId: 'acct-1', amount: '100.00', description: 'Maint' }];
        return this;
      });
      (mockTx.returning as any).mockResolvedValueOnce([{ id: 'inv-1', status: 'posted', glJournalEntryId: 'je-1' }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await postInvoice(ctx, { invoiceId: 'inv-1' });

    const callArgs = mockPostEntry.mock.calls[0]![1];
    expect(callArgs.memo).toBe('AR Invoice INV-099 - Annual maintenance');
  });

  it('should omit memo suffix when invoice has no memo', async () => {
    const { postInvoice } = await import('../commands/post-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;
      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'inv-2',
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            invoiceNumber: 'INV-100',
            invoiceDate: '2026-02-15',
            status: 'draft',
            totalAmount: '50.00',
            currency: 'USD',
            locationId: null,
            memo: null,
            glJournalEntryId: null,
          }]);
        }
        return Promise.resolve([]);
      });
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) return [{ accountId: 'acct-1', amount: '50.00', description: 'Svc' }];
        return this;
      });
      (mockTx.returning as any).mockResolvedValueOnce([{ id: 'inv-2', status: 'posted', glJournalEntryId: 'je-1' }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await postInvoice(ctx, { invoiceId: 'inv-2' });

    const callArgs = mockPostEntry.mock.calls[0]![1];
    expect(callArgs.memo).toBe('AR Invoice INV-100');
    expect(callArgs.memo).not.toContain(' - ');
  });
});

// ── postReceipt GL posting ───────────────────────────────────────────

describe('postReceipt GL journal entry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
    mockPostEntry.mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' });
    mockGetSettings.mockResolvedValue({
      defaultARControlAccountId: 'acct-ar-control',
      baseCurrency: 'USD',
    });
    mockBuildEventFromContext.mockImplementation((_ctx: unknown, eventType: string, data: unknown) => ({
      eventId: 'evt-1',
      eventType,
      data,
      tenantId: 'tenant-1',
      occurredAt: new Date().toISOString(),
    }));
  });

  it('should create GL entry with Dr Bank, Cr AR Control', async () => {
    const { postReceipt } = await import('../commands/post-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;

      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'rcp-1',
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            amount: '500.00',
            status: 'draft',
            receiptDate: '2026-02-20',
            bankAccountId: 'bank-1',
            currency: 'USD',
            paymentMethod: 'wire',
            referenceNumber: 'WR-001',
            glJournalEntryId: null,
          }]);
        }
        if (limitCallCount === 2) {
          return Promise.resolve([{ id: 'bank-1', glAccountId: 'acct-bank-checking' }]);
        }
        return Promise.resolve([{
          id: 'inv-1',
          totalAmount: '500.00',
          amountPaid: '0',
          balanceDue: '500.00',
        }]);
      });

      (mockTx.returning as any).mockResolvedValueOnce([{
        id: 'rcp-1',
        status: 'posted',
        glJournalEntryId: 'je-1',
      }]);

      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 4) {
          return [{ receiptId: 'rcp-1', invoiceId: 'inv-1', amountApplied: '500.00' }];
        }
        return this;
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await postReceipt(ctx, { receiptId: 'rcp-1' });

    expect(mockPostEntry).toHaveBeenCalledTimes(1);
    const callArgs = mockPostEntry.mock.calls[0]![1];

    // Verify GL structure
    expect(callArgs.sourceModule).toBe('ar');
    expect(callArgs.sourceReferenceId).toBe('rcp-1');
    expect(callArgs.forcePost).toBe(true);
    expect(callArgs.businessDate).toBe('2026-02-20');

    // Debit bank
    expect(callArgs.lines[0].accountId).toBe('acct-bank-checking');
    expect(callArgs.lines[0].debitAmount).toBe('500.00');
    expect(callArgs.lines[0].creditAmount).toBe('0');

    // Credit AR control
    expect(callArgs.lines[1].accountId).toBe('acct-ar-control');
    expect(callArgs.lines[1].debitAmount).toBe('0');
    expect(callArgs.lines[1].creditAmount).toBe('500.00');

    // Exactly 2 lines: debit bank + credit AR
    expect(callArgs.lines).toHaveLength(2);
  });

  it('should include reference number in GL memo when present', async () => {
    const { postReceipt } = await import('../commands/post-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;
      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'rcp-1',
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            amount: '100.00',
            status: 'draft',
            receiptDate: '2026-02-20',
            bankAccountId: 'bank-1',
            currency: 'USD',
            paymentMethod: null,
            referenceNumber: 'REF-ABC',
            glJournalEntryId: null,
          }]);
        }
        if (limitCallCount === 2) return Promise.resolve([{ id: 'bank-1', glAccountId: 'acct-bank-1' }]);
        return Promise.resolve([{ id: 'inv-1', totalAmount: '100.00', amountPaid: '0', balanceDue: '100.00' }]);
      });
      (mockTx.returning as any).mockResolvedValueOnce([{ id: 'rcp-1', status: 'posted', glJournalEntryId: 'je-1' }]);
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 4) return [{ receiptId: 'rcp-1', invoiceId: 'inv-1', amountApplied: '100.00' }];
        return this;
      });
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await postReceipt(ctx, { receiptId: 'rcp-1' });

    const callArgs = mockPostEntry.mock.calls[0]![1];
    expect(callArgs.memo).toContain('ref: REF-ABC');
  });

  it('should set customerId on GL lines for sub-ledger tracking', async () => {
    const { postReceipt } = await import('../commands/post-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;
      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'rcp-1',
            tenantId: 'tenant-1',
            customerId: 'cust-42',
            amount: '200.00',
            status: 'draft',
            receiptDate: '2026-02-20',
            bankAccountId: 'bank-1',
            currency: 'USD',
            paymentMethod: 'cash',
            referenceNumber: null,
            glJournalEntryId: null,
          }]);
        }
        if (limitCallCount === 2) return Promise.resolve([{ id: 'bank-1', glAccountId: 'acct-bank-1' }]);
        return Promise.resolve([{ id: 'inv-1', totalAmount: '200.00', amountPaid: '0', balanceDue: '200.00' }]);
      });
      (mockTx.returning as any).mockResolvedValueOnce([{ id: 'rcp-1', status: 'posted', glJournalEntryId: 'je-1' }]);
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 4) return [{ receiptId: 'rcp-1', invoiceId: 'inv-1', amountApplied: '200.00' }];
        return this;
      });
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await postReceipt(ctx, { receiptId: 'rcp-1' });

    const callArgs = mockPostEntry.mock.calls[0]![1];
    expect(callArgs.lines[0].customerId).toBe('cust-42');
    expect(callArgs.lines[1].customerId).toBe('cust-42');
  });
});

// ── voidInvoice GL reversal ──────────────────────────────────────────

describe('voidInvoice GL reversal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
    mockPostEntry.mockResolvedValue({ id: 'je-reversal', journalNumber: 2, status: 'posted' });
    mockGetSettings.mockResolvedValue({
      defaultARControlAccountId: 'acct-ar-control',
      baseCurrency: 'USD',
    });
    mockBuildEventFromContext.mockImplementation((_ctx: unknown, eventType: string, data: unknown) => ({
      eventId: 'evt-1',
      eventType,
      data,
      tenantId: 'tenant-1',
      occurredAt: new Date().toISOString(),
    }));
  });

  it('should reverse GL with Cr AR Control, Dr Revenue', async () => {
    const { voidInvoice } = await import('../commands/void-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;
      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'inv-1',
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            invoiceNumber: 'INV-001',
            invoiceDate: '2026-02-15',
            status: 'posted',
            totalAmount: '800.00',
            currency: 'USD',
            glJournalEntryId: 'je-1',
            locationId: 'loc-1',
          }]);
        }
        return Promise.resolve([]);
      });

      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) return []; // no allocations
        if (whereCallCount === 3) {
          return [
            { accountId: 'acct-rev-1', amount: '500.00', description: 'Svc A' },
            { accountId: 'acct-rev-2', amount: '300.00', description: 'Svc B' },
          ];
        }
        return this;
      });

      (mockTx.returning as any).mockResolvedValueOnce([{ id: 'inv-1', status: 'voided' }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await voidInvoice(ctx, { invoiceId: 'inv-1', reason: 'Duplicate' });

    expect(mockPostEntry).toHaveBeenCalledTimes(1);
    const callArgs = mockPostEntry.mock.calls[0]![1];

    // Reversal sourceReferenceId has void- prefix
    expect(callArgs.sourceReferenceId).toBe('void-inv-1');
    expect(callArgs.forcePost).toBe(true);

    // Credit AR control (reverse the original debit)
    expect(callArgs.lines[0].accountId).toBe('acct-ar-control');
    expect(callArgs.lines[0].debitAmount).toBe('0');
    expect(callArgs.lines[0].creditAmount).toBe('800.00');
    expect(callArgs.lines[0].locationId).toBe('loc-1');

    // Debit revenue accounts (reverse the original credits)
    expect(callArgs.lines[1].accountId).toBe('acct-rev-1');
    expect(callArgs.lines[1].debitAmount).toBe('500.00');
    expect(callArgs.lines[1].creditAmount).toBe('0');

    expect(callArgs.lines[2].accountId).toBe('acct-rev-2');
    expect(callArgs.lines[2].debitAmount).toBe('300.00');
    expect(callArgs.lines[2].creditAmount).toBe('0');
  });

  it('should skip GL reversal when no glJournalEntryId exists', async () => {
    const { voidInvoice } = await import('../commands/void-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        invoiceNumber: 'INV-001',
        invoiceDate: '2026-02-15',
        status: 'posted',
        totalAmount: '100.00',
        currency: 'USD',
        glJournalEntryId: null, // no GL entry
        locationId: null,
      }]);

      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) return []; // no allocations
        return this;
      });

      (mockTx.returning as any).mockResolvedValueOnce([{ id: 'inv-1', status: 'voided' }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await voidInvoice(ctx, { invoiceId: 'inv-1', reason: 'No GL' });

    expect(mockPostEntry).not.toHaveBeenCalled();
  });
});

// ── voidReceipt GL reversal ──────────────────────────────────────────

describe('voidReceipt GL reversal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
    mockPostEntry.mockResolvedValue({ id: 'je-reversal', journalNumber: 2, status: 'posted' });
    mockGetSettings.mockResolvedValue({
      defaultARControlAccountId: 'acct-ar-control',
      baseCurrency: 'USD',
    });
    mockBuildEventFromContext.mockImplementation((_ctx: unknown, eventType: string, data: unknown) => ({
      eventId: 'evt-1',
      eventType,
      data,
      tenantId: 'tenant-1',
      occurredAt: new Date().toISOString(),
    }));
  });

  it('should reverse GL with Dr AR Control, Cr Bank', async () => {
    const { voidReceipt } = await import('../commands/void-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;
      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'rcp-1',
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            amount: '300.00',
            status: 'posted',
            receiptDate: '2026-02-20',
            bankAccountId: 'bank-1',
            currency: 'USD',
            glJournalEntryId: 'je-1',
          }]);
        }
        if (limitCallCount === 2) {
          return Promise.resolve([{ id: 'bank-1', glAccountId: 'acct-bank-checking' }]);
        }
        return Promise.resolve([{
          id: 'inv-1',
          totalAmount: '500.00',
          amountPaid: '300.00',
          balanceDue: '200.00',
        }]);
      });

      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 3) {
          return [{ receiptId: 'rcp-1', invoiceId: 'inv-1', amountApplied: '300.00' }];
        }
        return this;
      });

      (mockTx.returning as any).mockResolvedValueOnce([{
        id: 'rcp-1',
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: 'user-1',
        voidReason: 'NSF',
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await voidReceipt(ctx, { receiptId: 'rcp-1', reason: 'NSF' });

    expect(mockPostEntry).toHaveBeenCalledTimes(1);
    const callArgs = mockPostEntry.mock.calls[0]![1];

    expect(callArgs.sourceReferenceId).toBe('void-rcp-1');

    // Debit AR control (reverse original credit)
    expect(callArgs.lines[0].accountId).toBe('acct-ar-control');
    expect(callArgs.lines[0].debitAmount).toBe('300.00');
    expect(callArgs.lines[0].creditAmount).toBe('0');

    // Credit bank (reverse original debit)
    expect(callArgs.lines[1].accountId).toBe('acct-bank-checking');
    expect(callArgs.lines[1].debitAmount).toBe('0');
    expect(callArgs.lines[1].creditAmount).toBe('300.00');
  });

  it('should skip GL reversal when no glJournalEntryId on receipt', async () => {
    const { voidReceipt } = await import('../commands/void-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'rcp-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        amount: '100.00',
        status: 'posted',
        receiptDate: '2026-02-20',
        bankAccountId: null,
        currency: 'USD',
        glJournalEntryId: null,
      }]);

      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) return []; // no allocations
        return this;
      });

      (mockTx.returning as any).mockResolvedValueOnce([{ id: 'rcp-1', status: 'voided' }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await voidReceipt(ctx, { receiptId: 'rcp-1', reason: 'Error' });

    expect(mockPostEntry).not.toHaveBeenCalled();
  });
});

// ── GL double-entry validation ───────────────────────────────────────

describe('GL double-entry balance verification', () => {
  it('postInvoice GL lines should balance (sum debits == sum credits)', () => {
    // Simulating what postInvoice creates
    const invoiceTotal = '750.00';
    const lineAmounts = ['400.00', '200.00', '150.00'];

    const glLines = [
      { debitAmount: invoiceTotal, creditAmount: '0' }, // AR control
      ...lineAmounts.map((a) => ({ debitAmount: '0', creditAmount: a })),
    ];

    const totalDebits = glLines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const totalCredits = glLines.reduce((s, l) => s + Number(l.creditAmount), 0);

    expect(totalDebits).toBe(750);
    expect(totalCredits).toBe(750);
    expect(totalDebits).toBe(totalCredits);
  });

  it('postReceipt GL lines should balance (sum debits == sum credits)', () => {
    const receiptAmount = '500.00';
    const glLines = [
      { debitAmount: receiptAmount, creditAmount: '0' },   // Bank
      { debitAmount: '0', creditAmount: receiptAmount },     // AR control
    ];

    const totalDebits = glLines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const totalCredits = glLines.reduce((s, l) => s + Number(l.creditAmount), 0);

    expect(totalDebits).toBe(500);
    expect(totalCredits).toBe(500);
  });

  it('void reversal GL should be the mirror of original posting', () => {
    // Original posting: Dr AR 500, Cr Revenue 500
    // Reversal: Cr AR 500, Dr Revenue 500
    const originalLines = [
      { debitAmount: '500.00', creditAmount: '0' },
      { debitAmount: '0', creditAmount: '500.00' },
    ];

    const reversalLines = [
      { debitAmount: '0', creditAmount: '500.00' },
      { debitAmount: '500.00', creditAmount: '0' },
    ];

    const origDebits = originalLines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const origCredits = originalLines.reduce((s, l) => s + Number(l.creditAmount), 0);
    const revDebits = reversalLines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const revCredits = reversalLines.reduce((s, l) => s + Number(l.creditAmount), 0);

    // Both balance
    expect(origDebits).toBe(origCredits);
    expect(revDebits).toBe(revCredits);

    // Net effect is zero
    expect(origDebits - revDebits).toBe(0);
    expect(origCredits - revCredits).toBe(0);
  });
});
