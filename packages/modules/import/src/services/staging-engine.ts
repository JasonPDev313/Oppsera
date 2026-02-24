/**
 * Staging engine: parse and transform grouped orders into import_staged_rows.
 *
 * Applies column mappings and transform rules to produce structured data
 * ready for the import processor.
 */

import type { GroupedOrder } from './grouping-engine';

// ── Types ─────────────────────────────────────────────────────────────

export interface StagedRow {
  rowNumber: number;
  groupKey: string;
  entityType: 'order_header' | 'order_line' | 'tender';
  parsedData: Record<string, unknown>;
}

export interface StagingResult {
  stagedRows: StagedRow[];
  errors: Array<{
    rowNumber: number;
    severity: 'error' | 'warning';
    category: string;
    message: string;
    sourceData?: Record<string, string>;
  }>;
}

// ── Transform Functions ───────────────────────────────────────────────

function dollarsToCents(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

function parseDate(value: string): string | null {
  // Try ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.substring(0, 10);
  }

  // US format: M/D/YYYY or MM/DD/YYYY
  const usMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (usMatch) {
    const month = usMatch[1]!.padStart(2, '0');
    const day = usMatch[2]!.padStart(2, '0');
    let year = usMatch[3]!;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // Compact: YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    return `${value.substring(0, 4)}-${value.substring(4, 6)}-${value.substring(6, 8)}`;
  }

  // Try Date.parse as last resort
  const ts = Date.parse(value);
  if (!isNaN(ts)) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return null;
}

function applyTransform(value: string, rule: string): unknown {
  switch (rule) {
    case 'dollars_to_cents':
      return dollarsToCents(value);
    case 'cents_to_dollars':
      return (parseInt(value, 10) / 100).toFixed(2);
    case 'date_parse':
      return parseDate(value);
    case 'none':
    case 'lookup':
    default:
      return value;
  }
}

// ── Column Mapping Info ───────────────────────────────────────────────

interface MappingInfo {
  targetField: string;
  transformRule: string;
}

// ── Main Staging Function ─────────────────────────────────────────────

/**
 * Transform grouped orders into staged rows ready for import.
 */
export function stageOrders(
  orders: GroupedOrder[],
  fieldTransforms: Map<string, MappingInfo>,
): StagingResult {
  const stagedRows: StagedRow[] = [];
  const errors: StagingResult['errors'] = [];

  for (const order of orders) {
    // Stage order header
    const headerData: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(order.header)) {
      const mapping = fieldTransforms.get(field);
      headerData[field] = mapping ? applyTransform(value, mapping.transformRule) : value;
    }

    // Add tax data to header
    for (const [field, value] of Object.entries(order.taxData)) {
      const mapping = fieldTransforms.get(field);
      headerData[field] = mapping ? applyTransform(value, mapping.transformRule) : value;
    }

    // Validate business date
    if (headerData.businessDate === null && order.header.businessDate) {
      errors.push({
        rowNumber: order.firstRowNumber,
        severity: 'warning',
        category: 'date_invalid',
        message: `Could not parse date "${order.header.businessDate}"`,
        sourceData: order.header,
      });
    }

    stagedRows.push({
      rowNumber: order.firstRowNumber,
      groupKey: order.groupKey,
      entityType: 'order_header',
      parsedData: headerData,
    });

    // Stage line items
    for (let i = 0; i < order.lines.length; i++) {
      const line = order.lines[i]!;
      const lineData: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(line)) {
        const mapping = fieldTransforms.get(field);
        lineData[field] = mapping ? applyTransform(value, mapping.transformRule) : value;
      }

      // Validate line has either name/SKU or price
      if (!lineData.catalogItemName && !lineData.catalogItemSku && !lineData.lineTotal && !lineData.unitPrice) {
        continue; // skip empty lines
      }

      stagedRows.push({
        rowNumber: order.firstRowNumber + i,
        groupKey: order.groupKey,
        entityType: 'order_line',
        parsedData: lineData,
      });
    }

    // Stage tenders
    for (let i = 0; i < order.tenders.length; i++) {
      const tender = order.tenders[i]!;
      const tenderData: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(tender)) {
        const mapping = fieldTransforms.get(field);
        tenderData[field] = mapping ? applyTransform(value, mapping.transformRule) : value;
      }

      // Skip empty tenders
      if (!tenderData.tenderType && !tenderData.amount) continue;

      stagedRows.push({
        rowNumber: order.firstRowNumber + i,
        groupKey: order.groupKey,
        entityType: 'tender',
        parsedData: tenderData,
      });
    }
  }

  return { stagedRows, errors };
}
