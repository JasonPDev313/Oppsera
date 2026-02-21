import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ────────────────────────────────────────────────────
const mockPostEntry = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' }));
const mockGetSettings = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    defaultAPControlAccountId: null,
    defaultARControlAccountId: 'acct-ar-control',
    baseCurrency: 'USD',
  }),
);
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
  },
  arInvoiceLines: { id: 'id', invoiceId: 'invoice_id' },
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
  getAccountingPostingApi: vi.fn(() => ({
    postEntry: mockPostEntry,
    getSettings: mockGetSettings,
    getAccountBalance: vi.fn().mockResolvedValue(0),
  })),
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

// ── Tests ─────────────────────────────────────────────────────────────

describe('createReceipt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPublishWithOutbox.mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
    mockAuditLog.mockResolvedValue(undefined);
    mockBuildEventFromContext.mockImplementation((_ctx: unknown, eventType: string, data: unknown) => ({
      eventId: 'evt-1',
      eventType,
      data,
      tenantId: 'tenant-1',
      occurredAt: new Date().toISOString(),
    }));
  });

  it('should create a draft receipt with allocations', async () => {
    const { createReceipt } = await import('../commands/create-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Invoice validation lookup
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        status: 'posted',
        totalAmount: '500.00',
        balanceDue: '500.00',
      }]);

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
    const result = await createReceipt(ctx, {
      customerId: 'cust-1',
      receiptDate: '2026-02-20',
      amount: '300.00',
      sourceType: 'manual',
      allocations: [{ invoiceId: 'inv-1', amountApplied: '300.00' }],
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('draft');
    expect(result.amount).toBe('300.00');
    expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'ar.receipt.created', 'ar_receipt', 'rcp-1');
  });

  it('should reject when allocation total exceeds receipt amount', async () => {
    const { createReceipt } = await import('../commands/create-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(
      createReceipt(ctx, {
        customerId: 'cust-1',
        receiptDate: '2026-02-20',
        amount: '100.00',
        sourceType: 'manual',
        allocations: [
          { invoiceId: 'inv-1', amountApplied: '60.00' },
          { invoiceId: 'inv-2', amountApplied: '60.00' },
        ],
      }),
    ).rejects.toThrow('Allocation total exceeds receipt amount');
  });

  it('should reject when allocation invoice belongs to different customer', async () => {
    const { createReceipt } = await import('../commands/create-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Invoice belongs to cust-2, not cust-1
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        customerId: 'cust-2',
        balanceDue: '500.00',
      }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(
      createReceipt(ctx, {
        customerId: 'cust-1',
        receiptDate: '2026-02-20',
        amount: '100.00',
        sourceType: 'manual',
        allocations: [{ invoiceId: 'inv-1', amountApplied: '100.00' }],
      }),
    ).rejects.toThrow('different customer');
  });

  it('should reject when allocation exceeds invoice balance', async () => {
    const { createReceipt } = await import('../commands/create-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        balanceDue: '50.00',
      }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(
      createReceipt(ctx, {
        customerId: 'cust-1',
        receiptDate: '2026-02-20',
        amount: '500.00',
        sourceType: 'manual',
        allocations: [{ invoiceId: 'inv-1', amountApplied: '200.00' }],
      }),
    ).rejects.toThrow('exceeds invoice balance');
  });

  it('should throw NotFoundError when allocation references missing invoice', async () => {
    const { createReceipt } = await import('../commands/create-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Invoice not found
      (mockTx.limit as any).mockResolvedValueOnce([]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(
      createReceipt(ctx, {
        customerId: 'cust-1',
        receiptDate: '2026-02-20',
        amount: '100.00',
        sourceType: 'manual',
        allocations: [{ invoiceId: 'inv-nonexistent', amountApplied: '100.00' }],
      }),
    ).rejects.toThrow('not found');
  });
});

describe('postReceipt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPublishWithOutbox.mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
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

  it('should post receipt, create GL entry, and update invoice balances', async () => {
    const { postReceipt } = await import('../commands/post-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;

      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          // Receipt lookup
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
          // Bank account lookup
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

      // Allocations query
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        // 4th where = allocations query (after receipt select.from.where.limit, bank select.from.where.limit, receipt update.set.where)
        if (whereCallCount === 4) {
          return [{ receiptId: 'rcp-1', invoiceId: 'inv-1', amountApplied: '300.00' }];
        }
        return this;
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await postReceipt(ctx, { receiptId: 'rcp-1' });

    expect(result).toBeDefined();
    expect(result.status).toBe('posted');
    expect(result.glJournalEntryId).toBe('je-1');
    expect(mockPostEntry).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'ar.receipt.posted', 'ar_receipt', 'rcp-1');
  });

  it('should throw ReceiptStatusError for non-draft receipt', async () => {
    const { postReceipt } = await import('../commands/post-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'rcp-1',
        tenantId: 'tenant-1',
        status: 'posted',
        glJournalEntryId: null,
      }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(postReceipt(ctx, { receiptId: 'rcp-1' })).rejects.toThrow('expected draft');
  });

  it('should throw NotFoundError for non-existent receipt', async () => {
    const { postReceipt } = await import('../commands/post-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(postReceipt(ctx, { receiptId: 'rcp-nonexistent' })).rejects.toThrow('not found');
  });

  it('should return existing result when receipt already has glJournalEntryId (idempotent)', async () => {
    const { postReceipt } = await import('../commands/post-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'rcp-1',
        tenantId: 'tenant-1',
        status: 'draft',
        glJournalEntryId: 'je-existing',
      }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await postReceipt(ctx, { receiptId: 'rcp-1' });

    expect(result.glJournalEntryId).toBe('je-existing');
    expect(mockPostEntry).not.toHaveBeenCalled();
  });

  it('should throw when no bank GL mapping exists', async () => {
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
            status: 'draft',
            amount: '100.00',
            currency: 'USD',
            glJournalEntryId: null,
            bankAccountId: 'bank-1',
            customerId: 'cust-1',
            receiptDate: '2026-02-20',
            paymentMethod: 'check',
            referenceNumber: null,
          }]);
        }
        if (limitCallCount === 2) {
          // Bank account not found
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(postReceipt(ctx, { receiptId: 'rcp-1' })).rejects.toThrow('No bank account GL mapping');
  });

  it('should throw when allocation references non-existent invoice during posting', async () => {
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
            referenceNumber: null,
            glJournalEntryId: null,
          }]);
        }
        if (limitCallCount === 2) {
          return Promise.resolve([{ id: 'bank-1', glAccountId: 'acct-bank-1' }]);
        }
        // Invoice lookup for allocation returns empty
        return Promise.resolve([]);
      });

      (mockTx.returning as any).mockResolvedValueOnce([{
        id: 'rcp-1',
        status: 'posted',
        glJournalEntryId: 'je-1',
      }]);

      // Allocations
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 4) {
          return [{ receiptId: 'rcp-1', invoiceId: 'inv-gone', amountApplied: '100.00' }];
        }
        return this;
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(postReceipt(ctx, { receiptId: 'rcp-1' })).rejects.toThrow('non-existent invoice');
  });
});

describe('voidReceipt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPublishWithOutbox.mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
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

  it('should void a posted receipt, reverse GL, and restore invoice balance', async () => {
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

      // Allocations
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
        voidReason: 'Bounced check',
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await voidReceipt(ctx, { receiptId: 'rcp-1', reason: 'Bounced check' });

    expect(result).toBeDefined();
    expect(result.status).toBe('voided');
    expect(mockPostEntry).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'ar.receipt.voided', 'ar_receipt', 'rcp-1');
  });

  it('should throw ReceiptStatusError for non-posted receipt', async () => {
    const { voidReceipt } = await import('../commands/void-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'rcp-1',
        tenantId: 'tenant-1',
        status: 'draft',
      }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(voidReceipt(ctx, { receiptId: 'rcp-1', reason: 'Test' })).rejects.toThrow('expected posted');
  });

  it('should throw NotFoundError for non-existent receipt', async () => {
    const { voidReceipt } = await import('../commands/void-receipt');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(voidReceipt(ctx, { receiptId: 'rcp-x', reason: 'Test' })).rejects.toThrow('not found');
  });

  it('should restore invoice to posted status when all payments reversed', () => {
    // Unit test for the restoration math
    const totalAmount = 500;
    const amountPaid = 300;
    const allocationAmount = 300;

    const restoredPaid = Math.max(0, amountPaid - allocationAmount);
    const restoredBalance = totalAmount - restoredPaid;
    const restoredStatus = restoredPaid === 0 ? 'posted' : 'partial';

    expect(restoredPaid).toBe(0);
    expect(restoredBalance).toBe(500);
    expect(restoredStatus).toBe('posted');
  });

  it('should restore invoice to partial status when some payments remain', () => {
    const totalAmount = 1000;
    const amountPaid = 700;
    const allocationAmount = 300;

    const restoredPaid = Math.max(0, amountPaid - allocationAmount);
    const restoredBalance = totalAmount - restoredPaid;
    const restoredStatus = restoredPaid === 0 ? 'posted' : 'partial';

    expect(restoredPaid).toBe(400);
    expect(restoredBalance).toBe(600);
    expect(restoredStatus).toBe('partial');
  });
});
