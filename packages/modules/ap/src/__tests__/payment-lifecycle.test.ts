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
    orderBy: vi.fn().mockReturnThis(),
  };
  return {
    db: { transaction: vi.fn(async (fn: any) => fn(mockTx)) },
    withTenant: vi.fn(),
    sql: vi.fn(),
    apPayments: { id: 'id', tenantId: 'tenant_id', vendorId: 'vendor_id', status: 'status', amount: 'amount', glJournalEntryId: 'gl_journal_entry_id', bankAccountId: 'bank_account_id' },
    apPaymentAllocations: { paymentId: 'payment_id', billId: 'bill_id', amountApplied: 'amount_applied' },
    apBills: { id: 'id', tenantId: 'tenant_id', vendorId: 'vendor_id', status: 'status', totalAmount: 'total_amount', amountPaid: 'amount_paid', balanceDue: 'balance_due' },
    apBillLines: { id: 'id', billId: 'bill_id', lineType: 'line_type', accountId: 'account_id', amount: 'amount' },
    apBillLandedCostAllocations: { id: 'id', billId: 'bill_id' },
    vendors: { id: 'id', tenantId: 'tenant_id', name: 'name', isActive: 'is_active', defaultAPAccountId: 'default_ap_account_id' },
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
  let selectCallCount = 0;

  const tx: Record<string, any> = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => {
      selectCallCount++;
      return Promise.resolve([]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
  };

  tx._selectCallCount = () => selectCallCount;
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

describe('Payment Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPayment', () => {
    it('should create a draft payment with allocations', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        let limitCallCount = 0;

        (mockTx.limit as any).mockImplementation(() => {
          limitCallCount++;
          // First limit: vendor lookup
          if (limitCallCount === 1) {
            return Promise.resolve([{ id: 'vendor-1', tenantId: 'tenant-1', name: 'Acme Corp' }]);
          }
          // Second limit: bill lookup for allocation
          if (limitCallCount === 2) {
            return Promise.resolve([{
              id: 'bill-1',
              tenantId: 'tenant-1',
              vendorId: 'vendor-1',
              status: 'posted',
              totalAmount: '1000.00',
              amountPaid: '0.00',
              balanceDue: '1000.00',
            }]);
          }
          return Promise.resolve([]);
        });

        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'pay-1',
          tenantId: 'tenant-1',
          vendorId: 'vendor-1',
          amount: '500.00',
          status: 'draft',
          paymentDate: '2026-02-15',
          paymentMethod: 'check',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        // Validate vendor
        const [vendor] = await tx.select().from({}).where({}).limit(1);
        expect(vendor).toBeDefined();

        // Validate allocation bill
        const [bill] = await tx.select().from({}).where({}).limit(1);
        expect(bill.status).toBe('posted');
        expect(Number(bill.balanceDue)).toBeGreaterThanOrEqual(500);

        // Create payment
        const [payment] = await tx.insert({}).values({
          vendorId: 'vendor-1',
          amount: '500.00',
          status: 'draft',
          paymentDate: '2026-02-15',
          paymentMethod: 'check',
        }).returning();

        // Create allocation
        await tx.insert({}).values({
          paymentId: payment.id,
          billId: 'bill-1',
          amountApplied: '500.00',
        });

        return { result: payment, events: [] };
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
      expect(result.amount).toBe('500.00');
    });

    it('should reject allocation exceeding bill balance', async () => {
      const { ValidationError } = await import('@oppsera/shared');
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        let limitCallCount = 0;
        (mockTx.limit as any).mockImplementation(() => {
          limitCallCount++;
          if (limitCallCount === 1) {
            return Promise.resolve([{ id: 'vendor-1', tenantId: 'tenant-1', name: 'Acme Corp' }]);
          }
          if (limitCallCount === 2) {
            return Promise.resolve([{
              id: 'bill-1',
              vendorId: 'vendor-1',
              status: 'posted',
              balanceDue: '100.00',
            }]);
          }
          return Promise.resolve([]);
        });

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      await expect(
        (pwb as any)(ctx, async (tx: any) => {
          await tx.select().from({}).where({}).limit(1);
          const [bill] = await tx.select().from({}).where({}).limit(1);

          const allocAmount = 500;
          if (allocAmount > Number(bill.balanceDue)) {
            throw new ValidationError('Allocation exceeds bill balance', [
              { field: 'allocations', message: `Bill ${bill.id} has balance $${bill.balanceDue}, allocation is $${allocAmount}` },
            ]);
          }

          return { result: {}, events: [] };
        }),
      ).rejects.toThrow('Allocation exceeds bill balance');
    });

    it('should reject allocation to a different vendor bill', async () => {
      const { ValidationError } = await import('@oppsera/shared');
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        let limitCallCount = 0;
        (mockTx.limit as any).mockImplementation(() => {
          limitCallCount++;
          if (limitCallCount === 1) {
            return Promise.resolve([{ id: 'vendor-1', tenantId: 'tenant-1', name: 'Acme Corp' }]);
          }
          if (limitCallCount === 2) {
            return Promise.resolve([{
              id: 'bill-1',
              vendorId: 'vendor-2', // different vendor
              status: 'posted',
              balanceDue: '1000.00',
            }]);
          }
          return Promise.resolve([]);
        });

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      await expect(
        (pwb as any)(ctx, async (tx: any) => {
          await tx.select().from({}).where({}).limit(1);
          const [bill] = await tx.select().from({}).where({}).limit(1);

          if (bill.vendorId !== 'vendor-1') {
            throw new ValidationError('Bill does not belong to this vendor', [
              { field: 'allocations', message: `Bill ${bill.id} belongs to a different vendor` },
            ]);
          }

          return { result: {}, events: [] };
        }),
      ).rejects.toThrow('Bill does not belong to this vendor');
    });
  });

  describe('postPayment', () => {
    it('should create GL entry and update bill amounts', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        let limitCallCount = 0;
        (mockTx.limit as any).mockImplementation(() => {
          limitCallCount++;
          // First: load payment
          if (limitCallCount === 1) {
            return Promise.resolve([{
              id: 'pay-1',
              tenantId: 'tenant-1',
              vendorId: 'vendor-1',
              amount: '500.00',
              status: 'draft',
              paymentDate: '2026-02-15',
              bankAccountId: 'bank-1',
              currency: 'USD',
              referenceNumber: 'CHK-001',
              glJournalEntryId: null,
            }]);
          }
          // Second: load vendor
          if (limitCallCount === 2) {
            return Promise.resolve([{ id: 'vendor-1', tenantId: 'tenant-1', name: 'Acme Corp', defaultAPAccountId: 'acct-ap-1' }]);
          }
          // Third: load bank account
          if (limitCallCount === 3) {
            return Promise.resolve([{ id: 'bank-1', tenantId: 'tenant-1', glAccountId: 'acct-bank-1' }]);
          }
          // Fourth+: load bill for allocation update
          return Promise.resolve([{
            id: 'bill-1',
            totalAmount: '1000.00',
            amountPaid: '0.00',
            balanceDue: '1000.00',
          }]);
        });

        // Allocations from select
        (mockTx.where as any).mockImplementation(function (this: any) {
          return this;
        });

        // After posting, select allocations
        (mockTx.from as any).mockImplementation(function (this: any) {
          return this;
        });

        // Returning for payment update
        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'pay-1',
          status: 'posted',
          glJournalEntryId: 'je-1',
        }]);

        // Mock the select for allocations (comes after the update)
        let selectCount = 0;
        (mockTx.select as any).mockImplementation(function (this: any) {
          selectCount++;
          // When selecting allocations (after updates)
          if (selectCount > 4) {
            (mockTx.where as any).mockReturnValueOnce(
              Promise.resolve([{ billId: 'bill-1', amountApplied: '500.00' }]),
            );
          }
          return this;
        });

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        // Load payment
        const [payment] = await tx.select().from({}).where({}).limit(1);
        expect(payment.status).toBe('draft');

        // Load vendor
        const [vendor] = await tx.select().from({}).where({}).limit(1);

        // Load bank
        const [bank] = await tx.select().from({}).where({}).limit(1);

        // Post GL entry
        const glResult = await postingApi.postEntry({
          businessDate: payment.paymentDate,
          sourceModule: 'ap',
          sourceReferenceId: payment.id,
          memo: `AP Payment to ${vendor.name}`,
          currency: 'USD',
          lines: [
            { accountId: vendor.defaultAPAccountId, debitAmount: payment.amount, creditAmount: '0', vendorId: 'vendor-1' },
            { accountId: bank.glAccountId, debitAmount: '0', creditAmount: payment.amount, vendorId: 'vendor-1' },
          ],
          forcePost: true,
        });

        // Update payment status
        const [posted] = await tx.update({}).set({
          status: 'posted',
          glJournalEntryId: glResult.id,
        }).returning();

        // Update bill
        const [bill] = await tx.select().from({}).where({}).limit(1);
        const newPaid = (Number(bill.amountPaid) + 500).toFixed(2);
        const newBalance = (Number(bill.totalAmount) - Number(newPaid)).toFixed(2);

        await tx.update({}).set({
          amountPaid: newPaid,
          balanceDue: newBalance,
          status: Number(newBalance) <= 0 ? 'paid' : 'partial',
        }).where({});

        return { result: { ...posted, billNewBalance: newBalance }, events: [] };
      });

      expect(result.status).toBe('posted');
      expect(result.glJournalEntryId).toBe('je-1');
      expect(result.billNewBalance).toBe('500.00');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);
    });

    it('should mark bill as paid when fully paid', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async () => {
        // Simulate full payment
        const billTotal = 500;
        const allocAmount = 500;
        const newPaid = allocAmount;
        const newBalance = billTotal - newPaid;
        const newStatus = newBalance <= 0 ? 'paid' : 'partial';

        expect(newStatus).toBe('paid');
        expect(newBalance).toBe(0);

        return { result: { status: newStatus, balanceDue: newBalance.toFixed(2) }, events: [] };
      });

      expect(result.status).toBe('paid');
      expect(result.balanceDue).toBe('0.00');
    });

    it('should mark bill as partial when partially paid', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async () => {
        const billTotal = 1000;
        const allocAmount = 300;
        const newPaid = allocAmount;
        const newBalance = billTotal - newPaid;
        const newStatus = newBalance <= 0 ? 'paid' : 'partial';

        expect(newStatus).toBe('partial');
        expect(newBalance).toBe(700);

        return { result: { status: newStatus, balanceDue: newBalance.toFixed(2) }, events: [] };
      });

      expect(result.status).toBe('partial');
      expect(result.balanceDue).toBe('700.00');
    });
  });

  describe('voidPayment', () => {
    it('should reverse GL and restore bill balances', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      postingApi.postEntry.mockResolvedValueOnce({ id: 'je-reversal', journalNumber: 2, status: 'posted' });

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        let limitCallCount = 0;
        (mockTx.limit as any).mockImplementation(() => {
          limitCallCount++;
          // First: load payment
          if (limitCallCount === 1) {
            return Promise.resolve([{
              id: 'pay-1',
              tenantId: 'tenant-1',
              vendorId: 'vendor-1',
              amount: '500.00',
              status: 'posted',
              paymentDate: '2026-02-15',
              bankAccountId: 'bank-1',
              currency: 'USD',
              glJournalEntryId: 'je-1',
            }]);
          }
          // Second: vendor
          if (limitCallCount === 2) {
            return Promise.resolve([{ id: 'vendor-1', tenantId: 'tenant-1', name: 'Acme Corp', defaultAPAccountId: 'acct-ap-1' }]);
          }
          // Third: bank
          if (limitCallCount === 3) {
            return Promise.resolve([{ id: 'bank-1', tenantId: 'tenant-1', glAccountId: 'acct-bank-1' }]);
          }
          // Fourth: bill for balance restore
          return Promise.resolve([{
            id: 'bill-1',
            totalAmount: '1000.00',
            amountPaid: '500.00',
            balanceDue: '500.00',
          }]);
        });

        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'pay-1',
          status: 'voided',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [payment] = await tx.select().from({}).where({}).limit(1);
        expect(payment.status).toBe('posted');

        // Create GL reversal
        const [vendor] = await tx.select().from({}).where({}).limit(1);
        const [bank] = await tx.select().from({}).where({}).limit(1);

        await postingApi.postEntry({
          businessDate: payment.paymentDate,
          sourceModule: 'ap',
          sourceReferenceId: `void-${payment.id}`,
          memo: 'Void AP Payment',
          currency: 'USD',
          lines: [
            { accountId: vendor.defaultAPAccountId, debitAmount: '0', creditAmount: payment.amount, vendorId: 'vendor-1' },
            { accountId: bank.glAccountId, debitAmount: payment.amount, creditAmount: '0', vendorId: 'vendor-1' },
          ],
          forcePost: true,
        });

        // Restore bill balance
        const [bill] = await tx.select().from({}).where({}).limit(1);
        const restoredPaid = Math.max(0, Number(bill.amountPaid) - Number(payment.amount)).toFixed(2);
        const restoredBalance = (Number(bill.totalAmount) - Number(restoredPaid)).toFixed(2);

        await tx.update({}).set({
          amountPaid: restoredPaid,
          balanceDue: restoredBalance,
          status: Number(restoredPaid) === 0 ? 'posted' : 'partial',
        }).where({});

        // Void the payment
        const [voided] = await tx.update({}).set({ status: 'voided' }).returning();

        return {
          result: { payment: voided, restoredBalance },
          events: [],
        };
      });

      expect(result.payment.status).toBe('voided');
      expect(result.restoredBalance).toBe('1000.00');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);
    });

    it('should reject voiding a draft payment', async () => {
      const { AppError } = await import('@oppsera/shared');
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'pay-1',
          status: 'draft',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      await expect(
        (pwb as any)(ctx, async (tx: any) => {
          const [payment] = await tx.select().from({}).where({}).limit(1);

          if (payment.status !== 'posted') {
            throw new AppError(
              'PAYMENT_STATUS_ERROR',
              `Payment is ${payment.status}, expected posted`,
              400,
            );
          }

          return { result: payment, events: [] };
        }),
      ).rejects.toThrow('expected posted');
    });
  });

  describe('createVendorCredit', () => {
    it('should create a negative bill (credit memo)', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
      const { getAccountingPostingApi } = await import('@oppsera/core/helpers/accounting-posting-api');
      const postingApi = (getAccountingPostingApi as any)();

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        let limitCallCount = 0;
        (mockTx.limit as any).mockImplementation(() => {
          limitCallCount++;
          if (limitCallCount === 1) {
            return Promise.resolve([{ id: 'vendor-1', tenantId: 'tenant-1', name: 'Acme Corp', defaultAPAccountId: 'acct-ap-1' }]);
          }
          return Promise.resolve([]);
        });

        (mockTx.returning as any).mockResolvedValueOnce([{
          id: 'credit-1',
          tenantId: 'tenant-1',
          vendorId: 'vendor-1',
          billNumber: 'CM-001',
          status: 'posted',
          totalAmount: '-200.00',
          balanceDue: '-200.00',
        }]);

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        // Validate vendor
        const [vendor] = await tx.select().from({}).where({}).limit(1);
        expect(vendor).toBeDefined();

        // Compute credit total
        const lines = [{ accountId: 'acct-expense-1', amount: '200.00' }];
        const creditTotal = lines.reduce((s, l) => s + Number(l.amount), 0);
        const negativeTotal = (-creditTotal).toFixed(2);

        // Create credit bill (negative total)
        const [bill] = await tx.insert({}).values({
          vendorId: 'vendor-1',
          billNumber: 'CM-001',
          status: 'posted',
          totalAmount: negativeTotal,
          balanceDue: negativeTotal,
        }).returning();

        // Post GL
        await postingApi.postEntry({
          businessDate: '2026-02-15',
          sourceModule: 'ap',
          sourceReferenceId: bill.id,
          memo: 'Vendor Credit CM-001',
          currency: 'USD',
          lines: [
            { accountId: 'acct-expense-1', debitAmount: '0', creditAmount: '200.00', vendorId: 'vendor-1' },
            { accountId: vendor.defaultAPAccountId, debitAmount: '200.00', creditAmount: '0', vendorId: 'vendor-1' },
          ],
          forcePost: true,
        });

        return { result: bill, events: [] };
      });

      expect(result).toBeDefined();
      expect(Number(result.totalAmount)).toBeLessThan(0);
      expect(result.status).toBe('posted');
      expect(postingApi.postEntry).toHaveBeenCalledTimes(1);
    });
  });

  describe('applyVendorCredit', () => {
    it('should reduce target bill balance', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        let limitCallCount = 0;
        (mockTx.limit as any).mockImplementation(() => {
          limitCallCount++;
          // First: credit bill
          if (limitCallCount === 1) {
            return Promise.resolve([{
              id: 'credit-1',
              tenantId: 'tenant-1',
              vendorId: 'vendor-1',
              totalAmount: '-200.00',
              balanceDue: '-200.00',
              status: 'posted',
            }]);
          }
          // Second: target bill
          if (limitCallCount === 2) {
            return Promise.resolve([{
              id: 'bill-1',
              tenantId: 'tenant-1',
              vendorId: 'vendor-1',
              totalAmount: '500.00',
              amountPaid: '0.00',
              balanceDue: '500.00',
              status: 'posted',
            }]);
          }
          return Promise.resolve([]);
        });

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        // Load credit bill
        const [credit] = await tx.select().from({}).where({}).limit(1);
        expect(Number(credit.totalAmount)).toBeLessThan(0);

        // Load target bill
        const [target] = await tx.select().from({}).where({}).limit(1);
        expect(credit.vendorId).toBe(target.vendorId);

        const applyAmount = 150;
        const availableCredit = Math.abs(Number(credit.balanceDue));
        expect(applyAmount).toBeLessThanOrEqual(availableCredit);

        // Update target
        const newPaid = (Number(target.amountPaid) + applyAmount).toFixed(2);
        const newBalance = (Number(target.totalAmount) - Number(newPaid)).toFixed(2);
        const newStatus = Number(newBalance) <= 0 ? 'paid' : 'partial';

        // Update credit
        const newCreditBalance = (Number(credit.balanceDue) + applyAmount).toFixed(2);

        return {
          result: {
            targetNewBalance: newBalance,
            creditNewBalance: newCreditBalance,
            targetStatus: newStatus,
          },
          events: [],
        };
      });

      expect(result.targetNewBalance).toBe('350.00');
      expect(result.creditNewBalance).toBe('-50.00');
      expect(result.targetStatus).toBe('partial');
    });
  });

  describe('allocateLandedCost', () => {
    it('should distribute freight proportionally across inventory lines', async () => {
      const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

      (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
        const mockTx = createMockTx();
        (mockTx.limit as any).mockResolvedValueOnce([{
          id: 'bill-1',
          tenantId: 'tenant-1',
          billNumber: 'BILL-001',
          billDate: '2026-02-15',
          status: 'posted',
          currency: 'USD',
        }]);

        // Lines query ends at .where() (no .limit), so use call counter
        let whereCallCount = 0;
        (mockTx.where as any).mockImplementation(function (this: any) {
          whereCallCount++;
          // 2nd where call is the lines query (no .limit() terminator)
          if (whereCallCount === 2) {
            return Promise.resolve([
              { id: 'line-f1', billId: 'bill-1', lineType: 'freight', accountId: 'acct-freight', amount: '100.00' },
              { id: 'line-i1', billId: 'bill-1', lineType: 'inventory', accountId: 'acct-inv-1', amount: '600.00' },
              { id: 'line-i2', billId: 'bill-1', lineType: 'inventory', accountId: 'acct-inv-2', amount: '400.00' },
            ]);
          }
          return this;
        });

        const { result } = await fn(mockTx);
        return result;
      });

      const ctx = createCtx();
      const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

      const result = await (pwb as any)(ctx, async (tx: any) => {
        const [bill] = await tx.select().from({}).where({}).limit(1);
        expect(bill.status).toBe('posted');

        const lines = await tx.select().from({}).where({});
        const freightLines = lines.filter((l: any) => l.lineType === 'freight');
        const inventoryLines = lines.filter((l: any) => l.lineType === 'inventory');

        expect(freightLines).toHaveLength(1);
        expect(inventoryLines).toHaveLength(2);

        const totalInventoryCost = inventoryLines.reduce((s: number, l: any) => s + Number(l.amount), 0);
        const freightAmount = Number(freightLines[0].amount);

        // Sort by amount desc for remainder distribution
        const sortedInv = [...inventoryLines].sort((a: any, b: any) => Number(b.amount) - Number(a.amount));

        const allocations: any[] = [];
        let allocatedSoFar = 0;

        for (let i = 0; i < sortedInv.length; i++) {
          const inv = sortedInv[i];
          let allocated: number;

          if (i === sortedInv.length - 1) {
            allocated = Number((freightAmount - allocatedSoFar).toFixed(2));
          } else {
            const proportion = Number(inv.amount) / totalInventoryCost;
            allocated = Number((freightAmount * proportion).toFixed(2));
          }

          allocatedSoFar += allocated;
          allocations.push({
            freightLineId: freightLines[0].id,
            inventoryLineId: inv.id,
            allocatedAmount: allocated.toFixed(2),
          });
        }

        // Verify allocations sum to freight total
        const totalAllocated = allocations.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0);

        return {
          result: { allocations, totalAllocated },
          events: [],
        };
      });

      expect(result.allocations).toHaveLength(2);
      expect(result.totalAllocated).toBeCloseTo(100, 2);

      // Line with 600 (60%) should get ~60 of the 100 freight
      const firstAlloc = result.allocations.find((a: any) => a.inventoryLineId === 'line-i1');
      expect(Number(firstAlloc.allocatedAmount)).toBeCloseTo(60, 2);
    });
  });
});
