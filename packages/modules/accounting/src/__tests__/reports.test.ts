import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTrialBalance } from '../queries/get-trial-balance';
import { getGlDetailReport } from '../queries/get-gl-detail-report';
import { getGlSummary } from '../queries/get-gl-summary';
import { listGlAccounts } from '../queries/list-gl-accounts';
import { listUnmappedEvents } from '../queries/list-unmapped-events';
import { getMappingCoverage } from '../queries/get-mapping-coverage';

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(),
  sql: vi.fn((...args: any[]) => args),
}));

describe('getTrialBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return balanced report when debits = credits', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn()
          .mockResolvedValueOnce([
            {
              account_id: 'acct-1',
              account_number: '1010',
              account_name: 'Cash',
              account_type: 'asset',
              classification_name: 'Cash & Bank',
              normal_balance: 'debit',
              debit_total: '500.00',
              credit_total: '200.00',
              net_balance: '300.00',
            },
            {
              account_id: 'acct-2',
              account_number: '4000',
              account_name: 'Revenue',
              account_type: 'revenue',
              classification_name: 'Sales',
              normal_balance: 'credit',
              debit_total: '0',
              credit_total: '300.00',
              net_balance: '300.00',
            },
          ])
          .mockResolvedValueOnce([{ cnt: 0 }]),
      };
      return fn(mockTx);
    });

    const result = await getTrialBalance({ tenantId: 'tenant-1' });

    expect(result.accounts).toHaveLength(2);
    expect(result.totalDebits).toBe(500);
    expect(result.totalCredits).toBe(500);
    expect(result.isBalanced).toBe(true);
  });

  it('should flag isBalanced=false when unbalanced', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn()
          .mockResolvedValueOnce([
            {
              account_id: 'acct-1',
              account_number: '1010',
              account_name: 'Cash',
              account_type: 'asset',
              classification_name: 'Cash & Bank',
              normal_balance: 'debit',
              debit_total: '500.00',
              credit_total: '0',
              net_balance: '500.00',
            },
            {
              account_id: 'acct-2',
              account_number: '4000',
              account_name: 'Revenue',
              account_type: 'revenue',
              classification_name: 'Sales',
              normal_balance: 'credit',
              debit_total: '0',
              credit_total: '300.00',
              net_balance: '300.00',
            },
          ])
          .mockResolvedValueOnce([{ cnt: 0 }]),
      };
      return fn(mockTx);
    });

    const result = await getTrialBalance({ tenantId: 'tenant-1' });

    expect(result.totalDebits).toBe(500);
    expect(result.totalCredits).toBe(300);
    expect(result.isBalanced).toBe(false);
  });

  it('should pass through date filters', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ cnt: 0 }]),
      };
      return fn(mockTx);
    });

    const result = await getTrialBalance({
      tenantId: 'tenant-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    expect(result.startDate).toBe('2026-01-01');
    expect(result.endDate).toBe('2026-01-31');
    expect(result.isBalanced).toBe(true);
    expect(result.accounts).toHaveLength(0);
  });
});

describe('getGlDetailReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return lines with pagination', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            line_id: 'jl-1',
            journal_entry_id: 'je-1',
            journal_number: 1,
            business_date: '2026-01-15',
            source_module: 'manual',
            source_reference_id: null,
            memo: 'Cash receipt',
            entry_memo: 'Entry memo',
            debit_amount: '100.00',
            credit_amount: '0',
            running_balance: '100.00',
            location_id: null,
            department_id: null,
            customer_id: null,
            vendor_id: null,
          },
          {
            line_id: 'jl-2',
            journal_entry_id: 'je-2',
            journal_number: 2,
            business_date: '2026-01-16',
            source_module: 'pos',
            source_reference_id: 'order-1',
            memo: null,
            entry_memo: 'POS sale',
            debit_amount: '50.00',
            credit_amount: '0',
            running_balance: '150.00',
            location_id: 'loc-1',
            department_id: null,
            customer_id: null,
            vendor_id: null,
          },
          // Third row triggers hasMore (limit=2)
          {
            line_id: 'jl-3',
            journal_entry_id: 'je-3',
            journal_number: 3,
            business_date: '2026-01-17',
            source_module: 'manual',
            source_reference_id: null,
            memo: null,
            entry_memo: null,
            debit_amount: '25.00',
            credit_amount: '0',
            running_balance: '175.00',
            location_id: null,
            department_id: null,
            customer_id: null,
            vendor_id: null,
          },
        ]),
      };
      return fn(mockTx);
    });

    const result = await getGlDetailReport({
      tenantId: 'tenant-1',
      accountId: 'acct-1',
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe('jl-2');
    expect(result.items[0]!.lineId).toBe('jl-1');
    expect(result.items[0]!.debitAmount).toBe(100);
    expect(result.items[1]!.sourceModule).toBe('pos');
  });

  it('should return hasMore=false when no more results', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            line_id: 'jl-1',
            journal_entry_id: 'je-1',
            journal_number: 1,
            business_date: '2026-01-15',
            source_module: 'manual',
            source_reference_id: null,
            memo: null,
            entry_memo: null,
            debit_amount: '100.00',
            credit_amount: '0',
            running_balance: '100.00',
            location_id: null,
            department_id: null,
            customer_id: null,
            vendor_id: null,
          },
        ]),
      };
      return fn(mockTx);
    });

    const result = await getGlDetailReport({
      tenantId: 'tenant-1',
      accountId: 'acct-1',
    });

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });
});

describe('getGlSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should group by classification and compute P&L totals', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            classification_id: 'cls-1',
            classification_name: 'Sales Revenue',
            account_type: 'revenue',
            debit_total: '0',
            credit_total: '10000.00',
            net_balance: '10000.00',
          },
          {
            classification_id: 'cls-2',
            classification_name: 'Operating Expenses',
            account_type: 'expense',
            debit_total: '7000.00',
            credit_total: '0',
            net_balance: '7000.00',
          },
          {
            classification_id: 'cls-3',
            classification_name: 'Cash & Bank',
            account_type: 'asset',
            debit_total: '15000.00',
            credit_total: '5000.00',
            net_balance: '10000.00',
          },
        ]),
      };
      return fn(mockTx);
    });

    const result = await getGlSummary({ tenantId: 'tenant-1' });

    expect(result.classifications).toHaveLength(3);
    expect(result.totalRevenue).toBe(10000);
    expect(result.totalExpenses).toBe(7000);
    expect(result.netIncome).toBe(3000);
    expect(result.totalAssets).toBe(10000);
  });
});

describe('listGlAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return accounts without balance when includeBalance is false', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            id: 'acct-1',
            account_number: '1010',
            name: 'Cash',
            account_type: 'asset',
            normal_balance: 'debit',
            classification_id: 'cls-1',
            classification_name: 'Cash & Bank',
            parent_account_id: null,
            is_active: true,
            is_control_account: false,
            control_account_type: null,
            allow_manual_posting: true,
            description: 'Main cash account',
          },
        ]),
      };
      return fn(mockTx);
    });

    const result = await listGlAccounts({ tenantId: 'tenant-1' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('acct-1');
    expect(result.items[0]!.debitTotal).toBeNull();
    expect(result.items[0]!.creditTotal).toBeNull();
    expect(result.items[0]!.balance).toBeNull();
  });
});

describe('listUnmappedEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return unmapped events with filters', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            id: 'ue-1',
            event_type: 'order.placed.v1',
            source_module: 'orders',
            source_reference_id: 'order-123',
            entity_type: 'sub_department',
            entity_id: 'subdept-1',
            reason: 'No GL mapping found',
            resolved_at: null,
            resolved_by: null,
            created_at: '2026-01-15T10:00:00Z',
          },
          {
            id: 'ue-2',
            event_type: 'tender.recorded.v1',
            source_module: 'payments',
            source_reference_id: 'tender-456',
            entity_type: 'payment_type',
            entity_id: 'credit_card',
            reason: 'No payment type mapping',
            resolved_at: null,
            resolved_by: null,
            created_at: '2026-01-15T11:00:00Z',
          },
        ]),
      };
      return fn(mockTx);
    });

    const result = await listUnmappedEvents({
      tenantId: 'tenant-1',
      resolved: false,
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.items[0]!.eventType).toBe('order.placed.v1');
    expect(result.items[0]!.resolvedAt).toBeNull();
    expect(result.items[1]!.entityType).toBe('payment_type');
  });
});

describe('getMappingCoverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return correct mapped/unmapped counts', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn()
          .mockResolvedValueOnce([{ cnt: 5 }])   // sub-department mapped
          .mockResolvedValueOnce([{ cnt: 8 }])   // sub-department total
          .mockResolvedValueOnce([{ cnt: 3 }])   // payment type mapped
          .mockResolvedValueOnce([{ cnt: 25 }])  // payment type total
          .mockResolvedValueOnce([{ cnt: 2 }])   // tax group mapped
          .mockResolvedValueOnce([{ cnt: 4 }])   // tax group total
          .mockResolvedValueOnce([{ cnt: 4 }])   // unresolved unmapped events count
          .mockResolvedValueOnce([               // detail rows
            { entity_type: 'sub_department', entity_id: 'subdept-x', reason: 'Missing mapping' },
            { entity_type: 'payment_type', entity_id: 'wire', reason: 'No wire transfer mapping' },
          ]),
      };
      return fn(mockTx);
    });

    const result = await getMappingCoverage({ tenantId: 'tenant-1' });

    expect(result.departments.mapped).toBe(5);
    expect(result.departments.total).toBe(8);
    expect(result.paymentTypes.mapped).toBe(3);
    expect(result.paymentTypes.total).toBe(25);
    expect(result.taxGroups.mapped).toBe(2);
    expect(result.taxGroups.total).toBe(4);
    expect(result.overallPercentage).toBe(27); // (5+3+2)/(8+25+4) = 10/37 = 27%
    expect(result.unmappedEventCount).toBe(4);
    expect(result.details).toHaveLength(2);
    expect(result.details[0]!.entityType).toBe('sub_department');
    expect(result.details[0]!.isMapped).toBe(false);
  });
});
