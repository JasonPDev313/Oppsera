/**
 * Mapping engine: auto-map CSV columns to OppsEra target fields.
 *
 * Uses a column alias registry (same pattern as accounting CSV import)
 * with confidence scoring based on header match + data type consistency.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface ColumnMapping {
  sourceColumn: string;
  sourceIndex: number;
  targetEntity: 'order' | 'line' | 'tender' | 'tax' | 'ignore';
  targetField: string;
  confidence: number;
  confidenceReason: string;
  dataType: string;
  transformRule: 'none' | 'cents_to_dollars' | 'dollars_to_cents' | 'date_parse' | 'lookup';
  sampleValues: string[];
}

// ── Column Alias Registry ─────────────────────────────────────────────

interface FieldDefinition {
  aliases: string[];
  entity: 'order' | 'line' | 'tender' | 'tax';
  field: string;
  expectedType?: 'string' | 'number' | 'date' | 'currency' | 'boolean';
}

const FIELD_REGISTRY: Record<string, FieldDefinition> = {
  // ── Order Header ────────────────────────────────────────────
  transactionId: {
    aliases: [
      'transaction_id', 'trans_id', 'receipt_no', 'receipt_number', 'check_no',
      'check_number', 'order_id', 'order_no', 'order_number', 'invoice_no',
      'invoice_number', 'ticket_no', 'ticket_number', 'sale_id', 'sale_no',
      'trans_no', 'transaction_number', 'reference_no', 'ref_no', 'batch_id',
    ],
    entity: 'order',
    field: 'groupingKey',
    expectedType: 'string',
  },
  businessDate: {
    aliases: [
      'business_date', 'date', 'order_date', 'trans_date', 'sale_date',
      'close_date', 'posting_date', 'transaction_date',
    ],
    entity: 'order',
    field: 'businessDate',
    expectedType: 'date',
  },
  orderTotal: {
    aliases: [
      'total', 'grand_total', 'order_total', 'net_total', 'sale_total',
      'amount_due', 'check_total', 'receipt_total', 'invoice_total',
    ],
    entity: 'order',
    field: 'total',
    expectedType: 'currency',
  },
  subtotal: {
    aliases: [
      'subtotal', 'sub_total', 'net_amount', 'item_total', 'pre_tax_total',
    ],
    entity: 'order',
    field: 'subtotal',
    expectedType: 'currency',
  },
  discountAmount: {
    aliases: [
      'discount', 'discount_amount', 'discount_total', 'promo_discount',
      'total_discount',
    ],
    entity: 'order',
    field: 'discountTotal',
    expectedType: 'currency',
  },
  orderNotes: {
    aliases: ['notes', 'order_notes', 'comments', 'memo'],
    entity: 'order',
    field: 'notes',
    expectedType: 'string',
  },

  // ── Line Items ──────────────────────────────────────────────
  itemName: {
    aliases: [
      'item', 'item_name', 'product', 'product_name', 'description',
      'menu_item', 'item_description', 'item_desc', 'product_description',
      'article', 'article_name',
    ],
    entity: 'line',
    field: 'catalogItemName',
    expectedType: 'string',
  },
  itemSku: {
    aliases: [
      'sku', 'item_sku', 'product_code', 'upc', 'barcode', 'plu',
      'item_code', 'item_number', 'item_no', 'article_number',
    ],
    entity: 'line',
    field: 'catalogItemSku',
    expectedType: 'string',
  },
  quantity: {
    aliases: [
      'qty', 'quantity', 'count', 'units', 'item_qty', 'sold_qty',
    ],
    entity: 'line',
    field: 'qty',
    expectedType: 'number',
  },
  unitPrice: {
    aliases: [
      'price', 'unit_price', 'item_price', 'each', 'unit_cost',
      'sell_price', 'rate',
    ],
    entity: 'line',
    field: 'unitPrice',
    expectedType: 'currency',
  },
  lineTotal: {
    aliases: [
      'line_total', 'ext_price', 'extended_price', 'amount', 'line_amount',
      'ext_amount', 'item_total', 'extended_amount',
    ],
    entity: 'line',
    field: 'lineTotal',
    expectedType: 'currency',
  },

  // ── Tenders ─────────────────────────────────────────────────
  tenderType: {
    aliases: [
      'payment_type', 'tender_type', 'pay_method', 'payment_method',
      'tender', 'payment', 'pay_type', 'method_of_payment', 'mop',
    ],
    entity: 'tender',
    field: 'tenderType',
    expectedType: 'string',
  },
  tenderAmount: {
    aliases: [
      'payment_amount', 'tender_amount', 'paid', 'amount_paid',
      'pay_amount', 'tendered', 'cash_amount', 'card_amount',
    ],
    entity: 'tender',
    field: 'amount',
    expectedType: 'currency',
  },
  tipAmount: {
    aliases: [
      'tip', 'tip_amount', 'gratuity', 'tip_total',
    ],
    entity: 'tender',
    field: 'tipAmount',
    expectedType: 'currency',
  },
  changeGiven: {
    aliases: [
      'change', 'change_given', 'change_due', 'change_amount',
    ],
    entity: 'tender',
    field: 'changeGiven',
    expectedType: 'currency',
  },

  // ── Tax ─────────────────────────────────────────────────────
  taxAmount: {
    aliases: [
      'tax', 'tax_amount', 'tax_total', 'sales_tax', 'total_tax',
      'tax_1', 'state_tax', 'vat', 'gst', 'hst',
    ],
    entity: 'tax',
    field: 'taxAmount',
    expectedType: 'currency',
  },
  taxRate: {
    aliases: [
      'tax_rate', 'tax_pct', 'tax_percent', 'tax_percentage',
    ],
    entity: 'tax',
    field: 'taxRate',
    expectedType: 'number',
  },

  // ── Context (mapped to order) ───────────────────────────────
  locationName: {
    aliases: [
      'location', 'store', 'store_name', 'site', 'venue', 'restaurant',
      'branch', 'outlet',
    ],
    entity: 'order',
    field: 'locationName',
    expectedType: 'string',
  },
  employeeName: {
    aliases: [
      'employee', 'server', 'cashier', 'associate', 'staff', 'clerk',
      'employee_name', 'server_name', 'operator',
    ],
    entity: 'order',
    field: 'employeeName',
    expectedType: 'string',
  },
  terminalId: {
    aliases: [
      'terminal', 'register', 'terminal_id', 'register_id', 'station',
      'pos_id', 'workstation', 'device',
    ],
    entity: 'order',
    field: 'terminalName',
    expectedType: 'string',
  },
  customerName: {
    aliases: [
      'customer', 'customer_name', 'guest', 'member', 'member_name',
      'guest_name', 'buyer', 'patron',
    ],
    entity: 'order',
    field: 'customerName',
    expectedType: 'string',
  },
  tableNumber: {
    aliases: [
      'table', 'table_no', 'table_number', 'table_num', 'seat',
    ],
    entity: 'order',
    field: 'tableNumber',
    expectedType: 'string',
  },
};

// ── Matching Logic ────────────────────────────────────────────────────

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9_# ]/g, '').trim();
}

function findBestMatch(
  header: string,
  dataType: string,
): { fieldKey: string; definition: FieldDefinition; confidence: number; reason: string } | null {
  const normalized = normalizeHeader(header);
  let bestMatch: { fieldKey: string; definition: FieldDefinition; confidence: number; reason: string } | null = null;

  for (const [fieldKey, def] of Object.entries(FIELD_REGISTRY)) {
    // Exact alias match
    if (def.aliases.includes(normalized)) {
      let confidence = 0.85;
      let reason = `Header "${header}" matches alias for ${fieldKey}`;

      // Bonus for data type consistency
      if (def.expectedType && def.expectedType === dataType) {
        confidence += 0.05;
        reason += '; data type matches';
      }

      // Exact field key match gets highest confidence
      if (normalized === fieldKey.toLowerCase() || normalized === def.field.toLowerCase()) {
        confidence = 0.95;
        reason = `Header "${header}" is exact match for ${fieldKey}`;
      }

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { fieldKey, definition: def, confidence, reason };
      }
    }
  }

  return bestMatch;
}

// ── Transform Rule Detection ──────────────────────────────────────────

function detectTransformRule(
  targetField: string,
  dataType: string,
): 'none' | 'cents_to_dollars' | 'dollars_to_cents' | 'date_parse' | 'lookup' {
  if (dataType === 'date') return 'date_parse';

  // Currency fields going into cents-based order layer
  const centFields = ['total', 'subtotal', 'discountTotal', 'unitPrice', 'lineTotal', 'amount', 'tipAmount', 'changeGiven', 'taxAmount'];
  if (centFields.includes(targetField) && dataType === 'currency') {
    return 'dollars_to_cents';
  }

  if (targetField === 'tenderType' || targetField === 'catalogItemName') {
    return 'lookup';
  }

  return 'none';
}

// ── Main Mapping Function ─────────────────────────────────────────────

export function autoMapColumns(columns: Array<{ name: string; dataType: string; sampleValues: string[] }>): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedFields = new Set<string>();

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const match = findBestMatch(col.name, col.dataType);

    if (match && !usedFields.has(match.fieldKey)) {
      usedFields.add(match.fieldKey);
      mappings.push({
        sourceColumn: col.name,
        sourceIndex: i,
        targetEntity: match.definition.entity,
        targetField: match.definition.field,
        confidence: Math.round(match.confidence * 100) / 100,
        confidenceReason: match.reason,
        dataType: col.dataType,
        transformRule: detectTransformRule(match.definition.field, col.dataType),
        sampleValues: col.sampleValues,
      });
    } else {
      // No match — suggest ignore
      mappings.push({
        sourceColumn: col.name,
        sourceIndex: i,
        targetEntity: 'ignore',
        targetField: '',
        confidence: 0,
        confidenceReason: match
          ? `Duplicate mapping candidate for ${match.fieldKey} (already mapped)`
          : `No alias match found for "${col.name}"`,
        dataType: col.dataType,
        transformRule: 'none',
        sampleValues: col.sampleValues,
      });
    }
  }

  return mappings;
}

/**
 * Returns all supported target fields for a given entity type.
 */
export function getTargetFieldsForEntity(entity: string): string[] {
  const fields: string[] = [];
  for (const def of Object.values(FIELD_REGISTRY)) {
    if (def.entity === entity && !fields.includes(def.field)) {
      fields.push(def.field);
    }
  }
  return fields;
}
