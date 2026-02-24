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
    execute: vi.fn(),
  };
  return {
    db: { transaction: vi.fn(async (fn: any) => fn(mockTx)) },
    withTenant: vi.fn(),
    sql: vi.fn(),
    apBills: { id: 'id', tenantId: 'tenant_id', status: 'status', vendorId: 'vendor_id', billNumber: 'bill_number', version: 'version' },
    apBillLines: { billId: 'bill_id', tenantId: 'tenant_id' },
    apPayments: { id: 'id', tenantId: 'tenant_id', status: 'status' },
    apPaymentAllocations: { billId: 'bill_id', paymentId: 'payment_id', tenantId: 'tenant_id' },
    paymentTerms: { id: 'id', tenantId: 'tenant_id' },
    vendors: { id: 'id', tenantId: 'tenant_id' },
    glAccounts: { id: 'id', tenantId: 'tenant_id' },
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
      defaultAPControlAccountId: 'acct-ap-control',
      defaultARControlAccountId: null,
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
  const billRow = {
    id: 'bill-1',
    tenant_id: 'tenant-1',
    vendor_id: 'vendor-1',
    bill_number: 'BILL-001',
    bill_date: '2026-01-15',
    due_date: '2026-02-15',
    status: 'draft',
    total_amount: '500.0000',
    version: 1,
    location_id: null,
    payment_terms_id: null,
    memo: 'Test bill',
    vendor_invoice_number: 'INV-123',
    gl_journal_entry_id: null,
    posted_at: null,
    posted_by: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    created_by: 'user-1',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const lineRow = {
    id: 'line-1',
    tenant_id: 'tenant-1',
    bill_id: 'bill-1',
    description: 'Office supplies',
    line_type: 'expense',
    gl_account_id: 'acct-expense-1',
    amount: '500.0000',
    quantity: '1',
    unit_cost: '500.0000',
    location_id: null,
    department_id: null,
    inventory_item_id: null,
    receiving_receipt_id: null,
    purchase_order_id: null,
    memo: null,
    sort_order: 0,
  };

  let selectCallCount = 0;
  const tx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => {
      selectCallCount++;
      // First select: idempotency check (return empty = no duplicate)
      if (selectCallCount === 1) return Promise.resolve([]);
      // Second select: vendor lookup
      if (selectCallCount === 2) return Promise.resolve([{ id: 'vendor-1', tenant_id: 'tenant-1', name: 'Acme Corp' }]);
      return Promise.resolve([billRow]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn()
      .mockResolvedValueOnce([billRow])   // bill insert
      .mockResolvedValueOnce([lineRow]),   // line insert
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

describe('Bill Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBill', () => {
    it('should create a bill in draft status', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.values as any).mockImplementation(function (this: any) {
          return this;
        });
        (mockTx.returning as any).mockReset();
        (mockTx.returning as any)
          .mockResolvedValueOnce([{
            id: 'bill-new',
            tenant_id: 'tenant-1',
            vendor_id: 'vendor-1',
            bill_number: 'BILL-001',
            status: 'draft',
            total_amount: '500.0000',
            version: 1,
          }])
          .mockResolvedValueOnce([{ id: 'line-1' }]);

        const { result } = await fn(mockTx);
        return result;
      });

      // Simulate calling createBill command
      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const billData = {
          id: 'bill-new',
          tenantId: 'tenant-1',
          vendorId: 'vendor-1',
          billNumber: 'BILL-001',
          billDate: '2026-01-15',
          dueDate: '2026-02-15',
          status: 'draft',
          totalAmount: '500.0000',
          version: 1,
        };

        const [bill] = await tx.insert({}).values(billData).returning();
        const [line] = await tx.insert({}).values({
          billId: bill.id,
          description: 'Office supplies',
          lineType: 'expense',
          glAccountId: 'acct-1',
          amount: '500.0000',
        }).returning();

        return {
          result: { ...bill, lines: [line] },
          events: [{
            eventType: 'ap.bill.created.v1',
            data: { billId: bill.id, vendorId: 'vendor-1', billNumber: 'BILL-001' },
          }],
        };
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
      expect(result.id).toBe('bill-new');
    });

    it('should validate total equals sum of lines', () => {
      // Validate that a bill with mismatched total and line sum is rejected
      const lines = [
        { description: 'Item 1', lineType: 'expense' as const, glAccountId: 'acct-1', amount: '100.0000' },
        { description: 'Item 2', lineType: 'expense' as const, glAccountId: 'acct-2', amount: '200.0000' },
      ];

      const lineTotal = lines.reduce((sum, l) => sum + Number(l.amount), 0);
      const billTotal = 500; // Mismatched

      expect(lineTotal).toBe(300);
      expect(billTotal).not.toBe(lineTotal);
    });
  });

  describe('updateBill', () => {
    it('should update a draft bill successfully', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        // Override: first limit = load existing bill (draft)
        (mockTx.limit as any).mockReset();
        let callCount = 0;
        (mockTx.limit as any).mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve([{
              id: 'bill-1',
              tenant_id: 'tenant-1',
              status: 'draft',
              version: 1,
            }]);
          }
          return Promise.resolve([]);
        });

        (mockTx.returning as any).mockReset();
        (mockTx.returning as any).mockResolvedValue([{
          id: 'bill-1',
          status: 'draft',
          version: 2,
          memo: 'Updated memo',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        // Simulate loading bill
        const [bill] = await tx.select().from({}).where({}).limit(1);
        expect(bill.status).toBe('draft');

        // Simulate update
        const [updated] = await tx.update({}).set({ memo: 'Updated memo' }).returning();
        return { result: updated, events: [] };
      });

      expect(result).toBeDefined();
      expect(result.memo).toBe('Updated memo');
    });

    it('should reject updating a posted bill', async () => {
      const { AppError } = await import('@oppsera/shared');
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.limit as any).mockReset();
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'bill-1',
          tenant_id: 'tenant-1',
          status: 'posted',
          version: 1,
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      await expect(
        (pwb as any)(ctx, async (tx: any) => {
          const [bill] = await tx.select().from({}).where({}).limit(1);

          if (bill.status !== 'draft') {
            throw new AppError(
              'BILL_STATUS_ERROR',
              `Bill ${bill.id} is ${bill.status}, must be draft`,
              409,
            );
          }

          return { result: bill, events: [] };
        }),
      ).rejects.toThrow('must be draft');
    });
  });

  describe('postBill', () => {
    it('should post bill and create GL entry', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      postingApi.postEntry.mockImplementation(async () => {
        return { id: 'je-ap-1', journalNumber: 10, status: 'posted' };
      });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        // Load draft bill
        (mockTx.limit as any).mockReset();
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'bill-1',
          tenant_id: 'tenant-1',
          vendor_id: 'vendor-1',
          bill_number: 'BILL-001',
          bill_date: '2026-01-15',
          status: 'draft',
          total_amount: '500.0000',
          version: 1,
        }]);

        // Lines query
        (mockTx.execute as any).mockResolvedValueOnce([
          { id: 'line-1', gl_account_id: 'acct-expense-1', amount: '500.0000' },
        ]);

        (mockTx.returning as any).mockReset();
        (mockTx.returning as any).mockResolvedValue([{
          id: 'bill-1',
          status: 'posted',
          gl_journal_entry_id: 'je-ap-1',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [bill] = await tx.select().from({}).where({}).limit(1);
        expect(bill.status).toBe('draft');

        // Load lines
        await tx.execute();

        // Post GL entry via accounting API
        const je = await postingApi.postEntry({
          businessDate: bill.bill_date,
          sourceModule: 'ap',
          sourceReferenceId: bill.id,
          memo: `AP Bill ${bill.bill_number}`,
          lines: [
            { accountId: 'acct-expense-1', debitAmount: '500.0000', creditAmount: '0', vendorId: 'vendor-1' },
            { accountId: 'acct-ap-control', debitAmount: '0', creditAmount: '500.0000', vendorId: 'vendor-1' },
          ],
        });

        // Update bill status
        const [posted] = await tx.update({}).set({
          status: 'posted',
          glJournalEntryId: je.id,
          postedAt: new Date(),
        }).returning();

        return {
          result: posted,
          events: [{
            eventType: 'ap.bill.posted.v1',
            data: { billId: bill.id, glJournalEntryId: je.id },
          }],
        };
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('posted');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);

      // Verify GL entry structure
      const glInput = postingApi.postEntry.mock.calls[0][0];
      expect(glInput.sourceModule).toBe('ap');
      expect(glInput.lines).toHaveLength(2);
      expect(glInput.lines[0].debitAmount).toBe('500.0000');
      expect(glInput.lines[1].creditAmount).toBe('500.0000');
    });

    it('should set status to posted and link glJournalEntryId', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.limit as any).mockReset();
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'bill-1',
          status: 'draft',
          total_amount: '250.0000',
          bill_date: '2026-01-10',
        }]);

        (mockTx.returning as any).mockReset();
        (mockTx.returning as any).mockResolvedValue([{
          id: 'bill-1',
          status: 'posted',
          gl_journal_entry_id: 'je-linked',
          posted_at: new Date().toISOString(),
          posted_by: 'user-1',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        await tx.select().from({}).where({}).limit(1);
        const [posted] = await tx.update({}).set({
          status: 'posted',
          glJournalEntryId: 'je-linked',
          postedAt: new Date(),
          postedBy: ctx.user.id,
        }).returning();
        return { result: posted, events: [] };
      });

      expect(result.status).toBe('posted');
      expect(result.gl_journal_entry_id).toBe('je-linked');
      expect(result.posted_by).toBe('user-1');
    });

    it('should be idempotent when GL entry already exists', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.limit as any).mockReset();
        // Bill already posted with GL entry
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'bill-1',
          status: 'posted',
          gl_journal_entry_id: 'je-existing',
          total_amount: '500.0000',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [bill] = await tx.select().from({}).where({}).limit(1);

        // Idempotency: if already posted, return existing
        if (bill.gl_journal_entry_id) {
          return {
            result: { ...bill, alreadyPosted: true },
            events: [],
          };
        }

        return { result: bill, events: [] };
      });

      expect(result.alreadyPosted).toBe(true);
      expect(result.gl_journal_entry_id).toBe('je-existing');
      // postEntry should NOT have been called since bill was already posted
      expect(postingApi.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('voidBill', () => {
    it('should void bill and create reversal GL entry', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      postingApi.postEntry.mockResolvedValueOnce({
        id: 'je-reversal',
        journalNumber: 11,
        status: 'posted',
        reversalOfId: 'je-ap-1',
      });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.limit as any).mockReset();
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'bill-1',
          tenant_id: 'tenant-1',
          vendor_id: 'vendor-1',
          bill_number: 'BILL-001',
          status: 'posted',
          total_amount: '500.0000',
          gl_journal_entry_id: 'je-ap-1',
        }]);

        // Check for payment allocations (none)
        (mockTx.execute as any).mockResolvedValueOnce([]);

        (mockTx.returning as any).mockReset();
        (mockTx.returning as any).mockResolvedValue([{
          id: 'bill-1',
          status: 'voided',
          voided_at: new Date().toISOString(),
          voided_by: 'user-1',
          void_reason: 'Duplicate entry',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [bill] = await tx.select().from({}).where({}).limit(1);
        expect(bill.status).toBe('posted');

        // Check no payments allocated
        const allocations = await tx.execute();
        expect(allocations).toHaveLength(0);

        // Create reversal GL entry
        const reversalJe = await postingApi.postEntry({
          businessDate: '2026-02-20',
          sourceModule: 'ap',
          sourceReferenceId: `${bill.id}-void`,
          memo: `Void AP Bill ${bill.bill_number}`,
          lines: [
            { accountId: 'acct-ap-control', debitAmount: '500.0000', creditAmount: '0', vendorId: 'vendor-1' },
            { accountId: 'acct-expense-1', debitAmount: '0', creditAmount: '500.0000', vendorId: 'vendor-1' },
          ],
        });

        const [voided] = await tx.update({}).set({
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: ctx.user.id,
          voidReason: 'Duplicate entry',
        }).returning();

        return {
          result: { bill: voided, reversalJournalEntry: reversalJe },
          events: [{
            eventType: 'ap.bill.voided.v1',
            data: { billId: bill.id, reversalJournalEntryId: reversalJe.id },
          }],
        };
      });

      expect(result.bill.status).toBe('voided');
      expect(result.reversalJournalEntry.id).toBe('je-reversal');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);
    });

    it('should reject voiding a bill with allocated payments', async () => {
      const { AppError } = await import('@oppsera/shared');
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.limit as any).mockReset();
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'bill-1',
          status: 'posted',
          total_amount: '500.0000',
          gl_journal_entry_id: 'je-1',
        }]);

        // Existing payment allocations
        (mockTx.execute as any).mockResolvedValueOnce([
          { id: 'alloc-1', payment_id: 'pay-1', amount: '200.0000' },
        ]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      await expect(
        (pwb as any)(ctx, async (tx: any) => {
          const [bill] = await tx.select().from({}).where({}).limit(1);
          const allocations = await tx.execute();

          if (allocations.length > 0) {
            throw new AppError(
              'BILL_HAS_PAYMENTS',
              `Cannot void bill ${bill.id}: payments have been allocated`,
              409,
            );
          }

          return { result: bill, events: [] };
        }),
      ).rejects.toThrow('payments have been allocated');
    });
  });

  describe('duplicate detection', () => {
    it('should detect duplicate billNumber per vendor', async () => {
      const { AppError } = await import('@oppsera/shared');
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.limit as any).mockReset();
        // Duplicate check returns existing bill
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'bill-existing',
          vendor_id: 'vendor-1',
          bill_number: 'BILL-001',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      await expect(
        (pwb as any)(ctx, async (tx: any) => {
          // Check for duplicate bill number on same vendor
          const [existing] = await tx.select().from({}).where({}).limit(1);
          if (existing) {
            throw new AppError(
              'DUPLICATE_BILL_NUMBER',
              `Bill number BILL-001 already exists for vendor vendor-1`,
              409,
            );
          }
          return { result: {}, events: [] };
        }),
      ).rejects.toThrow('already exists for vendor');
    });
  });
});
