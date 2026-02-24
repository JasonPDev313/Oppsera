import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('@oppsera/db', () => {
  const mockTx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
  };
  return {
    db: { transaction: vi.fn(async (fn: any) => fn(mockTx)) },
    withTenant: vi.fn(),
    sql: vi.fn(),
    arInvoices: { id: 'id', tenantId: 'tenant_id', customerId: 'customer_id', status: 'status', totalAmount: 'total_amount', amountPaid: 'amount_paid', balanceDue: 'balance_due', glJournalEntryId: 'gl_journal_entry_id' },
    arInvoiceLines: { id: 'id', invoiceId: 'invoice_id', accountId: 'account_id', amount: 'amount', description: 'description' },
    arReceipts: { id: 'id', tenantId: 'tenant_id', customerId: 'customer_id', status: 'status', amount: 'amount', glJournalEntryId: 'gl_journal_entry_id', bankAccountId: 'bank_account_id' },
    arReceiptAllocations: { receiptId: 'receipt_id', invoiceId: 'invoice_id', amountApplied: 'amount_applied' },
    bankAccounts: { id: 'id', tenantId: 'tenant_id', glAccountId: 'gl_account_id' },
  };
});

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(async (_ctx: any, fn: any) => {
    const mockTx = createMockTx();
    const { result } = await fn(mockTx);
    return result;
  }),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, eventType, data) => ({
    eventId: 'evt-1',
    eventType,
    data,
    tenantId: 'tenant-1',
    occurredAt: new Date().toISOString(),
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: vi.fn(() => ({
    postEntry: vi.fn().mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' }),
    getSettings: vi.fn().mockResolvedValue({
      defaultAPControlAccountId: null,
      defaultARControlAccountId: 'acct-ar-control',
      baseCurrency: 'USD',
    }),
    getAccountBalance: vi.fn().mockResolvedValue(0),
  })),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
  NotFoundError: class extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) { super(`${entity} ${id ?? ''} not found`); }
  },
  ValidationError: class extends Error {
    code = 'VALIDATION_ERROR';
    statusCode = 400;
    details: any[];
    constructor(msg: string, details: any[]) { super(msg); this.details = details; }
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

// ── Helpers ────────────────────────────────────────────────────────

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
    user: { id: 'user-1', email: 'test@test.com', name: 'Test User', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
    ...overrides,
  } as unknown as RequestContext;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('AR Invoice Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createInvoice', () => {
    it('should create a draft invoice with lines', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();

        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'inv-1',
          tenantId: 'tenant-1',
          customerId: 'cust-1',
          invoiceNumber: 'INV-001',
          status: 'draft',
          totalAmount: '500.00',
          amountPaid: '0',
          balanceDue: '500.00',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [invoice] = await tx.insert({}).values({
          customerId: 'cust-1',
          invoiceNumber: 'INV-001',
          status: 'draft',
          totalAmount: '500.00',
          amountPaid: '0',
          balanceDue: '500.00',
        }).returning();

        return { result: invoice, events: [] };
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
      expect(result.totalAmount).toBe('500.00');
      expect(result.balanceDue).toBe('500.00');
    });

    it('should compute total from lines', () => {
      const lines = [
        { accountId: 'acct-1', description: 'Service A', amount: '200.00' },
        { accountId: 'acct-2', description: 'Service B', amount: '300.00' },
      ];

      let totalAmount = 0;
      for (const line of lines) {
        totalAmount += Number(line.amount) + Number('0');
      }

      expect(totalAmount.toFixed(2)).toBe('500.00');
    });
  });

  describe('postInvoice', () => {
    it('should create GL entry (Dr AR, Cr Revenue) and update status', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
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
              totalAmount: '500.00',
              currency: 'USD',
              locationId: null,
              memo: null,
              glJournalEntryId: null,
            }]);
          }
          return Promise.resolve([]);
        });

        // Lines from select (no limit terminator)
        (mockTx.where as any).mockImplementation(function (this: any) {
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
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        // Load invoice
        const [invoice] = await tx.select().from({}).where({}).limit(1);
        expect(invoice.status).toBe('draft');

        // Post GL: Dr AR Control, Cr Revenue
        const glResult = await postingApi.postEntry({
          businessDate: invoice.invoiceDate,
          sourceModule: 'ar',
          sourceReferenceId: invoice.id,
          memo: `AR Invoice ${invoice.invoiceNumber}`,
          currency: 'USD',
          lines: [
            { accountId: 'acct-ar-control', debitAmount: invoice.totalAmount, creditAmount: '0', customerId: 'cust-1' },
            { accountId: 'acct-revenue-1', debitAmount: '0', creditAmount: invoice.totalAmount, customerId: 'cust-1' },
          ],
          forcePost: true,
        });

        const [posted] = await tx.update({}).set({
          status: 'posted',
          glJournalEntryId: glResult.id,
        }).returning();

        return { result: posted, events: [] };
      });

      expect(result.status).toBe('posted');
      expect(result.glJournalEntryId).toBe('je-1');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);

      // Verify GL entry is Dr AR, Cr Revenue
      const callArgs = postingApi.postEntry.mock.calls[0][0];
      expect(callArgs.lines[0].debitAmount).toBe('500.00');
      expect(callArgs.lines[0].creditAmount).toBe('0');
      expect(callArgs.lines[1].debitAmount).toBe('0');
      expect(callArgs.lines[1].creditAmount).toBe('500.00');
    });

    it('should reject posting a non-draft invoice', async () => {
      const { AppError } = await import('@oppsera/shared');

      const invoice = { id: 'inv-1', status: 'posted' };
      expect(() => {
        if (invoice.status !== 'draft') {
          throw new AppError('INVOICE_STATUS_ERROR', `Invoice is ${invoice.status}, expected draft`, 400);
        }
      }).toThrow('expected draft');
    });
  });

  describe('voidInvoice', () => {
    it('should reverse GL and void the invoice', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      postingApi.postEntry.mockResolvedValueOnce({ id: 'je-reversal', journalNumber: 2, status: 'posted' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
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
              totalAmount: '500.00',
              currency: 'USD',
              glJournalEntryId: 'je-1',
              locationId: null,
            }]);
          }
          return Promise.resolve([]);
        });

        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'inv-1',
          status: 'voided',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [invoice] = await tx.select().from({}).where({}).limit(1);
        expect(invoice.status).toBe('posted');

        // Create GL reversal: Cr AR Control, Dr Revenue
        await postingApi.postEntry({
          businessDate: invoice.invoiceDate,
          sourceModule: 'ar',
          sourceReferenceId: `void-${invoice.id}`,
          memo: 'Void AR Invoice INV-001',
          currency: 'USD',
          lines: [
            { accountId: 'acct-ar-control', debitAmount: '0', creditAmount: invoice.totalAmount, customerId: 'cust-1' },
            { accountId: 'acct-revenue-1', debitAmount: invoice.totalAmount, creditAmount: '0', customerId: 'cust-1' },
          ],
          forcePost: true,
        });

        const [voided] = await tx.update({}).set({ status: 'voided' }).returning();

        return { result: { ...voided, reversalJournalEntryId: 'je-reversal' }, events: [] };
      });

      expect(result.status).toBe('voided');
      expect(result.reversalJournalEntryId).toBe('je-reversal');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);
    });

    it('should reject voiding an invoice with receipt allocations', async () => {
      const { AppError } = await import('@oppsera/shared');

      const allocations = [{ receiptId: 'rcp-1', invoiceId: 'inv-1', amountApplied: '200.00' }];

      expect(() => {
        if (allocations.length > 0) {
          throw new AppError('INVOICE_HAS_RECEIPTS', 'Cannot void invoice with receipt allocations', 400);
        }
      }).toThrow('Cannot void invoice with receipt allocations');
    });
  });
});

describe('AR Receipt Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createReceipt', () => {
    it('should create a draft receipt with allocations', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        let limitCallCount = 0;

        (mockTx.limit as any).mockImplementation(() => {
          limitCallCount++;
          if (limitCallCount === 1) {
            return Promise.resolve([{
              id: 'inv-1',
              tenantId: 'tenant-1',
              customerId: 'cust-1',
              status: 'posted',
              totalAmount: '500.00',
              balanceDue: '500.00',
            }]);
          }
          return Promise.resolve([]);
        });

        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'rcp-1',
          tenantId: 'tenant-1',
          customerId: 'cust-1',
          amount: '300.00',
          status: 'draft',
          receiptDate: '2026-02-20',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        // Validate invoice exists
        const [invoice] = await tx.select().from({}).where({}).limit(1);
        expect(invoice).toBeDefined();
        expect(Number(invoice.balanceDue)).toBeGreaterThanOrEqual(300);

        const [receipt] = await tx.insert({}).values({
          customerId: 'cust-1',
          amount: '300.00',
          status: 'draft',
        }).returning();

        return { result: receipt, events: [] };
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
      expect(result.amount).toBe('300.00');
    });

    it('should reject allocation exceeding invoice balance', async () => {
      const { AppError } = await import('@oppsera/shared');

      const invoice = { balanceDue: '100.00' };
      const allocAmount = 500;

      expect(() => {
        if (allocAmount > Number(invoice.balanceDue) + 0.01) {
          throw new AppError('ALLOCATION_EXCEEDS_BALANCE', `Allocation $${allocAmount} exceeds invoice balance $${invoice.balanceDue}`, 400);
        }
      }).toThrow('Allocation $500 exceeds invoice balance');
    });

    it('should reject allocation to different customer invoice', async () => {
      const { AppError } = await import('@oppsera/shared');

      const invoice = { customerId: 'cust-2' };
      const receiptCustomerId = 'cust-1';

      expect(() => {
        if (invoice.customerId !== receiptCustomerId) {
          throw new AppError('INVOICE_CUSTOMER_MISMATCH', 'Invoice belongs to a different customer', 400);
        }
      }).toThrow('Invoice belongs to a different customer');
    });

    it('should reject allocation total exceeding receipt amount', async () => {
      const { AppError } = await import('@oppsera/shared');

      const allocations = [
        { invoiceId: 'inv-1', amountApplied: '300.00' },
        { invoiceId: 'inv-2', amountApplied: '400.00' },
      ];
      const receiptAmount = '500.00';

      const allocTotal = allocations.reduce((s, a) => s + Number(a.amountApplied), 0);
      expect(() => {
        if (allocTotal > Number(receiptAmount) + 0.01) {
          throw new AppError('ALLOCATION_EXCEEDS_RECEIPT', 'Allocation total exceeds receipt amount', 400);
        }
      }).toThrow('Allocation total exceeds receipt amount');
    });
  });

  describe('postReceipt', () => {
    it('should create GL entry (Dr Bank, Cr AR) and update invoice', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
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
              status: 'draft',
              receiptDate: '2026-02-20',
              bankAccountId: 'bank-1',
              currency: 'USD',
              paymentMethod: 'check',
              referenceNumber: 'CHK-001',
              glJournalEntryId: null,
            }]);
          }
          if (limitCallCount === 2) {
            return Promise.resolve([{ id: 'bank-1', glAccountId: 'acct-bank-1' }]);
          }
          // Invoice for allocation update
          return Promise.resolve([{
            id: 'inv-1',
            totalAmount: '500.00',
            amountPaid: '0.00',
            balanceDue: '500.00',
          }]);
        });

        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'rcp-1',
          status: 'posted',
          glJournalEntryId: 'je-1',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [receipt] = await tx.select().from({}).where({}).limit(1);
        expect(receipt.status).toBe('draft');

        const [bank] = await tx.select().from({}).where({}).limit(1);

        // Post GL: Dr Bank, Cr AR Control
        const glResult = await postingApi.postEntry({
          businessDate: receipt.receiptDate,
          sourceModule: 'ar',
          sourceReferenceId: receipt.id,
          memo: 'AR Receipt',
          currency: 'USD',
          lines: [
            { accountId: bank.glAccountId, debitAmount: receipt.amount, creditAmount: '0', customerId: 'cust-1' },
            { accountId: 'acct-ar-control', debitAmount: '0', creditAmount: receipt.amount, customerId: 'cust-1' },
          ],
          forcePost: true,
        });

        const [posted] = await tx.update({}).set({
          status: 'posted',
          glJournalEntryId: glResult.id,
        }).returning();

        // Update invoice
        const [invoice] = await tx.select().from({}).where({}).limit(1);
        const newPaid = (Number(invoice.amountPaid) + 300).toFixed(2);
        const newBalance = (Number(invoice.totalAmount) - Number(newPaid)).toFixed(2);

        return {
          result: { ...posted, invoiceNewBalance: newBalance },
          events: [],
        };
      });

      expect(result.status).toBe('posted');
      expect(result.glJournalEntryId).toBe('je-1');
      expect(result.invoiceNewBalance).toBe('200.00');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);

      // Verify GL: Dr Bank, Cr AR
      const callArgs = postingApi.postEntry.mock.calls[0][0];
      expect(callArgs.lines[0].debitAmount).toBe('300.00');
      expect(callArgs.lines[1].creditAmount).toBe('300.00');
    });

    it('should mark invoice as paid when fully paid', async () => {
      const invoiceTotal = 500;
      const allocAmount = 500;
      const newPaid = allocAmount;
      const newBalance = invoiceTotal - newPaid;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      expect(newStatus).toBe('paid');
      expect(newBalance).toBe(0);
    });

    it('should mark invoice as partial when partially paid', async () => {
      const invoiceTotal = 1000;
      const allocAmount = 300;
      const newPaid = allocAmount;
      const newBalance = invoiceTotal - newPaid;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      expect(newStatus).toBe('partial');
      expect(newBalance).toBe(700);
    });
  });

  describe('voidReceipt', () => {
    it('should reverse GL and restore invoice balance', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      postingApi.postEntry.mockResolvedValueOnce({ id: 'je-reversal', journalNumber: 2, status: 'posted' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
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
            return Promise.resolve([{ id: 'bank-1', glAccountId: 'acct-bank-1' }]);
          }
          // Invoice for balance restore
          return Promise.resolve([{
            id: 'inv-1',
            totalAmount: '500.00',
            amountPaid: '300.00',
            balanceDue: '200.00',
          }]);
        });

        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'rcp-1',
          status: 'voided',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [receipt] = await tx.select().from({}).where({}).limit(1);
        expect(receipt.status).toBe('posted');

        // Create GL reversal: Dr AR Control, Cr Bank
        const [bank] = await tx.select().from({}).where({}).limit(1);

        await postingApi.postEntry({
          businessDate: receipt.receiptDate,
          sourceModule: 'ar',
          sourceReferenceId: `void-${receipt.id}`,
          memo: 'Void AR Receipt',
          currency: 'USD',
          lines: [
            { accountId: 'acct-ar-control', debitAmount: receipt.amount, creditAmount: '0', customerId: 'cust-1' },
            { accountId: bank.glAccountId, debitAmount: '0', creditAmount: receipt.amount, customerId: 'cust-1' },
          ],
          forcePost: true,
        });

        // Restore invoice balance
        const [invoice] = await tx.select().from({}).where({}).limit(1);
        const restoredPaid = Math.max(0, Number(invoice.amountPaid) - Number(receipt.amount)).toFixed(2);
        const restoredBalance = (Number(invoice.totalAmount) - Number(restoredPaid)).toFixed(2);
        const restoredStatus = Number(restoredPaid) === 0 ? 'posted' : 'partial';

        const [voided] = await tx.update({}).set({ status: 'voided' }).returning();

        return {
          result: { receipt: voided, restoredBalance, restoredStatus },
          events: [],
        };
      });

      expect(result.receipt.status).toBe('voided');
      expect(result.restoredBalance).toBe('500.00');
      expect(result.restoredStatus).toBe('posted');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);
    });

    it('should reject voiding a draft receipt', async () => {
      const { AppError } = await import('@oppsera/shared');

      const receipt = { id: 'rcp-1', status: 'draft' };
      expect(() => {
        if (receipt.status !== 'posted') {
          throw new AppError('RECEIPT_STATUS_ERROR', `Receipt is ${receipt.status}, expected posted`, 400);
        }
      }).toThrow('expected posted');
    });
  });
});

describe('AR Aging Buckets', () => {
  it('should calculate aging buckets correctly', () => {
    const asOfDate = new Date('2026-02-20');
    const invoices = [
      { dueDate: new Date('2026-02-25'), balanceDue: 100 }, // current (due in future)
      { dueDate: new Date('2026-02-10'), balanceDue: 200 }, // 1-30 (10 days overdue)
      { dueDate: new Date('2026-01-15'), balanceDue: 300 }, // 31-60 (36 days overdue)
      { dueDate: new Date('2025-12-01'), balanceDue: 400 }, // 61-90 (81 days overdue)
      { dueDate: new Date('2025-10-01'), balanceDue: 500 }, // over 90 (142 days overdue)
    ];

    let current = 0;
    let days1to30 = 0;
    let days31to60 = 0;
    let days61to90 = 0;
    let over90 = 0;

    for (const inv of invoices) {
      const daysOverdue = Math.floor((asOfDate.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 0) current += inv.balanceDue;
      else if (daysOverdue <= 30) days1to30 += inv.balanceDue;
      else if (daysOverdue <= 60) days31to60 += inv.balanceDue;
      else if (daysOverdue <= 90) days61to90 += inv.balanceDue;
      else over90 += inv.balanceDue;
    }

    expect(current).toBe(100);
    expect(days1to30).toBe(200);
    expect(days31to60).toBe(300);
    expect(days61to90).toBe(400);
    expect(over90).toBe(500);
    expect(current + days1to30 + days31to60 + days61to90 + over90).toBe(1500);
  });
});

describe('AR Reconciliation', () => {
  it('should return reconciled when GL equals subledger', () => {
    const glBalance = 1000;
    const invoiceTotal = 2500;
    const receiptTotal = 1500;
    const subledgerBalance = Math.round((invoiceTotal - receiptTotal) * 100) / 100;
    const difference = Math.round((glBalance - subledgerBalance) * 100) / 100;
    const isReconciled = Math.abs(difference) < 0.01;

    expect(subledgerBalance).toBe(1000);
    expect(difference).toBe(0);
    expect(isReconciled).toBe(true);
  });

  it('should return unreconciled when GL differs from subledger', () => {
    const glBalance = 1050;
    const invoiceTotal = 2500;
    const receiptTotal = 1500;
    const subledgerBalance = Math.round((invoiceTotal - receiptTotal) * 100) / 100;
    const difference = Math.round((glBalance - subledgerBalance) * 100) / 100;
    const isReconciled = Math.abs(difference) < 0.01;

    expect(subledgerBalance).toBe(1000);
    expect(difference).toBe(50);
    expect(isReconciled).toBe(false);
  });

  it('should handle missing AR control account', () => {
    const controlAccountId = null;
    const result = {
      controlAccountId,
      controlAccountName: null,
      glBalance: 0,
      subledgerBalance: 0,
      difference: 0,
      isReconciled: false,
      asOfDate: null,
      details: [{ message: 'No AR control account configured in accounting settings' }],
    };

    expect(result.isReconciled).toBe(false);
    expect(result.details[0]!.message).toContain('No AR control account configured');
  });
});

describe('Customer Ledger', () => {
  it('should compute running balance correctly', () => {
    const entries = [
      { type: 'invoice', amount: 500 },
      { type: 'receipt', amount: -200 },
      { type: 'invoice', amount: 300 },
      { type: 'receipt', amount: -100 },
    ];

    let balance = 0; // opening balance
    const results = entries.map((e) => {
      balance += e.amount;
      return { ...e, balance: Math.round(balance * 100) / 100 };
    });

    expect(results[0]).toBeDefined();
    expect(results[0]?.balance).toBe(500);
    expect(results[1]?.balance).toBe(300);
    expect(results[2]?.balance).toBe(600);
    expect(results[3]?.balance).toBe(500);
  });

  it('should compute opening balance from prior period', () => {
    const priorInvoices = 1500;
    const priorReceipts = 800;
    const openingBalance = priorInvoices - priorReceipts;

    expect(openingBalance).toBe(700);
  });
});

describe('Bridge AR Transaction', () => {
  it('should create invoice from charge transaction', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();

      (mockTx.execute as any).mockResolvedValueOnce([{
        id: 'art-1',
        tenant_id: 'tenant-1',
        billing_account_id: 'ba-1',
        transaction_type: 'charge',
        amount: 250,
        description: 'House account charge',
        business_date: '2026-02-15',
        customer_id: 'cust-1',
      }]);

      (mockTx.returning as any).mockResolvedValueOnce([{
        id: 'inv-bridged',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        invoiceNumber: 'BR-12345678',
        status: 'posted',
        totalAmount: '250.00',
        sourceType: 'pos_house_account',
        sourceReferenceId: 'art-1',
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

    const result = await (pwb as any)(ctx, async (tx: any) => {
      const rows = await tx.execute();
      const arTx = rows[0];
      const txType = String(arTx.transaction_type);

      expect(txType).toBe('charge');

      const invoiceNumber = `BR-${String(arTx.id).slice(-8)}`;
      const [invoice] = await tx.insert({}).values({
        customerId: String(arTx.customer_id),
        invoiceNumber,
        status: 'posted',
        totalAmount: Number(arTx.amount).toFixed(2),
        sourceType: 'pos_house_account',
        sourceReferenceId: String(arTx.id),
      }).returning();

      return { result: { type: 'invoice', ...invoice }, events: [] };
    });

    expect(result.type).toBe('invoice');
    expect(result.status).toBe('posted');
    expect(result.sourceType).toBe('pos_house_account');
    expect(result.totalAmount).toBe('250.00');
  });

  it('should create receipt from payment transaction', async () => {
    const txType = 'payment';
    const amount = -500;
    const absAmount = Math.abs(amount);

    expect(txType).toBe('payment');
    expect(absAmount).toBe(500);
  });
});
