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
    glJournalEntryId: 'gl_journal_entry_id',
  },
  arInvoiceLines: {
    id: 'id',
    invoiceId: 'invoice_id',
    accountId: 'account_id',
    amount: 'amount',
    description: 'description',
  },
  arReceiptAllocations: {
    receiptId: 'receipt_id',
    invoiceId: 'invoice_id',
    amountApplied: 'amount_applied',
  },
  customers: {
    id: 'id',
    tenantId: 'tenant_id',
  },
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

// ── Tests ─────────────────────────────────────────────────────────────

describe('createInvoice', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-set default implementations after reset
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

  it('should create a draft invoice with computed total from lines', async () => {
    const { createInvoice } = await import('../commands/create-invoice');

    const invoiceRow = {
      id: 'inv-1',
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      invoiceNumber: 'INV-001',
      status: 'draft',
      totalAmount: '750.00',
      amountPaid: '0',
      balanceDue: '750.00',
    };

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Customer lookup returns a match
      (mockTx.limit as any).mockResolvedValueOnce([{ id: 'cust-1' }]);
      // Invoice insert
      (mockTx.returning as any).mockResolvedValueOnce([invoiceRow]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await createInvoice(ctx, {
      customerId: 'cust-1',
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-02-15',
      dueDate: '2026-03-15',
      sourceType: 'manual',
      lines: [
        { accountId: 'acct-rev-1', description: 'Service A', amount: '500.00' },
        { accountId: 'acct-rev-2', description: 'Service B', amount: '200.00', taxAmount: '50.00' },
      ],
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('inv-1');
    expect(result.status).toBe('draft');
    expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'ar.invoice.created', 'ar_invoice', 'inv-1');
  });

  it('should throw NotFoundError when customer does not exist', async () => {
    const { createInvoice } = await import('../commands/create-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Customer lookup returns empty
      (mockTx.limit as any).mockResolvedValueOnce([]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(
      createInvoice(ctx, {
        customerId: 'nonexistent-cust',
        invoiceNumber: 'INV-002',
        invoiceDate: '2026-02-15',
        dueDate: '2026-03-15',
        sourceType: 'manual',
        lines: [{ accountId: 'acct-1', description: 'Test', amount: '100.00' }],
      }),
    ).rejects.toThrow('not found');
  });

  it('should compute total including tax amounts from lines', () => {
    const lines = [
      { amount: '200.00', taxAmount: '16.00' },
      { amount: '300.00', taxAmount: '24.00' },
      { amount: '100.00', taxAmount: undefined },
    ];

    let totalAmount = 0;
    for (const line of lines) {
      totalAmount += Number(line.amount) + Number(line.taxAmount ?? '0');
    }

    expect(totalAmount.toFixed(2)).toBe('640.00');
  });

  it('should emit ar.invoice.created.v1 event', async () => {
    const { createInvoice } = await import('../commands/create-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{ id: 'cust-1' }]);
      (mockTx.returning as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        invoiceNumber: 'INV-001',
        status: 'draft',
        totalAmount: '100.00',
        amountPaid: '0',
        balanceDue: '100.00',
      }]);
      const { result, events } = await fn(mockTx);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('ar.invoice.created.v1');
      return result;
    });

    const ctx = createCtx();
    await createInvoice(ctx, {
      customerId: 'cust-1',
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-02-15',
      dueDate: '2026-03-15',
      sourceType: 'manual',
      lines: [{ accountId: 'acct-1', description: 'Test', amount: '100.00' }],
    });
  });

  it('should default amountPaid to 0 and balanceDue to totalAmount', async () => {
    const { createInvoice } = await import('../commands/create-invoice');

    let capturedValues: any = null;
    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{ id: 'cust-1' }]);

      (mockTx.values as any).mockImplementation((vals: any) => {
        // Capture the first values call (the invoice insert)
        if (!capturedValues && vals.status === 'draft') {
          capturedValues = vals;
        }
        return { returning: (mockTx.returning as any) };
      });

      (mockTx.returning as any)
        .mockResolvedValueOnce([{
          id: 'inv-1',
          totalAmount: '350.00',
          amountPaid: '0',
          balanceDue: '350.00',
          status: 'draft',
        }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await createInvoice(ctx, {
      customerId: 'cust-1',
      invoiceNumber: 'INV-005',
      invoiceDate: '2026-02-15',
      dueDate: '2026-03-15',
      sourceType: 'manual',
      lines: [{ accountId: 'acct-1', description: 'Test', amount: '350.00' }],
    });

    expect(capturedValues).toBeDefined();
    expect(capturedValues.amountPaid).toBe('0');
    expect(capturedValues.balanceDue).toBe('350.00');
  });
});

describe('postInvoice', () => {
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
      defaultAPControlAccountId: null,
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

  it('should post a draft invoice and create GL entry', async () => {
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
            totalAmount: '500.00',
            currency: 'USD',
            locationId: null,
            memo: null,
            glJournalEntryId: null,
          }]);
        }
        return Promise.resolve([]);
      });

      // Lines query (no limit)
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) {
          return [
            { accountId: 'acct-rev-1', amount: '300.00', description: 'Service A' },
            { accountId: 'acct-rev-2', amount: '200.00', description: 'Service B' },
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
    const result = await postInvoice(ctx, { invoiceId: 'inv-1' });

    expect(result).toBeDefined();
    expect(result.status).toBe('posted');
    expect(result.glJournalEntryId).toBe('je-1');
    expect(mockPostEntry).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'ar.invoice.posted', 'ar_invoice', 'inv-1');
  });

  it('should throw InvoiceStatusError for non-draft invoice', async () => {
    const { postInvoice } = await import('../commands/post-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: 'posted',
        glJournalEntryId: null,
      }]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(postInvoice(ctx, { invoiceId: 'inv-1' })).rejects.toThrow('expected draft');
  });

  it('should throw NotFoundError for non-existent invoice', async () => {
    const { postInvoice } = await import('../commands/post-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(postInvoice(ctx, { invoiceId: 'inv-nonexistent' })).rejects.toThrow('not found');
  });

  it('should return existing result when invoice already has glJournalEntryId (idempotent)', async () => {
    const { postInvoice } = await import('../commands/post-invoice');

    const existingInvoice = {
      id: 'inv-1',
      tenantId: 'tenant-1',
      status: 'draft',
      glJournalEntryId: 'je-existing',
    };

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([existingInvoice]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await postInvoice(ctx, { invoiceId: 'inv-1' });

    expect(result).toBeDefined();
    expect(result.glJournalEntryId).toBe('je-existing');
    expect(mockPostEntry).not.toHaveBeenCalled();
  });

  it('should throw when no AR control account is configured', async () => {
    const { postInvoice } = await import('../commands/post-invoice');

    mockGetSettings.mockResolvedValueOnce({
      defaultARControlAccountId: null,
      baseCurrency: 'USD',
    });

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      let limitCallCount = 0;
      (mockTx.limit as any).mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve([{
            id: 'inv-1',
            tenantId: 'tenant-1',
            status: 'draft',
            totalAmount: '100.00',
            currency: 'USD',
            glJournalEntryId: null,
            customerId: 'cust-1',
            invoiceNumber: 'INV-001',
            invoiceDate: '2026-02-15',
            locationId: null,
            memo: null,
          }]);
        }
        return Promise.resolve([]);
      });
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) return [{ accountId: 'acct-1', amount: '100.00', description: 'Svc' }];
        return this;
      });
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(postInvoice(ctx, { invoiceId: 'inv-1' })).rejects.toThrow('No AR control account');
  });

  it('should throw when invoice has no lines', async () => {
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
            status: 'draft',
            totalAmount: '0',
            currency: 'USD',
            glJournalEntryId: null,
            customerId: 'cust-1',
            invoiceNumber: 'INV-001',
            invoiceDate: '2026-02-15',
            locationId: null,
            memo: null,
          }]);
        }
        return Promise.resolve([]);
      });
      // Lines query returns empty
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) return [];
        return this;
      });
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(postInvoice(ctx, { invoiceId: 'inv-1' })).rejects.toThrow('no lines');
  });
});

describe('voidInvoice', () => {
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

  it('should void a posted invoice and create GL reversal', async () => {
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
            totalAmount: '500.00',
            currency: 'USD',
            glJournalEntryId: 'je-1',
            locationId: null,
          }]);
        }
        return Promise.resolve([]);
      });

      // Receipt allocations check — return empty (no allocations)
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        // 2nd where call = allocations check, 3rd = lines for GL reversal
        if (whereCallCount === 2) return [];
        if (whereCallCount === 3) {
          return [
            { accountId: 'acct-rev-1', amount: '300.00', description: 'Svc A' },
            { accountId: 'acct-rev-2', amount: '200.00', description: 'Svc B' },
          ];
        }
        return this;
      });

      (mockTx.returning as any).mockResolvedValueOnce([{
        id: 'inv-1',
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: 'user-1',
        voidReason: 'Customer dispute',
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await voidInvoice(ctx, { invoiceId: 'inv-1', reason: 'Customer dispute' });

    expect(result).toBeDefined();
    expect(result.status).toBe('voided');
    expect(mockPostEntry).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'ar.invoice.voided', 'ar_invoice', 'inv-1');
  });

  it('should throw when invoice has receipt allocations', async () => {
    const { voidInvoice } = await import('../commands/void-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: 'posted',
        totalAmount: '500.00',
        currency: 'USD',
        glJournalEntryId: 'je-1',
      }]);

      // Allocations check returns a hit
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) {
          return [{ receiptId: 'rcp-1', invoiceId: 'inv-1', amountApplied: '200.00' }];
        }
        return this;
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(voidInvoice(ctx, { invoiceId: 'inv-1', reason: 'Test' })).rejects.toThrow(
      'Cannot void invoice with receipt allocations',
    );
  });

  it('should throw when voiding a draft invoice', async () => {
    const { voidInvoice } = await import('../commands/void-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: 'draft',
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(voidInvoice(ctx, { invoiceId: 'inv-1', reason: 'Test' })).rejects.toThrow(
      'must be posted or partial',
    );
  });

  it('should throw NotFoundError for non-existent invoice', async () => {
    const { voidInvoice } = await import('../commands/void-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([]);
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(voidInvoice(ctx, { invoiceId: 'inv-x', reason: 'Test' })).rejects.toThrow('not found');
  });

  it('should allow voiding a partial invoice', async () => {
    const { voidInvoice } = await import('../commands/void-invoice');

    mockPublishWithOutbox.mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'inv-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        invoiceNumber: 'INV-001',
        invoiceDate: '2026-02-15',
        status: 'partial',
        totalAmount: '500.00',
        currency: 'USD',
        glJournalEntryId: 'je-1',
        locationId: null,
      }]);

      // No allocations
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function (this: any) {
        whereCallCount++;
        if (whereCallCount === 2) return [];
        if (whereCallCount === 3) return [{ accountId: 'acct-1', amount: '500.00', description: 'Svc' }];
        return this;
      });

      (mockTx.returning as any).mockResolvedValueOnce([{
        id: 'inv-1',
        status: 'voided',
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await voidInvoice(ctx, { invoiceId: 'inv-1', reason: 'Correction needed' });

    expect(result).toBeDefined();
    expect(result.status).toBe('voided');
  });
});
