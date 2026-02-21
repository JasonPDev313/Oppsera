import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────

const mockTx = {
  execute: vi.fn(),
};

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: any) => fn(mockTx)),
}));

// ── Tests ──────────────────────────────────────────────────────────

describe('AP Report Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOpenBills', () => {
    it('should return open bills with aging buckets', async () => {
      mockTx.execute.mockResolvedValueOnce([
        {
          id: 'bill-1',
          vendor_id: 'vendor-1',
          vendor_name: 'Acme Corp',
          bill_number: 'BILL-001',
          bill_date: '2026-01-15',
          due_date: '2026-02-15',
          total_amount: '1000.00',
          balance_due: '500.00',
          days_overdue: 5,
          aging_bucket: '1-30',
        },
        {
          id: 'bill-2',
          vendor_id: 'vendor-2',
          vendor_name: 'Beta Inc',
          bill_number: 'BILL-002',
          bill_date: '2025-12-01',
          due_date: '2025-12-31',
          total_amount: '2000.00',
          balance_due: '2000.00',
          days_overdue: 51,
          aging_bucket: '31-60',
        },
      ]);

      const { getOpenBills } = await import('../queries/get-open-bills');
      const result = await getOpenBills({ tenantId: 'tenant-1' });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.billNumber).toBe('BILL-001');
      expect(result.items[0]!.agingBucket).toBe('1-30');
      expect(result.items[1]!.agingBucket).toBe('31-60');
      expect(result.totalBalance).toBe(2500);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by vendor when vendorId provided', async () => {
      mockTx.execute.mockResolvedValueOnce([
        {
          id: 'bill-1',
          vendor_id: 'vendor-1',
          vendor_name: 'Acme Corp',
          bill_number: 'BILL-001',
          bill_date: '2026-01-15',
          due_date: '2026-02-15',
          total_amount: '1000.00',
          balance_due: '1000.00',
          days_overdue: 0,
          aging_bucket: 'Current',
        },
      ]);

      const { getOpenBills } = await import('../queries/get-open-bills');
      const result = await getOpenBills({ tenantId: 'tenant-1', vendorId: 'vendor-1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.vendorId).toBe('vendor-1');
    });
  });

  describe('getPaymentHistory', () => {
    it('should return payments with allocations', async () => {
      // First execute: payment rows
      mockTx.execute
        .mockResolvedValueOnce([
          {
            id: 'pay-1',
            vendor_id: 'vendor-1',
            vendor_name: 'Acme Corp',
            payment_date: '2026-02-10',
            payment_method: 'check',
            reference_number: 'CHK-001',
            amount: '500.00',
            status: 'posted',
            created_at: '2026-02-10T12:00:00Z',
          },
        ])
        // Second execute: allocations for pay-1
        .mockResolvedValueOnce([
          {
            bill_id: 'bill-1',
            bill_number: 'BILL-001',
            amount_applied: '500.00',
          },
        ]);

      const { getPaymentHistory } = await import('../queries/get-payment-history');
      const result = await getPaymentHistory({ tenantId: 'tenant-1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.paymentMethod).toBe('check');
      expect(result.items[0]!.allocations).toHaveLength(1);
      expect(result.items[0]!.allocations[0]!.billNumber).toBe('BILL-001');
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getExpenseByVendor', () => {
    it('should group expenses by vendor and account', async () => {
      mockTx.execute.mockResolvedValueOnce([
        {
          vendor_id: 'vendor-1',
          vendor_name: 'Acme Corp',
          account_id: 'acct-1',
          account_number: '5000',
          account_name: 'Office Supplies',
          total_amount: '300.00',
        },
        {
          vendor_id: 'vendor-1',
          vendor_name: 'Acme Corp',
          account_id: 'acct-2',
          account_number: '5100',
          account_name: 'Utilities',
          total_amount: '200.00',
        },
        {
          vendor_id: 'vendor-2',
          vendor_name: 'Beta Inc',
          account_id: 'acct-1',
          account_number: '5000',
          account_name: 'Office Supplies',
          total_amount: '150.00',
        },
      ]);

      const { getExpenseByVendor } = await import('../queries/get-expense-by-vendor');
      const result = await getExpenseByVendor({
        tenantId: 'tenant-1',
        startDate: '2026-01-01',
        endDate: '2026-02-28',
      });

      expect(result).toHaveLength(2);

      const acme = result.find((v) => v.vendorId === 'vendor-1');
      expect(acme).toBeDefined();
      expect(acme!.totalExpense).toBe(500);
      expect(acme!.accounts).toHaveLength(2);

      const beta = result.find((v) => v.vendorId === 'vendor-2');
      expect(beta).toBeDefined();
      expect(beta!.totalExpense).toBe(150);
      expect(beta!.accounts).toHaveLength(1);
    });
  });

  describe('getCashRequirements', () => {
    it('should group by week with cumulative totals', async () => {
      // First execute: overdue amount
      mockTx.execute
        .mockResolvedValueOnce([{ overdue: '500.00' }])
        // Second execute: weekly buckets
        .mockResolvedValueOnce([
          {
            week_start: '2026-02-24',
            week_end: '2026-03-01',
            bill_count: 3,
            amount_due: '1500.00',
          },
          {
            week_start: '2026-03-02',
            week_end: '2026-03-08',
            bill_count: 2,
            amount_due: '800.00',
          },
        ]);

      const { getCashRequirements } = await import('../queries/get-cash-requirements');
      const result = await getCashRequirements({
        tenantId: 'tenant-1',
        asOfDate: '2026-02-20',
      });

      expect(result.overdueAmount).toBe(500);
      expect(result.periods).toHaveLength(2);

      // First week: cumulative = overdue + week1
      expect(result.periods[0]!.label).toBe('Week 1');
      expect(result.periods[0]!.amountDue).toBe(1500);
      expect(result.periods[0]!.cumulativeTotal).toBe(2000); // 500 + 1500

      // Second week: cumulative = overdue + week1 + week2
      expect(result.periods[1]!.label).toBe('Week 2');
      expect(result.periods[1]!.cumulativeTotal).toBe(2800); // 500 + 1500 + 800

      expect(result.totalOutstanding).toBe(2800);
    });
  });

  describe('get1099Report', () => {
    it('should return only 1099-eligible vendors', async () => {
      mockTx.execute.mockResolvedValueOnce([
        {
          vendor_id: 'vendor-1',
          vendor_name: 'Freelancer Joe',
          vendor_number: 'V-001',
          tax_id: '12-3456789',
          total_paid: '15000.00',
          payment_count: 5,
        },
        {
          vendor_id: 'vendor-3',
          vendor_name: 'Consultant Jane',
          vendor_number: null,
          tax_id: '98-7654321',
          total_paid: '8000.00',
          payment_count: 3,
        },
      ]);

      const { get1099Report } = await import('../queries/get-1099-report');
      const result = await get1099Report({ tenantId: 'tenant-1', year: 2025 });

      expect(result.year).toBe(2025);
      expect(result.vendors).toHaveLength(2);
      expect(result.vendorCount).toBe(2);
      expect(result.totalPaid).toBe(23000);

      expect(result.vendors[0]!.vendorName).toBe('Freelancer Joe');
      expect(result.vendors[0]!.taxId).toBe('12-3456789');
      expect(result.vendors[0]!.totalPaid).toBe(15000);
      expect(result.vendors[0]!.paymentCount).toBe(5);

      expect(result.vendors[1]!.vendorNumber).toBeNull();
    });
  });

  describe('getAssetPurchases', () => {
    it('should group asset purchases by GL account', async () => {
      mockTx.execute.mockResolvedValueOnce([
        {
          account_id: 'acct-asset-1',
          account_number: '1500',
          account_name: 'Equipment',
          bill_id: 'bill-1',
          bill_number: 'BILL-001',
          vendor_name: 'Acme Corp',
          description: 'Kitchen mixer',
          amount: '2000.00',
          bill_date: '2026-01-15',
        },
        {
          account_id: 'acct-asset-1',
          account_number: '1500',
          account_name: 'Equipment',
          bill_id: 'bill-2',
          bill_number: 'BILL-002',
          vendor_name: 'Beta Inc',
          description: 'Oven',
          amount: '5000.00',
          bill_date: '2026-01-20',
        },
        {
          account_id: 'acct-asset-2',
          account_number: '1600',
          account_name: 'Vehicles',
          bill_id: 'bill-3',
          bill_number: 'BILL-003',
          vendor_name: 'Cars Ltd',
          description: null,
          amount: '25000.00',
          bill_date: '2026-02-01',
        },
      ]);

      const { getAssetPurchases } = await import('../queries/get-asset-purchases');
      const result = await getAssetPurchases({
        tenantId: 'tenant-1',
        startDate: '2026-01-01',
        endDate: '2026-02-28',
      });

      expect(result).toHaveLength(2);

      const equipment = result.find((a) => a.accountId === 'acct-asset-1');
      expect(equipment).toBeDefined();
      expect(equipment!.accountNumber).toBe('1500');
      expect(equipment!.totalAmount).toBe(7000);
      expect(equipment!.lineCount).toBe(2);
      expect(equipment!.items).toHaveLength(2);

      const vehicles = result.find((a) => a.accountId === 'acct-asset-2');
      expect(vehicles).toBeDefined();
      expect(vehicles!.totalAmount).toBe(25000);
      expect(vehicles!.lineCount).toBe(1);
      expect(vehicles!.items[0]!.description).toBeNull();
    });
  });

  describe('getVendorLedger', () => {
    it('should return a unified timeline of bills and payments', async () => {
      // First execute: opening balance
      mockTx.execute
        .mockResolvedValueOnce([{ balance: '1000.00' }])
        // Second execute: combined ledger entries
        .mockResolvedValueOnce([
          {
            id: 'bill-1',
            entry_date: '2026-02-01',
            type: 'bill',
            reference: 'BILL-001',
            description: 'Office supplies',
            debit: 500,
            credit: 0,
            status: 'posted',
          },
          {
            id: 'pay-1',
            entry_date: '2026-02-10',
            type: 'payment',
            reference: 'CHK-001',
            description: 'Payment',
            debit: 0,
            credit: 300,
            status: 'posted',
          },
        ]);

      const { getVendorLedger } = await import('../queries/get-vendor-ledger');
      const result = await getVendorLedger({
        tenantId: 'tenant-1',
        vendorId: 'vendor-1',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      expect(result.entries).toHaveLength(2);
      expect(result.openingBalance).toBe(1000);

      // closing = opening + debits - credits = 1000 + 500 - 300 = 1200
      expect(result.closingBalance).toBe(1200);
      expect(result.hasMore).toBe(false);

      expect(result.entries[0]!.type).toBe('bill');
      expect(result.entries[0]!.debit).toBe(500);
      expect(result.entries[1]!.type).toBe('payment');
      expect(result.entries[1]!.credit).toBe(300);
    });
  });

  describe('getVendorLedger pagination', () => {
    it('should detect hasMore correctly', async () => {
      // Opening balance
      mockTx.execute.mockResolvedValueOnce([{ balance: '0' }]);

      // 3 entries (limit=2 means the 3rd signals hasMore)
      const entries = [];
      for (let i = 0; i < 3; i++) {
        entries.push({
          id: `entry-${i}`,
          entry_date: '2026-02-01',
          type: 'bill',
          reference: `BILL-00${i}`,
          description: null,
          debit: 100,
          credit: 0,
          status: 'posted',
        });
      }
      mockTx.execute.mockResolvedValueOnce(entries);

      const { getVendorLedger } = await import('../queries/get-vendor-ledger');
      const result = await getVendorLedger({
        tenantId: 'tenant-1',
        vendorId: 'vendor-1',
        startDate: '2026-02-01',
        limit: 2,
      });

      expect(result.entries).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('entry-1');
    });
  });
});
