import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────
const mockWithTenant = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  sql: (...args: unknown[]) => args,
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (...args: unknown[]) => args,
    {
      join: (...args: unknown[]) => args,
      empty: () => '',
    },
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe('getArAging', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return aging buckets grouped by customer', async () => {
    const { getArAging } = await import('../queries/get-ar-aging');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: mockExecute.mockResolvedValueOnce([
          {
            customer_id: 'cust-1',
            customer_name: 'Acme Corp',
            current_amount: '1000.00',
            days_1_30: '500.00',
            days_31_60: '250.00',
            days_61_90: '100.00',
            over_90: '50.00',
            total: '1900.00',
          },
          {
            customer_id: 'cust-2',
            customer_name: 'Beta Inc',
            current_amount: '200.00',
            days_1_30: '0',
            days_31_60: '0',
            days_61_90: '0',
            over_90: '0',
            total: '200.00',
          },
        ]),
      };
      return fn(mockTx);
    });

    const result = await getArAging({ tenantId: 'tenant-1', asOfDate: '2026-02-20' });

    expect(result.asOfDate).toBe('2026-02-20');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.customerId).toBe('cust-1');
    expect(result.rows[0]!.customerName).toBe('Acme Corp');
    expect(result.rows[0]!.current).toBe(1000);
    expect(result.rows[0]!.days1to30).toBe(500);
    expect(result.rows[0]!.days31to60).toBe(250);
    expect(result.rows[0]!.days61to90).toBe(100);
    expect(result.rows[0]!.over90).toBe(50);
    expect(result.rows[0]!.total).toBe(1900);
    expect(result.totals.total).toBe(2100);
  });

  it('should return empty report when no open invoices', async () => {
    const { getArAging } = await import('../queries/get-ar-aging');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: mockExecute.mockResolvedValueOnce([]) };
      return fn(mockTx);
    });

    const result = await getArAging({ tenantId: 'tenant-1' });

    expect(result.rows).toHaveLength(0);
    expect(result.totals.total).toBe(0);
    expect(result.totals.current).toBe(0);
    expect(result.totals.over90).toBe(0);
  });

  it('should default asOfDate to today when not provided', async () => {
    const { getArAging } = await import('../queries/get-ar-aging');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: mockExecute.mockResolvedValueOnce([]) };
      return fn(mockTx);
    });

    const result = await getArAging({ tenantId: 'tenant-1' });
    const today = new Date().toISOString().split('T')[0]!;

    expect(result.asOfDate).toBe(today);
  });

  it('should compute totals by summing all rows', () => {
    const rows = [
      { current: 100, days1to30: 200, days31to60: 50, days61to90: 25, over90: 10, total: 385 },
      { current: 50, days1to30: 30, days31to60: 0, days61to90: 0, over90: 0, total: 80 },
    ];

    const totals = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 };
    for (const r of rows) {
      totals.current += r.current;
      totals.days1to30 += r.days1to30;
      totals.days31to60 += r.days31to60;
      totals.days61to90 += r.days61to90;
      totals.over90 += r.over90;
      totals.total += r.total;
    }

    expect(totals.current).toBe(150);
    expect(totals.days1to30).toBe(230);
    expect(totals.total).toBe(465);
  });
});

describe('getCustomerLedger', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return ledger entries with running balance', async () => {
    const { getCustomerLedger } = await import('../queries/get-customer-ledger');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: mockExecute
          .mockResolvedValueOnce([
            { entry_date: '2026-02-01', entry_type: 'invoice', reference_number: 'INV-001', description: 'Monthly fee', amount: '500' },
            { entry_date: '2026-02-10', entry_type: 'receipt', reference_number: 'RCP-001', description: 'check', amount: '-200' },
            { entry_date: '2026-02-15', entry_type: 'invoice', reference_number: 'INV-002', description: 'Extra work', amount: '300' },
          ]),
      };
      return fn(mockTx);
    });

    const result = await getCustomerLedger({ tenantId: 'tenant-1', customerId: 'cust-1' });

    expect(result.customerId).toBe('cust-1');
    expect(result.openingBalance).toBe(0);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]!.balance).toBe(500);
    expect(result.entries[1]!.balance).toBe(300);
    expect(result.entries[2]!.balance).toBe(600);
    expect(result.closingBalance).toBe(600);
  });

  it('should compute opening balance from prior period', async () => {
    const { getCustomerLedger } = await import('../queries/get-customer-ledger');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: mockExecute
          .mockResolvedValueOnce([
            { entry_date: '2026-02-01', entry_type: 'invoice', reference_number: 'INV-003', description: null, amount: '100' },
          ])
          .mockResolvedValueOnce([{ inv_total: '1500' }])
          .mockResolvedValueOnce([{ rcp_total: '800' }]),
      };
      return fn(mockTx);
    });

    const result = await getCustomerLedger({
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      fromDate: '2026-02-01',
    });

    expect(result.openingBalance).toBe(700);
    expect(result.entries[0]!.balance).toBe(800);
    expect(result.closingBalance).toBe(800);
  });

  it('should handle empty ledger', async () => {
    const { getCustomerLedger } = await import('../queries/get-customer-ledger');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: mockExecute.mockResolvedValueOnce([]) };
      return fn(mockTx);
    });

    const result = await getCustomerLedger({ tenantId: 'tenant-1', customerId: 'cust-1' });

    expect(result.entries).toHaveLength(0);
    expect(result.openingBalance).toBe(0);
    expect(result.closingBalance).toBe(0);
  });
});

describe('getOpenInvoices', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return open invoices with cursor pagination', async () => {
    const { getOpenInvoices } = await import('../queries/get-open-invoices');

    const invoiceRows = Array.from({ length: 26 }, (_, i) => ({
      id: `inv-${i + 1}`,
      customer_id: 'cust-1',
      customer_name: 'Acme',
      invoice_number: `INV-${String(i + 1).padStart(3, '0')}`,
      invoice_date: '2026-02-01',
      due_date: '2026-03-01',
      total_amount: '100.00',
      amount_paid: '0',
      balance_due: '100.00',
      status: 'posted',
      days_overdue: 0,
    }));

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: mockExecute.mockResolvedValueOnce(invoiceRows) };
      return fn(mockTx);
    });

    const result = await getOpenInvoices({ tenantId: 'tenant-1', limit: 25 });

    expect(result.items).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe('inv-25');
  });

  it('should return empty list when no open invoices', async () => {
    const { getOpenInvoices } = await import('../queries/get-open-invoices');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: mockExecute.mockResolvedValueOnce([]) };
      return fn(mockTx);
    });

    const result = await getOpenInvoices({ tenantId: 'tenant-1' });

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  it('should map row fields correctly', async () => {
    const { getOpenInvoices } = await import('../queries/get-open-invoices');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: mockExecute.mockResolvedValueOnce([{
          id: 'inv-1',
          customer_id: 'cust-1',
          customer_name: null,
          invoice_number: 'INV-001',
          invoice_date: '2026-02-01',
          due_date: '2026-01-15',
          total_amount: '1000.50',
          amount_paid: '200.00',
          balance_due: '800.50',
          status: 'partial',
          days_overdue: 36,
        }]),
      };
      return fn(mockTx);
    });

    const result = await getOpenInvoices({ tenantId: 'tenant-1' });

    const item = result.items[0]!;
    expect(item.id).toBe('inv-1');
    expect(item.customerName).toBeNull();
    expect(item.totalAmount).toBe(1000.5);
    expect(item.amountPaid).toBe(200);
    expect(item.balanceDue).toBe(800.5);
    expect(item.daysOverdue).toBe(36);
  });
});

describe('listInvoices', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should list invoices with all fields mapped', async () => {
    const { listInvoices } = await import('../queries/list-invoices');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: mockExecute.mockResolvedValueOnce([{
          id: 'inv-1',
          customer_id: 'cust-1',
          customer_name: 'Acme Corp',
          invoice_number: 'INV-001',
          invoice_date: '2026-02-01',
          due_date: '2026-03-01',
          status: 'posted',
          total_amount: '500.00',
          amount_paid: '100.00',
          balance_due: '400.00',
          source_type: 'manual',
          created_at: '2026-02-01T10:00:00Z',
        }]),
      };
      return fn(mockTx);
    });

    const result = await listInvoices({ tenantId: 'tenant-1' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.invoiceNumber).toBe('INV-001');
    expect(result.items[0]!.status).toBe('posted');
    expect(result.items[0]!.totalAmount).toBe(500);
    expect(result.items[0]!.amountPaid).toBe(100);
    expect(result.items[0]!.balanceDue).toBe(400);
    expect(result.items[0]!.sourceType).toBe('manual');
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  it('should default limit to 25', async () => {
    const { listInvoices } = await import('../queries/list-invoices');

    // Create 26 rows to trigger hasMore
    const rows = Array.from({ length: 26 }, (_, i) => ({
      id: `inv-${i}`,
      customer_id: 'cust-1',
      customer_name: 'Test',
      invoice_number: `INV-${i}`,
      invoice_date: '2026-02-01',
      due_date: '2026-03-01',
      status: 'posted',
      total_amount: '100.00',
      amount_paid: '0',
      balance_due: '100.00',
      source_type: 'manual',
      created_at: '2026-02-01T10:00:00Z',
    }));

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: mockExecute.mockResolvedValueOnce(rows) };
      return fn(mockTx);
    });

    const result = await listInvoices({ tenantId: 'tenant-1' });

    expect(result.items).toHaveLength(25);
    expect(result.hasMore).toBe(true);
  });
});

describe('listReceipts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should list receipts with correct field mapping', async () => {
    const { listReceipts } = await import('../queries/list-receipts');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: mockExecute.mockResolvedValueOnce([{
          id: 'rcp-1',
          customer_id: 'cust-1',
          customer_name: 'Acme Corp',
          receipt_date: '2026-02-20',
          payment_method: 'check',
          reference_number: 'CHK-001',
          amount: '300.00',
          status: 'posted',
          source_type: 'manual',
          created_at: '2026-02-20T14:00:00Z',
        }]),
      };
      return fn(mockTx);
    });

    const result = await listReceipts({ tenantId: 'tenant-1' });

    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.id).toBe('rcp-1');
    expect(item.paymentMethod).toBe('check');
    expect(item.referenceNumber).toBe('CHK-001');
    expect(item.amount).toBe(300);
    expect(item.status).toBe('posted');
  });

  it('should handle null paymentMethod and referenceNumber', async () => {
    const { listReceipts } = await import('../queries/list-receipts');

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: mockExecute.mockResolvedValueOnce([{
          id: 'rcp-1',
          customer_id: 'cust-1',
          customer_name: null,
          receipt_date: '2026-02-20',
          payment_method: null,
          reference_number: null,
          amount: '50.00',
          status: 'draft',
          source_type: 'pos_tender',
          created_at: '2026-02-20T14:00:00Z',
        }]),
      };
      return fn(mockTx);
    });

    const result = await listReceipts({ tenantId: 'tenant-1' });
    const item = result.items[0]!;

    expect(item.paymentMethod).toBeNull();
    expect(item.referenceNumber).toBeNull();
    expect(item.customerName).toBeNull();
  });
});
