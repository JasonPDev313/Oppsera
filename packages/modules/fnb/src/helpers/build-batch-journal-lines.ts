/**
 * Builds journal entry lines from a close batch summary for GL posting.
 * This is a pure function — no DB calls, no side effects.
 *
 * Cash accountability formula:
 *   Expected cash = Starting float + Cash sales + Cash tips - Cash drops - Cash paid outs
 *   Over/Short = Counted cash - Expected cash
 *
 * Journal line categories:
 * - DEBIT: Cash on Hand (cash sales + cash tips)
 * - DEBIT: Undeposited Funds (credit card sales)
 * - DEBIT: Discount Expense or Contra-Revenue (discounts)
 * - DEBIT: Comp Expense (comps)
 * - DEBIT: Cash Over/Short (if short)
 * - CREDIT: Sales Revenue (net sales)
 * - CREDIT: Tax Payable (tax collected)
 * - CREDIT: Tips Payable (credit tips)
 * - CREDIT: Service Charge Revenue (service charges)
 * - CREDIT: Cash Over/Short (if over)
 */

export interface JournalLine {
  category: string;
  description: string;
  debitCents: number;
  creditCents: number;
}

export function buildBatchJournalLines(
  summary: Record<string, unknown>,
): JournalLine[] {
  const lines: JournalLine[] = [];

  const netSalesCents = Number(summary.net_sales_cents ?? 0);
  const taxCollectedCents = Number(summary.tax_collected_cents ?? 0);
  const tipsCreditCents = Number(summary.tips_credit_cents ?? 0);
  const tipsCashDeclaredCents = Number(summary.tips_cash_declared_cents ?? 0);
  const serviceChargesCents = Number(summary.service_charges_cents ?? 0);
  const discountsCents = Number(summary.discounts_cents ?? 0);
  const compsCents = Number(summary.comps_cents ?? 0);
  const cashSalesCents = Number(summary.cash_sales_cents ?? 0);
  const cashOverShortCents = Number(summary.cash_over_short_cents ?? 0);

  // Parse tender breakdown for payment type debit lines
  const tenderBreakdown = (summary.tender_breakdown ?? []) as Array<{
    tenderType: string;
    totalCents: number;
  }>;

  // DEBIT side — payment collection
  for (const tender of tenderBreakdown) {
    if (tender.totalCents > 0) {
      const isCash = tender.tenderType === 'cash';
      lines.push({
        category: isCash ? 'cash_on_hand' : 'undeposited_funds',
        description: `${tender.tenderType} payments collected`,
        debitCents: tender.totalCents,
        creditCents: 0,
      });
    }
  }

  // If no tender breakdown, use cash sales as fallback
  if (tenderBreakdown.length === 0 && cashSalesCents > 0) {
    lines.push({
      category: 'cash_on_hand',
      description: 'Cash sales collected',
      debitCents: cashSalesCents,
      creditCents: 0,
    });
  }

  // DEBIT: Discounts (contra-revenue or expense)
  if (discountsCents > 0) {
    lines.push({
      category: 'discount',
      description: 'Discounts given',
      debitCents: discountsCents,
      creditCents: 0,
    });
  }

  // DEBIT: Comps (expense)
  if (compsCents > 0) {
    lines.push({
      category: 'comp_expense',
      description: 'Comps / complimentary items',
      debitCents: compsCents,
      creditCents: 0,
    });
  }

  // DEBIT: Cash short (if negative over/short, we have a shortage)
  if (cashOverShortCents < 0) {
    lines.push({
      category: 'cash_over_short',
      description: 'Cash shortage',
      debitCents: Math.abs(cashOverShortCents),
      creditCents: 0,
    });
  }

  // CREDIT side — revenue & liabilities
  if (netSalesCents > 0) {
    lines.push({
      category: 'sales_revenue',
      description: 'Net sales revenue',
      debitCents: 0,
      creditCents: netSalesCents,
    });
  }

  if (taxCollectedCents > 0) {
    lines.push({
      category: 'tax_payable',
      description: 'Sales tax collected',
      debitCents: 0,
      creditCents: taxCollectedCents,
    });
  }

  if (tipsCreditCents > 0) {
    lines.push({
      category: 'tips_payable',
      description: 'Credit card tips payable',
      debitCents: 0,
      creditCents: tipsCreditCents,
    });
  }

  if (serviceChargesCents > 0) {
    lines.push({
      category: 'service_charge_revenue',
      description: 'Service charges collected',
      debitCents: 0,
      creditCents: serviceChargesCents,
    });
  }

  // CREDIT: Cash overage (if positive over/short, we have surplus)
  if (cashOverShortCents > 0) {
    lines.push({
      category: 'cash_over_short',
      description: 'Cash overage',
      debitCents: 0,
      creditCents: cashOverShortCents,
    });
  }

  return lines;
}
