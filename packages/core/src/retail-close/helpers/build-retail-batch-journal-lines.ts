import type { RetailCloseBatch, RetailBatchJournalLine, TenderBreakdownEntry } from '../types';

/**
 * Pure function: builds category-based journal lines from a retail close batch.
 * No DB access, no side effects.
 *
 * Cash accountability formula:
 *   Expected = Opening + Cash Received + Paid In − Paid Out − Cash Drops − Change Given
 *   Over/Short = Counted − Expected
 *
 * GL posting model:
 *   DEBITS: cash_on_hand (cash), undeposited_funds (card/check/voucher), processing fees
 *   CREDITS: sales_revenue (net), tax_payable, tips_payable, service_charge_revenue
 *   DEBIT/CREDIT: cash_over_short (short = debit expense, over = credit)
 *   DEBIT: discount (contra-revenue, if we want to separate from net sales)
 *
 * Amounts are in cents. Caller converts to dollars at GL posting time.
 */
export function buildRetailBatchJournalLines(
  batch: RetailCloseBatch,
): RetailBatchJournalLine[] {
  const lines: RetailBatchJournalLine[] = [];

  // ── DEBIT side: tender breakdown (what we received) ──────────
  const tenderBreakdown = (batch.tenderBreakdown ?? []) as TenderBreakdownEntry[];

  for (const entry of tenderBreakdown) {
    if (entry.totalCents === 0) continue;

    const isCash = entry.tenderType === 'cash';
    const category = isCash ? 'cash_on_hand' : 'undeposited_funds';
    const desc = isCash
      ? `Cash sales (${entry.count} transactions)`
      : `${entry.tenderType} sales (${entry.count} transactions)`;

    lines.push({
      category,
      description: desc,
      debitCents: entry.totalCents,
      creditCents: 0,
    });
  }

  // If no tender breakdown data, use aggregate
  if (tenderBreakdown.length === 0 && batch.netSalesCents > 0) {
    lines.push({
      category: 'cash_on_hand',
      description: 'Total sales (no tender breakdown)',
      debitCents: batch.netSalesCents + batch.taxCollectedCents,
      creditCents: 0,
    });
  }

  // ── CREDIT side: what we owe ──────────────────────────────────

  // Revenue (net sales = gross - discounts - voids - refunds)
  if (batch.netSalesCents > 0) {
    lines.push({
      category: 'sales_revenue',
      description: `Net sales (${batch.orderCount} orders)`,
      debitCents: 0,
      creditCents: batch.netSalesCents,
    });
  }

  // Tax collected
  if (batch.taxCollectedCents > 0) {
    lines.push({
      category: 'tax_payable',
      description: 'Tax collected',
      debitCents: 0,
      creditCents: batch.taxCollectedCents,
    });
  }

  // Tips payable (credit card tips)
  if (batch.tipsCreditCents > 0) {
    lines.push({
      category: 'tips_payable',
      description: 'Credit card tips payable',
      debitCents: 0,
      creditCents: batch.tipsCreditCents,
    });
  }

  // Service charges
  if (batch.serviceChargeCents > 0) {
    lines.push({
      category: 'service_charge_revenue',
      description: 'Service charges',
      debitCents: 0,
      creditCents: batch.serviceChargeCents,
    });
  }

  // ── Over/Short ────────────────────────────────────────────────
  const overShort = batch.cashOverShortCents ?? 0;
  if (overShort !== 0) {
    if (overShort < 0) {
      // Short: debit the expense
      lines.push({
        category: 'cash_over_short',
        description: `Cash short: $${(Math.abs(overShort) / 100).toFixed(2)}`,
        debitCents: Math.abs(overShort),
        creditCents: 0,
      });
    } else {
      // Over: credit (gain)
      lines.push({
        category: 'cash_over_short',
        description: `Cash over: $${(overShort / 100).toFixed(2)}`,
        debitCents: 0,
        creditCents: overShort,
      });
    }
  }

  return lines;
}
