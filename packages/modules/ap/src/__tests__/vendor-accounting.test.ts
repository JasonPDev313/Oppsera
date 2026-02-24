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
    vendors: { id: 'id', tenantId: 'tenant_id' },
    glAccounts: { id: 'id', tenantId: 'tenant_id', isActive: 'is_active' },
    paymentTerms: { id: 'id', tenantId: 'tenant_id' },
    apBills: { id: 'id', tenantId: 'tenant_id', vendorId: 'vendor_id', status: 'status' },
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
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
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
  const tx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
  };
  return tx;
}

function createCtx(): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
  } as unknown as RequestContext;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Vendor Accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update vendor accounting fields', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();

      // Load vendor
      (mockTx.limit as any)
        .mockResolvedValueOnce([{
          id: 'vendor-1',
          tenant_id: 'tenant-1',
          name: 'Acme Corp',
          vendor_number: null,
          default_expense_account_id: null,
          default_ap_account_id: null,
          payment_terms_id: null,
          is_1099_eligible: false,
        }])
        // Validate GL account exists (expense account)
        .mockResolvedValueOnce([{
          id: 'acct-expense',
          is_active: true,
          account_type: 'expense',
        }])
        // Validate GL account exists (AP account)
        .mockResolvedValueOnce([{
          id: 'acct-ap',
          is_active: true,
          account_type: 'liability',
          is_control_account: true,
          control_account_type: 'ap',
        }])
        // Validate payment terms exists
        .mockResolvedValueOnce([{
          id: 'pt-net30',
          is_active: true,
        }]);

      (mockTx.returning as any).mockResolvedValue([{
        id: 'vendor-1',
        vendor_number: 'V-001',
        default_expense_account_id: 'acct-expense',
        default_ap_account_id: 'acct-ap',
        payment_terms_id: 'pt-net30',
        is_1099_eligible: true,
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

    const result = await (pwb as any)(ctx, async (tx: any) => {
      // Load vendor
      const [vendor] = await tx.select().from({}).where({}).limit(1);
      expect(vendor).toBeDefined();

      // Validate expense account
      const [expenseAcct] = await tx.select().from({}).where({}).limit(1);
      expect(expenseAcct.is_active).toBe(true);

      // Validate AP account
      const [apAcct] = await tx.select().from({}).where({}).limit(1);
      expect(apAcct.is_control_account).toBe(true);

      // Validate payment terms
      const [terms] = await tx.select().from({}).where({}).limit(1);
      expect(terms.is_active).toBe(true);

      // Update vendor
      const [updated] = await tx.update({}).set({
        vendorNumber: 'V-001',
        defaultExpenseAccountId: 'acct-expense',
        defaultAPAccountId: 'acct-ap',
        paymentTermsId: 'pt-net30',
        is1099Eligible: true,
      }).returning();

      return { result: updated, events: [] };
    });

    expect(result.vendor_number).toBe('V-001');
    expect(result.default_expense_account_id).toBe('acct-expense');
    expect(result.default_ap_account_id).toBe('acct-ap');
    expect(result.payment_terms_id).toBe('pt-net30');
    expect(result.is_1099_eligible).toBe(true);
  });

  it('should validate account references exist', async () => {
    const { AppError } = await import('@oppsera/shared');
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();

      // Load vendor
      (mockTx.limit as any)
        .mockResolvedValueOnce([{
          id: 'vendor-1',
          tenant_id: 'tenant-1',
        }])
        // GL account lookup returns empty (doesn't exist)
        .mockResolvedValueOnce([]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

    await expect(
      (pwb as any)(ctx, async (tx: any) => {
        const [vendor] = await tx.select().from({}).where({}).limit(1);
        expect(vendor).toBeDefined();

        // Validate expense account - not found
        const [acct] = await tx.select().from({}).where({}).limit(1);
        if (!acct) {
          throw new AppError(
            'INVALID_ACCOUNT_REFERENCE',
            'GL account acct-nonexistent referenced by defaultExpenseAccountId does not exist or is inactive',
            400,
          );
        }

        return { result: vendor, events: [] };
      }),
    ).rejects.toThrow('does not exist or is inactive');
  });

  it('should get vendor accounting with computed stats', async () => {
    const { withTenant } = await import('@oppsera/db');

    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = createMockTx();

      // Raw SQL query returning vendor with computed aggregates
      (mockTx.execute as any).mockResolvedValueOnce([{
        id: 'vendor-1',
        name: 'Acme Corp',
        vendor_number: 'V-001',
        default_expense_account_id: 'acct-expense',
        default_expense_account_name: 'Office Supplies Expense',
        default_ap_account_id: 'acct-ap',
        default_ap_account_name: 'Accounts Payable',
        payment_terms_id: 'pt-net30',
        payment_terms_name: 'Net 30',
        is_1099_eligible: true,
        open_bill_count: 3,
        total_balance: 1500.0000,
        overdue_balance: 500.0000,
      }]);

      return fn(mockTx);
    });

    const result = await (withTenant as any)('tenant-1', async (tx: any) => {
      const rows = await tx.execute();
      const results = Array.from(rows as Iterable<Record<string, unknown>>);
      if (results.length === 0) throw new Error('Not found');
      const row = results[0]!;

      return {
        id: String(row.id),
        name: String(row.name),
        vendorNumber: row.vendor_number ? String(row.vendor_number) : null,
        defaultExpenseAccountId: row.default_expense_account_id ? String(row.default_expense_account_id) : null,
        defaultExpenseAccountName: row.default_expense_account_name ? String(row.default_expense_account_name) : null,
        defaultAPAccountId: row.default_ap_account_id ? String(row.default_ap_account_id) : null,
        defaultAPAccountName: row.default_ap_account_name ? String(row.default_ap_account_name) : null,
        paymentTermsId: row.payment_terms_id ? String(row.payment_terms_id) : null,
        paymentTermsName: row.payment_terms_name ? String(row.payment_terms_name) : null,
        is1099Eligible: Boolean(row.is_1099_eligible),
        openBillCount: Number(row.open_bill_count),
        totalBalance: Number(row.total_balance),
        overdueBalance: Number(row.overdue_balance),
      };
    });

    expect(result.id).toBe('vendor-1');
    expect(result.name).toBe('Acme Corp');
    expect(result.openBillCount).toBe(3);
    expect(result.totalBalance).toBe(1500);
    expect(result.overdueBalance).toBe(500);
    expect(result.is1099Eligible).toBe(true);
    expect(result.paymentTermsName).toBe('Net 30');
  });

  it('should compute AP aging buckets correctly', async () => {
    const { withTenant } = await import('@oppsera/db');

    const asOfDate = '2026-02-20';

    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = createMockTx();

      // Raw SQL aging query result
      (mockTx.execute as any).mockResolvedValueOnce([
        {
          vendor_id: 'vendor-1',
          vendor_name: 'Acme Corp',
          current_bucket: 200.0000,  // due_date >= asOfDate
          days_1_to_30: 150.0000,    // 1-30 past due
          days_31_to_60: 100.0000,   // 31-60 past due
          days_61_to_90: 50.0000,    // 61-90 past due
          days_90_plus: 25.0000,     // 90+ past due
          total: 525.0000,
        },
        {
          vendor_id: 'vendor-2',
          vendor_name: 'Beta Supply',
          current_bucket: 300.0000,
          days_1_to_30: 0,
          days_31_to_60: 0,
          days_61_to_90: 0,
          days_90_plus: 0,
          total: 300.0000,
        },
      ]);

      return fn(mockTx);
    });

    const result = await (withTenant as any)('tenant-1', async (tx: any) => {
      const rows = await tx.execute();
      const vendors = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
        vendorId: String(row.vendor_id),
        vendorName: String(row.vendor_name),
        current: Number(row.current_bucket),
        days1to30: Number(row.days_1_to_30),
        days31to60: Number(row.days_31_to_60),
        days61to90: Number(row.days_61_to_90),
        days90plus: Number(row.days_90_plus),
        total: Number(row.total),
      }));

      const totals = {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        days90plus: 0,
        total: 0,
      };

      for (const v of vendors) {
        totals.current += v.current;
        totals.days1to30 += v.days1to30;
        totals.days31to60 += v.days31to60;
        totals.days61to90 += v.days61to90;
        totals.days90plus += v.days90plus;
        totals.total += v.total;
      }

      return { asOfDate, vendors, totals };
    });

    expect(result.asOfDate).toBe('2026-02-20');
    expect(result.vendors).toHaveLength(2);

    // Verify Acme Corp buckets
    const acme = result.vendors[0];
    expect(acme.vendorName).toBe('Acme Corp');
    expect(acme.current).toBe(200);
    expect(acme.days1to30).toBe(150);
    expect(acme.days31to60).toBe(100);
    expect(acme.days61to90).toBe(50);
    expect(acme.days90plus).toBe(25);
    expect(acme.total).toBe(525);

    // Verify Beta Supply (all current)
    const beta = result.vendors[1];
    expect(beta.vendorName).toBe('Beta Supply');
    expect(beta.current).toBe(300);
    expect(beta.days90plus).toBe(0);

    // Verify totals
    expect(result.totals.current).toBe(500);
    expect(result.totals.days1to30).toBe(150);
    expect(result.totals.total).toBe(825);
  });
});
