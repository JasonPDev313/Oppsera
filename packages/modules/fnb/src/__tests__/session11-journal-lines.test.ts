import { describe, it, expect } from 'vitest';
import { buildBatchJournalLines } from '../helpers/build-batch-journal-lines';

describe('buildBatchJournalLines', () => {
  const baseSummary = {
    net_sales_cents: 150000,
    tax_collected_cents: 12000,
    tips_credit_cents: 22500,
    tips_cash_declared_cents: 5000,
    service_charges_cents: 10000,
    discounts_cents: 5000,
    comps_cents: 2500,
    cash_sales_cents: 50000,
    cash_over_short_cents: 0,
    tender_breakdown: [
      { tenderType: 'cash', totalCents: 50000 },
      { tenderType: 'credit_card', totalCents: 145000 },
    ],
  };

  it('produces balanced debit/credit lines for a standard batch', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const totalDebit = lines.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.creditCents, 0);
    expect(totalDebit).toBeGreaterThan(0);
    expect(totalCredit).toBeGreaterThan(0);
  });

  it('creates cash_on_hand line for cash tenders', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const cashLine = lines.find((l) => l.category === 'cash_on_hand');
    expect(cashLine).toBeDefined();
    expect(cashLine!.debitCents).toBe(50000);
  });

  it('creates undeposited_funds line for credit card tenders', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const ccLine = lines.find((l) => l.category === 'undeposited_funds');
    expect(ccLine).toBeDefined();
    expect(ccLine!.debitCents).toBe(145000);
  });

  it('creates sales_revenue credit line', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const revLine = lines.find((l) => l.category === 'sales_revenue');
    expect(revLine).toBeDefined();
    expect(revLine!.creditCents).toBe(150000);
  });

  it('creates tax_payable credit line', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const taxLine = lines.find((l) => l.category === 'tax_payable');
    expect(taxLine).toBeDefined();
    expect(taxLine!.creditCents).toBe(12000);
  });

  it('creates tips_payable credit line', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const tipsLine = lines.find((l) => l.category === 'tips_payable');
    expect(tipsLine).toBeDefined();
    expect(tipsLine!.creditCents).toBe(22500);
  });

  it('creates service_charge_revenue credit line', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const scLine = lines.find((l) => l.category === 'service_charge_revenue');
    expect(scLine).toBeDefined();
    expect(scLine!.creditCents).toBe(10000);
  });

  it('creates discount debit line', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const discLine = lines.find((l) => l.category === 'discount');
    expect(discLine).toBeDefined();
    expect(discLine!.debitCents).toBe(5000);
  });

  it('creates comp_expense debit line', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const compLine = lines.find((l) => l.category === 'comp_expense');
    expect(compLine).toBeDefined();
    expect(compLine!.debitCents).toBe(2500);
  });

  it('handles cash shortage (negative over/short)', () => {
    const summary = { ...baseSummary, cash_over_short_cents: -500 };
    const lines = buildBatchJournalLines(summary);
    const shortLine = lines.find((l) => l.category === 'cash_over_short' && l.debitCents > 0);
    expect(shortLine).toBeDefined();
    expect(shortLine!.debitCents).toBe(500);
  });

  it('handles cash overage (positive over/short)', () => {
    const summary = { ...baseSummary, cash_over_short_cents: 300 };
    const lines = buildBatchJournalLines(summary);
    const overLine = lines.find((l) => l.category === 'cash_over_short' && l.creditCents > 0);
    expect(overLine).toBeDefined();
    expect(overLine!.creditCents).toBe(300);
  });

  it('handles zero over/short (no over/short line)', () => {
    const lines = buildBatchJournalLines(baseSummary);
    const overShortLines = lines.filter((l) => l.category === 'cash_over_short');
    expect(overShortLines).toHaveLength(0);
  });

  it('handles empty tender breakdown with cash fallback', () => {
    const summary = { ...baseSummary, tender_breakdown: [] };
    const lines = buildBatchJournalLines(summary);
    const cashLine = lines.find((l) => l.category === 'cash_on_hand');
    expect(cashLine).toBeDefined();
    expect(cashLine!.debitCents).toBe(50000);
  });

  it('omits zero-amount categories', () => {
    const summary = {
      ...baseSummary,
      discounts_cents: 0,
      comps_cents: 0,
      service_charges_cents: 0,
    };
    const lines = buildBatchJournalLines(summary);
    expect(lines.find((l) => l.category === 'discount')).toBeUndefined();
    expect(lines.find((l) => l.category === 'comp_expense')).toBeUndefined();
    expect(lines.find((l) => l.category === 'service_charge_revenue')).toBeUndefined();
  });

  it('returns empty lines when no sales data', () => {
    const summary = {
      net_sales_cents: 0,
      tax_collected_cents: 0,
      tips_credit_cents: 0,
      tips_cash_declared_cents: 0,
      service_charges_cents: 0,
      discounts_cents: 0,
      comps_cents: 0,
      cash_sales_cents: 0,
      cash_over_short_cents: 0,
      tender_breakdown: [],
    };
    const lines = buildBatchJournalLines(summary);
    expect(lines).toHaveLength(0);
  });
});
