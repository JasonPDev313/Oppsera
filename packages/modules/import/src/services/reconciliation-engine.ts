/**
 * Reconciliation engine: compute comparison totals between legacy data
 * and what OppsEra would create.
 */

import type { StagedRow } from './staging-engine';

// ── Types ─────────────────────────────────────────────────────────────

export interface ReconciliationSummary {
  legacyRevenueCents: number;
  legacyPaymentCents: number;
  legacyTaxCents: number;
  legacyRowCount: number;
  oppseraRevenueCents: number;
  oppseraPaymentCents: number;
  oppseraTaxCents: number;
  oppseraOrderCount: number;
  revenueDifferenceCents: number;
  paymentDifferenceCents: number;
  taxDifferenceCents: number;
  isBalanced: boolean;
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function toInt(value: unknown): number {
  if (typeof value === 'number') return Math.round(value);
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }
  return 0;
}

function toCents(value: unknown): number {
  if (typeof value === 'number') return value;
  return toInt(value);
}

// ── Main Function ─────────────────────────────────────────────────────

/**
 * Compute reconciliation totals from staged rows.
 * Compares what the CSV says vs what we'd create in OppsEra.
 */
export function computeReconciliation(
  stagedRows: StagedRow[],
  totalCsvRows: number,
): ReconciliationSummary {
  const warnings: string[] = [];

  // Collect by group key
  const orderGroups = new Map<string, {
    headers: StagedRow[];
    lines: StagedRow[];
    tenders: StagedRow[];
  }>();

  for (const row of stagedRows) {
    const group = orderGroups.get(row.groupKey) ?? { headers: [], lines: [], tenders: [] };
    switch (row.entityType) {
      case 'order_header': group.headers.push(row); break;
      case 'order_line': group.lines.push(row); break;
      case 'tender': group.tenders.push(row); break;
    }
    orderGroups.set(row.groupKey, group);
  }

  // Legacy totals (from CSV data as-is)
  let legacyRevenueCents = 0;
  let legacyPaymentCents = 0;
  let legacyTaxCents = 0;

  // OppsEra totals (what we'd create)
  let oppseraRevenueCents = 0;
  let oppseraPaymentCents = 0;
  let oppseraTaxCents = 0;

  for (const [, group] of orderGroups) {
    const header = group.headers[0]?.parsedData ?? {};

    // Legacy revenue: prefer header total, fall back to sum of lines
    const headerTotal = toCents(header.total);
    const lineSum = group.lines.reduce((sum, line) => {
      const lineTotal = toCents(line.parsedData.lineTotal);
      const unitPrice = toCents(line.parsedData.unitPrice);
      const qty = Number(line.parsedData.qty) || 1;
      return sum + (lineTotal || unitPrice * qty);
    }, 0);

    legacyRevenueCents += headerTotal || lineSum;

    // Legacy payments
    const tenderSum = group.tenders.reduce(
      (sum, t) => sum + toCents(t.parsedData.amount),
      0,
    );
    legacyPaymentCents += tenderSum;

    // Legacy tax
    legacyTaxCents += toCents(header.taxAmount);

    // OppsEra: revenue from line items (what we'd actually create)
    oppseraRevenueCents += lineSum || headerTotal;

    // OppsEra: payments we'd record
    oppseraPaymentCents += tenderSum || headerTotal;

    // OppsEra: tax we'd apply
    oppseraTaxCents += toCents(header.taxAmount);
  }

  const revenueDifferenceCents = Math.abs(legacyRevenueCents - oppseraRevenueCents);
  const paymentDifferenceCents = Math.abs(legacyPaymentCents - oppseraPaymentCents);
  const taxDifferenceCents = Math.abs(legacyTaxCents - oppseraTaxCents);

  // Balanced if all differences < $1.00 (100 cents)
  const isBalanced =
    revenueDifferenceCents < 100 &&
    paymentDifferenceCents < 100 &&
    taxDifferenceCents < 100;

  // Warnings
  if (revenueDifferenceCents >= 100) {
    warnings.push(
      `Revenue difference: $${(revenueDifferenceCents / 100).toFixed(2)} — legacy $${(legacyRevenueCents / 100).toFixed(2)} vs OppsEra $${(oppseraRevenueCents / 100).toFixed(2)}`,
    );
  }
  if (paymentDifferenceCents >= 100) {
    warnings.push(
      `Payment difference: $${(paymentDifferenceCents / 100).toFixed(2)} — legacy $${(legacyPaymentCents / 100).toFixed(2)} vs OppsEra $${(oppseraPaymentCents / 100).toFixed(2)}`,
    );
  }
  if (legacyPaymentCents > 0 && Math.abs(legacyRevenueCents - legacyPaymentCents) > 100) {
    warnings.push(
      `Revenue/payment mismatch in source data: revenue $${(legacyRevenueCents / 100).toFixed(2)} vs payments $${(legacyPaymentCents / 100).toFixed(2)}`,
    );
  }

  return {
    legacyRevenueCents,
    legacyPaymentCents,
    legacyTaxCents,
    legacyRowCount: totalCsvRows,
    oppseraRevenueCents,
    oppseraPaymentCents,
    oppseraTaxCents,
    oppseraOrderCount: orderGroups.size,
    revenueDifferenceCents,
    paymentDifferenceCents,
    taxDifferenceCents,
    isBalanced,
    warnings,
  };
}
