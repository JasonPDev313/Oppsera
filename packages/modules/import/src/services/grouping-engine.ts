/**
 * Grouping engine: reconstruct orders from flat CSV rows.
 *
 * Groups rows by a designated key column (e.g., TransactionID, ReceiptNumber)
 * and extracts order headers, line items, and tenders from each group.
 */

import type { ColumnMapping } from './mapping-engine';

// ── Types ─────────────────────────────────────────────────────────────

export interface GroupedOrder {
  groupKey: string;
  /** First row number in this group (1-indexed with header) */
  firstRowNumber: number;
  header: Record<string, string>;
  lines: Array<Record<string, string>>;
  tenders: Array<Record<string, string>>;
  taxData: Record<string, string>;
  rawRows: string[][];
}

interface FieldExtractor {
  sourceIndex: number;
  targetField: string;
  entity: string;
}

// ── Extractor Builder ─────────────────────────────────────────────────

function buildExtractors(mappings: ColumnMapping[]): {
  orderExtractors: FieldExtractor[];
  lineExtractors: FieldExtractor[];
  tenderExtractors: FieldExtractor[];
  taxExtractors: FieldExtractor[];
} {
  const orderExtractors: FieldExtractor[] = [];
  const lineExtractors: FieldExtractor[] = [];
  const tenderExtractors: FieldExtractor[] = [];
  const taxExtractors: FieldExtractor[] = [];

  for (const m of mappings) {
    if (m.targetEntity === 'ignore' || !m.targetField) continue;
    const ext: FieldExtractor = {
      sourceIndex: m.sourceIndex,
      targetField: m.targetField,
      entity: m.targetEntity,
    };
    switch (m.targetEntity) {
      case 'order': orderExtractors.push(ext); break;
      case 'line': lineExtractors.push(ext); break;
      case 'tender': tenderExtractors.push(ext); break;
      case 'tax': taxExtractors.push(ext); break;
    }
  }

  return { orderExtractors, lineExtractors, tenderExtractors, taxExtractors };
}

function extractFields(row: string[], extractors: FieldExtractor[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const ext of extractors) {
    const val = row[ext.sourceIndex] ?? '';
    if (val) result[ext.targetField] = val;
  }
  return result;
}

// ── Grouping Logic ────────────────────────────────────────────────────

/**
 * Group flat rows into order structures.
 *
 * @param rows - Parsed CSV rows (no header)
 * @param mappings - Confirmed column mappings
 * @param groupingKeyIndex - Column index used for grouping
 */
export function groupRowsIntoOrders(
  rows: string[][],
  mappings: ColumnMapping[],
  groupingKeyIndex: number,
): GroupedOrder[] {
  const { orderExtractors, lineExtractors, tenderExtractors, taxExtractors } = buildExtractors(mappings);

  // Group rows by key value
  const groups = new Map<string, { rows: string[][]; firstRowNum: number }>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const key = row[groupingKeyIndex]?.trim() || `__row_${i + 2}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { rows: [row], firstRowNum: i + 2 }); // +2 for 1-indexed + header
    }
  }

  const orders: GroupedOrder[] = [];

  for (const [groupKey, group] of groups) {
    const firstRow = group.rows[0]!;

    // Extract order header from first row
    const header = extractFields(firstRow, orderExtractors);

    // Extract line items — one per row (that has item data)
    const lines: Array<Record<string, string>> = [];
    for (const row of group.rows) {
      const lineData = extractFields(row, lineExtractors);
      if (lineData.catalogItemName || lineData.catalogItemSku || lineData.lineTotal || lineData.unitPrice) {
        lines.push(lineData);
      }
    }

    // Extract tenders — look for tender data on each row
    const tenders: Array<Record<string, string>> = [];
    const seenTenders = new Set<string>();
    for (const row of group.rows) {
      const tenderData = extractFields(row, tenderExtractors);
      if (tenderData.tenderType || tenderData.amount) {
        // Dedup by tenderType+amount combination
        const key = `${tenderData.tenderType ?? ''}|${tenderData.amount ?? ''}`;
        if (!seenTenders.has(key)) {
          seenTenders.add(key);
          tenders.push(tenderData);
        }
      }
    }

    // Extract tax from first row (usually order-level)
    const taxData = extractFields(firstRow, taxExtractors);

    orders.push({
      groupKey,
      firstRowNumber: group.firstRowNum,
      header,
      lines: lines.length > 0 ? lines : [extractFields(firstRow, lineExtractors)],
      tenders: tenders.length > 0 ? tenders : [extractFields(firstRow, tenderExtractors)],
      taxData,
      rawRows: group.rows,
    });
  }

  return orders;
}

/**
 * Handle single-row-per-transaction structure.
 * Each row = one order with one line and one tender.
 */
export function groupAsSingleRowOrders(
  rows: string[][],
  mappings: ColumnMapping[],
): GroupedOrder[] {
  return groupRowsIntoOrders(rows, mappings, -1);
}
