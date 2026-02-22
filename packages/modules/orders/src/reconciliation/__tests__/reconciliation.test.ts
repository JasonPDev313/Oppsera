import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: any) => any) => {
    const mockTx = { execute: mockExecute };
    return fn(mockTx);
  }),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (...args: unknown[]) => args,
    { raw: (str: string) => str },
  ),
}));

// ── Import after mocks ─────────────────────────────────────────
import {
  getOrdersSummary,
  getTaxBreakdown,
  getTaxRemittanceData,
  getCompTotals,
  getOrderAuditCount,
} from '../index';

// ── Helpers ─────────────────────────────────────────────────────
const TENANT = 'tenant_01';
const START = '2026-01-01';
const END = '2026-01-31';
const LOC = 'loc_01';

beforeEach(() => {
  mockExecute.mockReset();
});

// ── getOrdersSummary ────────────────────────────────────────────
describe('getOrdersSummary', () => {
  it('returns all OrdersSummaryData fields with correct types', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        gross_sales: 150000,
        discount_total: 5000,
        net_sales: 145000,
        tax: 12000,
        service_charge: 3000,
        order_count: 42,
        void_count: 3,
        void_amount: 7500,
      },
    ]);

    const result = await getOrdersSummary(TENANT, START, END, LOC);

    expect(result).toEqual({
      grossSalesCents: 150000,
      discountTotalCents: 5000,
      netSalesCents: 145000,
      taxCents: 12000,
      serviceChargeCents: 3000,
      orderCount: 42,
      voidCount: 3,
      voidAmountCents: 7500,
    });

    // Verify types explicitly
    expect(typeof result.grossSalesCents).toBe('number');
    expect(typeof result.discountTotalCents).toBe('number');
    expect(typeof result.netSalesCents).toBe('number');
    expect(typeof result.taxCents).toBe('number');
    expect(typeof result.serviceChargeCents).toBe('number');
    expect(typeof result.orderCount).toBe('number');
    expect(typeof result.voidCount).toBe('number');
    expect(typeof result.voidAmountCents).toBe('number');
  });

  it('handles zero results gracefully', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        gross_sales: 0,
        discount_total: 0,
        net_sales: 0,
        tax: 0,
        service_charge: 0,
        order_count: 0,
        void_count: 0,
        void_amount: 0,
      },
    ]);

    const result = await getOrdersSummary(TENANT, START, END);

    expect(result.grossSalesCents).toBe(0);
    expect(result.orderCount).toBe(0);
    expect(result.voidCount).toBe(0);
  });

  it('converts string numerics from DB to numbers', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        gross_sales: '150000',
        discount_total: '5000',
        net_sales: '145000',
        tax: '12000',
        service_charge: '3000',
        order_count: '42',
        void_count: '3',
        void_amount: '7500',
      },
    ]);

    const result = await getOrdersSummary(TENANT, START, END, LOC);

    expect(result.grossSalesCents).toBe(150000);
    expect(typeof result.grossSalesCents).toBe('number');
    expect(result.orderCount).toBe(42);
    expect(typeof result.orderCount).toBe('number');
  });
});

// ── getTaxBreakdown ─────────────────────────────────────────────
describe('getTaxBreakdown', () => {
  it('returns TaxBreakdownRow[] with correct shape', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        tax_rate_id: 'tr_01',
        tax_rate_name: 'State Sales Tax',
        rate_decimal: '0.0825',
        jurisdiction_code: 'TX',
        authority_name: 'Texas',
        authority_type: 'state',
        tax_type: 'sales',
        taxable_sales_cents: 100000,
        tax_collected_cents: 8250,
        order_count: 15,
      },
      {
        tax_rate_id: null,
        tax_rate_name: 'Local Tax',
        rate_decimal: '0.01',
        jurisdiction_code: null,
        authority_name: null,
        authority_type: null,
        tax_type: 'sales',
        taxable_sales_cents: 100000,
        tax_collected_cents: 1000,
        order_count: 15,
      },
    ]);

    const result = await getTaxBreakdown(TENANT, START, END, LOC);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);

    // First row: fully populated
    const row0 = result[0]!;
    expect(row0.taxRateId).toBe('tr_01');
    expect(row0.taxRateName).toBe('State Sales Tax');
    expect(row0.rateDecimal).toBe(0.0825);
    expect(row0.jurisdictionCode).toBe('TX');
    expect(row0.authorityName).toBe('Texas');
    expect(row0.authorityType).toBe('state');
    expect(row0.taxType).toBe('sales');
    expect(row0.taxableSalesCents).toBe(100000);
    expect(row0.taxCollectedCents).toBe(8250);
    expect(row0.effectiveRate).toBe(0.0825);
    expect(row0.orderCount).toBe(15);

    // Second row: nullable fields
    const row1 = result[1]!;
    expect(row1.taxRateId).toBeNull();
    expect(row1.jurisdictionCode).toBeNull();
    expect(row1.authorityName).toBeNull();
    expect(row1.authorityType).toBeNull();
  });

  it('computes effectiveRate correctly', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        tax_rate_id: 'tr_01',
        tax_rate_name: 'Test Tax',
        rate_decimal: '0.1',
        jurisdiction_code: null,
        authority_name: null,
        authority_type: null,
        tax_type: 'sales',
        taxable_sales_cents: 200000,
        tax_collected_cents: 19000,
        order_count: 5,
      },
    ]);

    const result = await getTaxBreakdown(TENANT, START, END);
    // effectiveRate = Math.round((19000 / 200000) * 10000) / 10000 = 0.095
    expect(result[0]!.effectiveRate).toBe(0.095);
  });

  it('returns effectiveRate 0 when taxableSalesCents is 0', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        tax_rate_id: 'tr_01',
        tax_rate_name: 'Zero Tax',
        rate_decimal: '0.1',
        jurisdiction_code: null,
        authority_name: null,
        authority_type: null,
        tax_type: 'sales',
        taxable_sales_cents: 0,
        tax_collected_cents: 0,
        order_count: 0,
      },
    ]);

    const result = await getTaxBreakdown(TENANT, START, END);
    expect(result[0]!.effectiveRate).toBe(0);
  });

  it('returns empty array when no tax data exists', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getTaxBreakdown(TENANT, START, END);
    expect(result).toEqual([]);
  });
});

// ── getTaxRemittanceData ────────────────────────────────────────
describe('getTaxRemittanceData', () => {
  it('returns TaxRemittanceRow[] with correct shape', async () => {
    // First execute: tax data
    mockExecute.mockResolvedValueOnce([
      {
        jurisdiction_code: 'TX',
        authority_name: 'Texas',
        authority_type: 'state',
        tax_type: 'sales',
        filing_frequency: 'monthly',
        tax_rate_id: 'tr_01',
        tax_rate_name: 'State Sales Tax',
        rate_decimal: '0.0825',
        taxable_sales_cents: 100000,
        tax_collected_cents: 8250,
        order_count: 20,
      },
    ]);
    // Second execute: exempt sales
    mockExecute.mockResolvedValueOnce([
      { exempt_sales_cents: 5000 },
    ]);

    const result = await getTaxRemittanceData(TENANT, START, END, LOC);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);

    const row = result[0]!;
    expect(row.jurisdictionCode).toBe('TX');
    expect(row.authorityName).toBe('Texas');
    expect(row.authorityType).toBe('state');
    expect(row.taxType).toBe('sales');
    expect(row.filingFrequency).toBe('monthly');
    expect(row.taxRateId).toBe('tr_01');
    expect(row.taxRateName).toBe('State Sales Tax');
    expect(row.rateDecimal).toBe(0.0825);
    expect(row.taxableSalesCents).toBe(100000);
    expect(row.taxCollectedCents).toBe(8250);
    expect(row.exemptSalesCents).toBe(5000);
    expect(row.orderCount).toBe(20);

    // Type checks
    expect(typeof row.jurisdictionCode).toBe('string');
    expect(typeof row.taxType).toBe('string');
    expect(typeof row.rateDecimal).toBe('number');
    expect(typeof row.exemptSalesCents).toBe('number');
  });

  it('returns nullable fields as null when absent', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        jurisdiction_code: null,
        authority_name: null,
        authority_type: null,
        tax_type: 'sales',
        filing_frequency: null,
        tax_rate_id: null,
        tax_rate_name: 'Unknown Tax',
        rate_decimal: '0.05',
        taxable_sales_cents: 50000,
        tax_collected_cents: 2500,
        order_count: 3,
      },
    ]);
    mockExecute.mockResolvedValueOnce([
      { exempt_sales_cents: 0 },
    ]);

    const result = await getTaxRemittanceData(TENANT, START, END);
    const row = result[0]!;

    expect(row.jurisdictionCode).toBeNull();
    expect(row.authorityName).toBeNull();
    expect(row.authorityType).toBeNull();
    expect(row.filingFrequency).toBeNull();
    expect(row.taxRateId).toBeNull();
    expect(row.exemptSalesCents).toBe(0);
  });

  it('populates exemptSalesCents on all rows', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        jurisdiction_code: 'TX',
        authority_name: 'Texas',
        authority_type: 'state',
        tax_type: 'sales',
        filing_frequency: 'monthly',
        tax_rate_id: 'tr_01',
        tax_rate_name: 'State Tax',
        rate_decimal: '0.08',
        taxable_sales_cents: 100000,
        tax_collected_cents: 8000,
        order_count: 10,
      },
      {
        jurisdiction_code: 'TX-HARRIS',
        authority_name: 'Harris County',
        authority_type: 'county',
        tax_type: 'sales',
        filing_frequency: 'quarterly',
        tax_rate_id: 'tr_02',
        tax_rate_name: 'County Tax',
        rate_decimal: '0.02',
        taxable_sales_cents: 100000,
        tax_collected_cents: 2000,
        order_count: 10,
      },
    ]);
    mockExecute.mockResolvedValueOnce([
      { exempt_sales_cents: 12000 },
    ]);

    const result = await getTaxRemittanceData(TENANT, START, END);

    expect(result).toHaveLength(2);
    // exemptSalesCents should be the same on every row
    expect(result[0]!.exemptSalesCents).toBe(12000);
    expect(result[1]!.exemptSalesCents).toBe(12000);
  });
});

// ── getCompTotals ───────────────────────────────────────────────
describe('getCompTotals', () => {
  it('returns CompTotalData with correct shape', async () => {
    mockExecute.mockResolvedValueOnce([
      { total_comps: 25000 },
    ]);

    const result = await getCompTotals(TENANT, START, END, LOC);

    expect(result).toEqual({ totalCompsCents: 25000 });
    expect(typeof result.totalCompsCents).toBe('number');
  });

  it('returns 0 when no comp events exist', async () => {
    mockExecute.mockResolvedValueOnce([
      { total_comps: 0 },
    ]);

    const result = await getCompTotals(TENANT, START, END);
    expect(result.totalCompsCents).toBe(0);
  });

  it('handles empty result set gracefully', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getCompTotals(TENANT, START, END);
    expect(result.totalCompsCents).toBe(0);
  });

  it('converts string numeric from DB to number', async () => {
    mockExecute.mockResolvedValueOnce([
      { total_comps: '99999' },
    ]);

    const result = await getCompTotals(TENANT, START, END, LOC);
    expect(result.totalCompsCents).toBe(99999);
    expect(typeof result.totalCompsCents).toBe('number');
  });
});

// ── getOrderAuditCount ──────────────────────────────────────────
describe('getOrderAuditCount', () => {
  it('returns a number', async () => {
    mockExecute.mockResolvedValueOnce([
      { count: 157 },
    ]);

    const result = await getOrderAuditCount(TENANT, START, END);

    expect(result).toBe(157);
    expect(typeof result).toBe('number');
  });

  it('returns 0 when no orders match', async () => {
    mockExecute.mockResolvedValueOnce([
      { count: 0 },
    ]);

    const result = await getOrderAuditCount(TENANT, START, END);
    expect(result).toBe(0);
  });

  it('handles empty result set gracefully', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getOrderAuditCount(TENANT, START, END);
    expect(result).toBe(0);
  });

  it('converts string numeric from DB to number', async () => {
    mockExecute.mockResolvedValueOnce([
      { count: '42' },
    ]);

    const result = await getOrderAuditCount(TENANT, START, END);
    expect(result).toBe(42);
    expect(typeof result).toBe('number');
  });
});
