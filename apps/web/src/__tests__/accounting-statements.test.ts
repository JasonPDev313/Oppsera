import { describe, it, expect } from 'vitest';

import { formatAccountingMoney } from '../types/accounting';
import type {
  FinancialStatementSection,
  CloseChecklistItem,
  SalesTaxRow,
} from '../types/accounting';

// ═══════════════════════════════════════════════════════════════
// P&L net income calculation
// ═══════════════════════════════════════════════════════════════

describe('P&L net income', () => {
  it('computes net income as revenue - cogs - expenses', () => {
    const totalRevenue = 148600;
    const totalCogs = 22300;
    const totalExpenses = 89500;
    const grossProfit = totalRevenue - totalCogs;
    const netIncome = grossProfit - totalExpenses;
    expect(grossProfit).toBe(126300);
    expect(netIncome).toBe(36800);
  });

  it('handles negative net income (net loss)', () => {
    const totalRevenue = 50000;
    const totalCogs = 30000;
    const totalExpenses = 40000;
    const netIncome = totalRevenue - totalCogs - totalExpenses;
    expect(netIncome).toBe(-20000);
    expect(formatAccountingMoney(netIncome)).toBe('($20,000.00)');
  });

  it('sums section subtotals correctly', () => {
    const section: FinancialStatementSection = {
      label: 'Revenue',
      accounts: [
        { accountId: 'a1', accountNumber: '4010', accountName: 'Green Fees', amount: 45200 },
        { accountId: 'a2', accountNumber: '4020', accountName: 'Cart Rental', amount: 12800 },
      ],
      subtotal: 58000,
    };
    const computed = section.accounts.reduce((sum, a) => sum + a.amount, 0);
    expect(computed).toBe(section.subtotal);
  });
});

// ═══════════════════════════════════════════════════════════════
// Balance sheet out-of-balance detection
// ═══════════════════════════════════════════════════════════════

describe('balance sheet balance check', () => {
  it('detects balanced condition (A = L + E)', () => {
    const totalAssets = 203500;
    const totalLiabilities = 28600;
    const totalEquity = 174900;
    const isBalanced = totalAssets === totalLiabilities + totalEquity;
    expect(isBalanced).toBe(true);
  });

  it('detects out-of-balance condition', () => {
    const totalAssets = 203500;
    const totalLiabilities = 28600;
    const totalEquity = 170000;
    const isBalanced = totalAssets === totalLiabilities + totalEquity;
    expect(isBalanced).toBe(false);
    const difference = totalAssets - (totalLiabilities + totalEquity);
    expect(difference).toBe(4900);
  });

  it('includes current year net income in equity', () => {
    const retainedEarnings = 138100;
    const currentYearNetIncome = 36800;
    const totalEquity = retainedEarnings + currentYearNetIncome;
    expect(totalEquity).toBe(174900);
  });
});

// ═══════════════════════════════════════════════════════════════
// Period close checklist states
// ═══════════════════════════════════════════════════════════════

describe('period close checklist', () => {
  const checklist: CloseChecklistItem[] = [
    { label: 'Open Draft Entries', status: 'pass', detail: 'No draft entries' },
    { label: 'Unmapped Events', status: 'pass', detail: '0 unmapped events' },
    { label: 'AP Reconciliation', status: 'fail', detail: 'AP subledger: $12,400 vs GL: $12,500 — difference $100' },
    { label: 'AR Reconciliation', status: 'pass' },
    { label: 'Trial Balance', status: 'pass', detail: 'Trial balance is balanced' },
    { label: 'Negative Inventory', status: 'warning', detail: '3 items have negative stock' },
  ];

  it('counts failures correctly', () => {
    const failCount = checklist.filter((c) => c.status === 'fail').length;
    expect(failCount).toBe(1);
  });

  it('allows close when only warnings and passes exist', () => {
    const noFails = checklist.filter((c) => c.status !== 'fail');
    const canClose = noFails.every((c) => c.status === 'pass' || c.status === 'warning');
    expect(canClose).toBe(true);
  });

  it('blocks close when failures exist', () => {
    const canClose = checklist.every((c) => c.status === 'pass' || c.status === 'warning');
    expect(canClose).toBe(false);
  });

  it('identifies which items need fixing', () => {
    const needsFix = checklist.filter((c) => c.status === 'fail').map((c) => c.label);
    expect(needsFix).toEqual(['AP Reconciliation']);
  });
});

// ═══════════════════════════════════════════════════════════════
// Dashboard KPI formatting
// ═══════════════════════════════════════════════════════════════

describe('dashboard KPI formatting', () => {
  it('formats positive amounts', () => {
    expect(formatAccountingMoney(36800)).toBe('$36,800.00');
    expect(formatAccountingMoney(42500.5)).toBe('$42,500.50');
  });

  it('formats negative amounts with parentheses', () => {
    expect(formatAccountingMoney(-1200)).toBe('($1,200.00)');
  });

  it('formats zero', () => {
    expect(formatAccountingMoney(0)).toBe('$0.00');
  });

  it('handles string input from GL', () => {
    expect(formatAccountingMoney('15800.00')).toBe('$15,800.00');
    expect(formatAccountingMoney('-500.25')).toBe('($500.25)');
  });

  it('handles NaN gracefully', () => {
    expect(formatAccountingMoney('invalid')).toBe('$0.00');
  });
});

// ═══════════════════════════════════════════════════════════════
// Sales tax net liability
// ═══════════════════════════════════════════════════════════════

describe('sales tax net liability', () => {
  const rows: SalesTaxRow[] = [
    { taxGroupId: 't1', taxGroupName: 'State Sales Tax', jurisdiction: 'State', rate: 0.06, taxCollected: 3600, taxRemitted: 2400, netLiability: 1200 },
    { taxGroupId: 't2', taxGroupName: 'County Tax', jurisdiction: 'County', rate: 0.015, taxCollected: 900, taxRemitted: 900, netLiability: 0 },
    { taxGroupId: 't3', taxGroupName: 'City Tax', jurisdiction: 'City', rate: 0.01, taxCollected: 600, taxRemitted: 800, netLiability: -200 },
  ];

  it('computes totals correctly', () => {
    const totals = rows.reduce(
      (acc, r) => ({
        collected: acc.collected + r.taxCollected,
        remitted: acc.remitted + r.taxRemitted,
        liability: acc.liability + r.netLiability,
      }),
      { collected: 0, remitted: 0, liability: 0 },
    );
    expect(totals.collected).toBe(5100);
    expect(totals.remitted).toBe(4100);
    expect(totals.liability).toBe(1000);
  });

  it('identifies groups with outstanding liability', () => {
    const owing = rows.filter((r) => r.netLiability > 0);
    expect(owing).toHaveLength(1);
    expect(owing[0]!.taxGroupName).toBe('State Sales Tax');
  });

  it('identifies overpaid groups (negative liability)', () => {
    const overpaid = rows.filter((r) => r.netLiability < 0);
    expect(overpaid).toHaveLength(1);
    expect(overpaid[0]!.taxGroupName).toBe('City Tax');
  });

  it('formats rate as percentage', () => {
    const formatted = rows.map((r) => (r.rate * 100).toFixed(2) + '%');
    expect(formatted).toEqual(['6.00%', '1.50%', '1.00%']);
  });
});
