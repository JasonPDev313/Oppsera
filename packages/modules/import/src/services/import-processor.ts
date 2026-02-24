/**
 * Import processor: convert staged rows into OppsEra orders, line items, and tenders.
 *
 * This module builds the data structures needed by the order/tender creation commands.
 * The actual DB writes happen through the existing command layer (openOrder, addLineItem,
 * placeOrder, recordTender) called from the execute-import command.
 */

import type { StagedRow } from './staging-engine';

// ── Types ─────────────────────────────────────────────────────────────

export interface ProcessedOrder {
  groupKey: string;
  businessDate: string | null;
  locationName: string | null;
  employeeName: string | null;
  terminalName: string | null;
  customerName: string | null;
  tableNumber: string | null;
  notes: string | null;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  lines: ProcessedLine[];
  tenders: ProcessedTender[];
  metadata: Record<string, unknown>;
}

export interface ProcessedLine {
  catalogItemName: string;
  catalogItemSku: string | null;
  catalogItemId: string | null;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface ProcessedTender {
  tenderType: string;
  amountCents: number;
  tipAmountCents: number;
  changeGivenCents: number;
}

export interface ProcessingResult {
  orders: ProcessedOrder[];
  errors: Array<{
    groupKey: string;
    rowNumber: number;
    message: string;
    severity: 'error' | 'warning';
    category: string;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────

function toCents(value: unknown): number {
  if (typeof value === 'number') return Math.round(value);
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }
  return 0;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function toString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

// ── Main Processor ────────────────────────────────────────────────────

/**
 * Process staged rows into structured orders ready for import.
 *
 * @param stagedRows - Rows from import_staged_rows table
 * @param importJobId - The import job ID for metadata tagging
 * @param tenderMappings - Legacy tender type → OppsEra tender type map
 * @param itemMappings - Legacy item name → catalog item ID map
 */
export function processStagedsRows(
  stagedRows: StagedRow[],
  importJobId: string,
  tenderMappings: Map<string, string>,
  itemMappings: Map<string, { catalogItemId: string | null; strategy: string }>,
): ProcessingResult {
  const errors: ProcessingResult['errors'] = [];

  // Group staged rows by groupKey
  const groups = new Map<string, {
    headers: StagedRow[];
    lines: StagedRow[];
    tenders: StagedRow[];
  }>();

  for (const row of stagedRows) {
    if (row.parsedData === null) continue;
    const group = groups.get(row.groupKey) ?? { headers: [], lines: [], tenders: [] };
    switch (row.entityType) {
      case 'order_header': group.headers.push(row); break;
      case 'order_line': group.lines.push(row); break;
      case 'tender': group.tenders.push(row); break;
    }
    groups.set(row.groupKey, group);
  }

  const orders: ProcessedOrder[] = [];

  for (const [groupKey, group] of groups) {
    const header = group.headers[0]?.parsedData ?? {};

    // Parse header fields
    const businessDate = toString(header.businessDate);
    const subtotalCents = toCents(header.subtotal);
    const taxCents = toCents(header.taxAmount);
    const discountCents = toCents(header.discountTotal);
    const headerTotalCents = toCents(header.total);

    // Process lines
    const lines: ProcessedLine[] = [];
    for (const lineRow of group.lines) {
      const d = lineRow.parsedData;
      const name = toString(d.catalogItemName) ?? toString(d.catalogItemSku) ?? 'Unknown Item';
      const sku = toString(d.catalogItemSku);
      const qty = toNumber(d.qty) || 1;
      const unitPriceCents = toCents(d.unitPrice);
      const lineTotalCents = toCents(d.lineTotal) || unitPriceCents * qty;

      // Resolve catalog item
      const itemKey = name.toLowerCase();
      const itemMapping = itemMappings.get(itemKey);
      const catalogItemId = itemMapping?.catalogItemId ?? null;

      if (itemMapping?.strategy === 'skip') continue;

      lines.push({
        catalogItemName: name,
        catalogItemSku: sku,
        catalogItemId,
        qty,
        unitPriceCents,
        lineTotalCents,
      });
    }

    // Process tenders
    const tenders: ProcessedTender[] = [];
    for (const tenderRow of group.tenders) {
      const d = tenderRow.parsedData;
      const legacyType = toString(d.tenderType) ?? 'unknown';
      const mappedType = tenderMappings.get(legacyType) ?? 'other';
      const amountCents = toCents(d.amount);
      const tipAmountCents = toCents(d.tipAmount);
      const changeGivenCents = toCents(d.changeGiven);

      if (amountCents === 0 && !legacyType) continue;

      tenders.push({
        tenderType: mappedType,
        amountCents: amountCents || headerTotalCents,
        tipAmountCents,
        changeGivenCents,
      });
    }

    // Ensure at least one tender
    if (tenders.length === 0) {
      const lineSumCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
      tenders.push({
        tenderType: 'other',
        amountCents: headerTotalCents || lineSumCents,
        tipAmountCents: 0,
        changeGivenCents: 0,
      });
      errors.push({
        groupKey,
        rowNumber: group.headers[0]?.rowNumber ?? 0,
        message: 'No tender data found — defaulted to "other" for the order total',
        severity: 'warning',
        category: 'missing_tender',
      });
    }

    // Compute totals
    const lineSumCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const totalCents = headerTotalCents || (lineSumCents + taxCents - discountCents);

    // Validate balance
    const tenderSumCents = tenders.reduce((s, t) => s + t.amountCents, 0);
    if (totalCents > 0 && Math.abs(totalCents - tenderSumCents) > 100) {
      errors.push({
        groupKey,
        rowNumber: group.headers[0]?.rowNumber ?? 0,
        message: `Order total ($${(totalCents / 100).toFixed(2)}) doesn't match tender total ($${(tenderSumCents / 100).toFixed(2)})`,
        severity: 'warning',
        category: 'balance',
      });
    }

    orders.push({
      groupKey,
      businessDate,
      locationName: toString(header.locationName),
      employeeName: toString(header.employeeName),
      terminalName: toString(header.terminalName),
      customerName: toString(header.customerName),
      tableNumber: toString(header.tableNumber),
      notes: toString(header.notes),
      subtotalCents: subtotalCents || lineSumCents,
      taxCents,
      discountCents,
      totalCents,
      lines,
      tenders,
      metadata: {
        importJobId,
        legacyTransactionId: groupKey,
        isLegacyImport: true,
      },
    });
  }

  return { orders, errors };
}
