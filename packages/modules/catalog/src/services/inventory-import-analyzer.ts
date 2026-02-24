/**
 * Intelligent Column Mapping Engine for inventory import.
 *
 * Analyzes CSV headers + sample data to produce confidence-scored
 * mapping suggestions from source columns to OppsEra catalog fields.
 *
 * Two-phase scoring:
 *   1. Alias matching — exact/fuzzy match on header names
 *   2. Data pattern detection — statistical analysis of column values
 *
 * Confidence: 0-99 integer. Greedy assignment (no duplicate targets).
 */

// ── Types ────────────────────────────────────────────────────────────

export type TargetField =
  | 'name'
  | 'sku'
  | 'barcode'
  | 'description'
  | 'itemType'
  | 'defaultPrice'
  | 'cost'
  | 'department'
  | 'subDepartment'
  | 'category'
  | 'taxCategoryName'
  | 'isTrackable'
  | 'priceIncludesTax'
  | 'reorderPoint'
  | 'parLevel'
  | 'vendor'
  | 'vendorSku';

export interface ColumnMappingCandidate {
  targetField: TargetField;
  confidence: number;
  source: 'alias' | 'fuzzy_alias' | 'pattern' | 'combined';
  explanation: string;
}

export interface ColumnMapping {
  columnIndex: number;
  sourceHeader: string;
  targetField: TargetField | null;
  confidence: number;
  explanation: string;
  alternatives: ColumnMappingCandidate[];
  sampleValues: string[];
}

export interface AnalysisResult {
  columns: ColumnMapping[];
  sampleData: string[][];
  totalRows: number;
  delimiter: string;
  warnings: string[];
}

// ── Target Field Display Metadata ────────────────────────────────────

export const TARGET_FIELD_LABELS: Record<TargetField, string> = {
  name: 'Item Name',
  sku: 'SKU',
  barcode: 'Barcode / UPC',
  description: 'Description',
  itemType: 'Item Type',
  defaultPrice: 'Price',
  cost: 'Cost',
  department: 'Department',
  subDepartment: 'Sub-Department',
  category: 'Category',
  taxCategoryName: 'Tax Category',
  isTrackable: 'Track Inventory',
  priceIncludesTax: 'Price Includes Tax',
  reorderPoint: 'Reorder Point',
  parLevel: 'Par Level',
  vendor: 'Vendor',
  vendorSku: 'Vendor SKU',
};

export const TARGET_FIELD_GROUPS: Record<string, TargetField[]> = {
  'Required': ['name', 'defaultPrice'],
  'Item Details': ['sku', 'barcode', 'description', 'itemType'],
  'Pricing': ['cost', 'priceIncludesTax'],
  'Category Hierarchy': ['department', 'subDepartment', 'category'],
  'Tax': ['taxCategoryName'],
  'Inventory': ['isTrackable', 'reorderPoint', 'parLevel'],
  'Vendor': ['vendor', 'vendorSku'],
};

// ── Column Aliases ───────────────────────────────────────────────────

const COLUMN_ALIASES: Record<TargetField, string[]> = {
  name: [
    'name', 'item_name', 'itemname', 'product_name', 'productname', 'product',
    'item', 'title', 'item name', 'product name',
  ],
  sku: [
    'sku', 'item_sku', 'product_sku', 'item_code', 'itemcode', 'product_code',
    'productcode', 'code', 'item_number', 'item_no', 'stock_code', 'item number',
    'item code', 'product code', 'plu',
  ],
  barcode: [
    'barcode', 'upc', 'upc_code', 'upc-a', 'ean', 'ean13', 'ean_13', 'gtin',
    'bar_code', 'scan_code', 'product_barcode', 'upc code', 'bar code',
  ],
  description: [
    'description', 'desc', 'item_description', 'product_description',
    'long_description', 'notes', 'details', 'item description',
  ],
  itemType: [
    'item_type', 'itemtype', 'type', 'product_type', 'category_type',
    'class', 'item type', 'product type',
  ],
  defaultPrice: [
    'price', 'default_price', 'defaultprice', 'unit_price', 'unitprice',
    'sell_price', 'sellprice', 'retail_price', 'retail', 'selling_price',
    'sales_price', 'msrp', 'retail price', 'sell price', 'unit price',
    'selling price', 'sales price',
  ],
  cost: [
    'cost', 'unit_cost', 'unitcost', 'cogs', 'purchase_price', 'purchaseprice',
    'buy_price', 'wholesale', 'wholesale_price', 'vendor_cost', 'supply_cost',
    'landed_cost', 'unit cost', 'purchase price', 'buy price', 'wholesale price',
    'vendor cost',
  ],
  department: [
    'department', 'dept', 'department_name', 'dept_name', 'department name',
    'dept name',
  ],
  subDepartment: [
    'sub_department', 'subdepartment', 'sub_dept', 'subdept',
    'sub_department_name', 'sub department', 'sub dept',
  ],
  category: [
    'category', 'category_name', 'cat', 'group', 'product_group',
    'classification', 'category name', 'product group',
  ],
  taxCategoryName: [
    'tax_category', 'taxcategory', 'tax_class', 'tax_group', 'tax_rate',
    'tax', 'tax_name', 'tax category', 'tax class', 'tax group',
  ],
  isTrackable: [
    'trackable', 'is_trackable', 'istrackable', 'track_inventory',
    'tracked', 'inventory_tracked', 'track inventory',
  ],
  priceIncludesTax: [
    'price_includes_tax', 'priceincludestax', 'tax_inclusive',
    'tax_included', 'includes_tax', 'inc_tax', 'price includes tax',
  ],
  reorderPoint: [
    'reorder_point', 'reorderpoint', 'reorder', 'min_stock',
    'minimum_stock', 'low_stock_threshold', 'min_qty', 'reorder point',
    'min stock', 'minimum stock',
  ],
  parLevel: [
    'par_level', 'parlevel', 'par', 'max_stock', 'maximum_stock',
    'ideal_stock', 'par level', 'max stock',
  ],
  vendor: [
    'vendor', 'vendor_name', 'supplier', 'supplier_name', 'vendor name',
    'supplier name',
  ],
  vendorSku: [
    'vendor_sku', 'vendorsku', 'vendor_code', 'supplier_sku',
    'supplier_code', 'vendor_item_number', 'vendor sku', 'vendor code',
    'supplier sku',
  ],
};

// ── Item Type Keywords ───────────────────────────────────────────────

const ITEM_TYPE_KEYWORDS = new Set([
  'retail', 'food', 'beverage', 'service', 'green_fee', 'rental',
  'f&b', 'fnb', 'drink', 'drinks', 'beer', 'wine', 'liquor',
  'spirits', 'merchandise', 'merch', 'goods', 'product', 'products',
  'green fee', 'greenfee', 'services', 'labor', 'rentals', 'equipment',
]);

// ── Pattern Detectors ────────────────────────────────────────────────

function getNonEmptyValues(values: string[]): string[] {
  return values.filter((v) => v !== '' && v != null);
}

function detectCurrencyPattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmptyValues(values);
  if (nonEmpty.length === 0) return null;

  // Match: optional $, optional negative, digits with optional 2dp
  const currencyRegex = /^\$?-?\d{1,7}(?:\.\d{1,2})?$/;
  const matches = nonEmpty.filter((v) => currencyRegex.test(v.replace(/,/g, '')));
  const ratio = matches.length / nonEmpty.length;

  if (ratio < 0.5) return null;

  // Check if values look like reasonable prices (>0)
  const numericValues = matches
    .map((v) => parseFloat(v.replace(/[$,]/g, '')))
    .filter((n) => !isNaN(n));

  if (numericValues.length === 0) return null;

  const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
  const hasDecimal = matches.some((v) => v.includes('.'));
  const hasDollarSign = matches.some((v) => v.includes('$'));

  let confidence = Math.round(ratio * 80);
  if (hasDollarSign) confidence += 10;
  if (hasDecimal) confidence += 5;

  return {
    confidence: Math.min(85, confidence),
    explanation: `${Math.round(ratio * 100)}% of values are currency-like (avg ${avg < 0.01 ? 'N/A' : `$${avg.toFixed(2)}`})`,
  };
}

function detectBarcodePattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmptyValues(values);
  if (nonEmpty.length === 0) return null;

  // UPC-A (12 digits), EAN-13 (13 digits), UPC-E (8 digits), EAN-8 (8 digits)
  const barcodeRegex = /^\d{8,14}$/;
  const matches = nonEmpty.filter((v) => barcodeRegex.test(v.trim()));
  const ratio = matches.length / nonEmpty.length;

  if (ratio < 0.3) return null;

  return {
    confidence: Math.min(80, Math.round(ratio * 85)),
    explanation: `${Math.round(ratio * 100)}% of values match barcode format (8-14 digits)`,
  };
}

function detectSkuPattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmptyValues(values);
  if (nonEmpty.length === 0) return null;

  // SKUs: 2-20 chars, alphanumeric with dashes/dots/underscores, typically mixed
  const skuRegex = /^[A-Za-z0-9][A-Za-z0-9\-._]{0,19}$/;
  const matches = nonEmpty.filter((v) => skuRegex.test(v.trim()));
  const ratio = matches.length / nonEmpty.length;

  if (ratio < 0.5) return null;

  // Boost if values contain mixed letters+digits (strong SKU indicator)
  const hasMixed = nonEmpty.some((v) => /[A-Za-z]/.test(v) && /\d/.test(v));
  const hasUppercase = nonEmpty.some((v) => /[A-Z]/.test(v));

  let confidence = Math.round(ratio * 65);
  if (hasMixed) confidence += 10;
  if (hasUppercase) confidence += 5;

  return {
    confidence: Math.min(75, confidence),
    explanation: `${Math.round(ratio * 100)}% of values match SKU format${hasMixed ? ' (mixed letters+digits)' : ''}`,
  };
}

function detectBooleanPattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmptyValues(values);
  if (nonEmpty.length === 0) return null;

  const boolValues = new Set(['true', 'false', 'yes', 'no', '0', '1', 'y', 'n']);
  const matches = nonEmpty.filter((v) => boolValues.has(v.toLowerCase()));
  const ratio = matches.length / nonEmpty.length;

  if (ratio < 0.7) return null;

  return {
    confidence: Math.min(70, Math.round(ratio * 75)),
    explanation: `${Math.round(ratio * 100)}% of values are boolean (yes/no, true/false)`,
  };
}

function detectItemTypePattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmptyValues(values);
  if (nonEmpty.length === 0) return null;

  const matches = nonEmpty.filter((v) => ITEM_TYPE_KEYWORDS.has(v.toLowerCase().trim()));
  const ratio = matches.length / nonEmpty.length;

  if (ratio < 0.3) return null;

  return {
    confidence: Math.min(80, Math.round(ratio * 85)),
    explanation: `${Math.round(ratio * 100)}% of values match known item types`,
  };
}

function detectNumericPattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmptyValues(values);
  if (nonEmpty.length === 0) return null;

  // Pure numeric (integer or decimal, no $ sign)
  const numericRegex = /^-?\d+(?:\.\d+)?$/;
  const matches = nonEmpty.filter((v) => numericRegex.test(v.replace(/,/g, '').trim()));
  const ratio = matches.length / nonEmpty.length;

  if (ratio < 0.6) return null;

  // If values are all integers and small-ish, could be reorder point / par level
  const numericValues = matches.map((v) => parseFloat(v.replace(/,/g, '')));
  const allIntegers = numericValues.every((n) => Number.isInteger(n));
  const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;

  return {
    confidence: Math.min(50, Math.round(ratio * 55)),
    explanation: `${Math.round(ratio * 100)}% numeric values (avg ${avg.toFixed(1)}${allIntegers ? ', all integers' : ''})`,
  };
}

function detectTextPattern(values: string[]): { avgLength: number; maxLength: number } {
  const nonEmpty = getNonEmptyValues(values);
  if (nonEmpty.length === 0) return { avgLength: 0, maxLength: 0 };

  const lengths = nonEmpty.map((v) => v.length);
  return {
    avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
    maxLength: Math.max(...lengths),
  };
}

// ── Fuzzy String Matching ────────────────────────────────────────────

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9_# ]/g, '').trim();
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/[\s_-]+/).filter(Boolean));
  const tokensB = new Set(b.split(/[\s_-]+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  return (overlap * 2) / (tokensA.size + tokensB.size);
}

// ── Main Analyzer ────────────────────────────────────────────────────

export function analyzeColumns(
  headers: string[],
  sampleRows: string[][],
): ColumnMapping[] {
  const usedTargets = new Set<TargetField>();

  // Build raw candidates per column
  const allColumnCandidates: Array<{
    columnIndex: number;
    sourceHeader: string;
    sampleValues: string[];
    candidates: ColumnMappingCandidate[];
  }> = [];

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx]!;
    const normalizedHeader = normalizeHeader(header);
    const columnValues = sampleRows.map((row) => row[colIdx] ?? '');
    const sampleValues = getNonEmptyValues(columnValues).slice(0, 3);
    const candidates: ColumnMappingCandidate[] = [];

    // Phase 1: Alias matching
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [TargetField, string[]][]) {
      if (aliases.includes(normalizedHeader)) {
        candidates.push({
          targetField: field,
          confidence: 95,
          source: 'alias',
          explanation: `Header "${header}" matches known column name for ${TARGET_FIELD_LABELS[field]}`,
        });
      } else {
        // Fuzzy match: check token overlap
        let bestFuzzy = 0;
        for (const alias of aliases) {
          const score = tokenOverlap(normalizedHeader, alias);
          if (score > bestFuzzy) bestFuzzy = score;
        }
        if (bestFuzzy >= 0.6) {
          candidates.push({
            targetField: field,
            confidence: Math.round(60 + bestFuzzy * 15),
            source: 'fuzzy_alias',
            explanation: `Header "${header}" is similar to known names for ${TARGET_FIELD_LABELS[field]}`,
          });
        }
      }
    }

    // Phase 2: Data pattern detection
    const currency = detectCurrencyPattern(columnValues);
    if (currency) {
      // Decide price vs cost based on header hints and existing candidates
      const headerLower = normalizedHeader;
      const isCostHint = headerLower.includes('cost') || headerLower.includes('wholesale') || headerLower.includes('purchase') || headerLower.includes('buy') || headerLower.includes('cogs');
      const isPriceHint = headerLower.includes('price') || headerLower.includes('retail') || headerLower.includes('sell') || headerLower.includes('msrp');

      if (isCostHint) {
        candidates.push({ targetField: 'cost', confidence: currency.confidence, source: 'pattern', explanation: currency.explanation });
      } else if (isPriceHint) {
        candidates.push({ targetField: 'defaultPrice', confidence: currency.confidence, source: 'pattern', explanation: currency.explanation });
      } else {
        // Ambiguous: offer both, penalize
        candidates.push({ targetField: 'defaultPrice', confidence: currency.confidence - 10, source: 'pattern', explanation: `${currency.explanation} — could be Price or Cost` });
        candidates.push({ targetField: 'cost', confidence: currency.confidence - 15, source: 'pattern', explanation: `${currency.explanation} — could be Price or Cost` });
      }
    }

    const barcode = detectBarcodePattern(columnValues);
    if (barcode) {
      candidates.push({ targetField: 'barcode', confidence: barcode.confidence, source: 'pattern', explanation: barcode.explanation });
    }

    const skuPat = detectSkuPattern(columnValues);
    if (skuPat) {
      candidates.push({ targetField: 'sku', confidence: skuPat.confidence, source: 'pattern', explanation: skuPat.explanation });
    }

    const boolPat = detectBooleanPattern(columnValues);
    if (boolPat) {
      // Could be isTrackable or priceIncludesTax
      const headerLower = normalizedHeader;
      if (headerLower.includes('tax') || headerLower.includes('incl')) {
        candidates.push({ targetField: 'priceIncludesTax', confidence: boolPat.confidence, source: 'pattern', explanation: boolPat.explanation });
      } else {
        candidates.push({ targetField: 'isTrackable', confidence: boolPat.confidence - 10, source: 'pattern', explanation: boolPat.explanation });
      }
    }

    const itemTypePat = detectItemTypePattern(columnValues);
    if (itemTypePat) {
      candidates.push({ targetField: 'itemType', confidence: itemTypePat.confidence, source: 'pattern', explanation: itemTypePat.explanation });
    }

    const numericPat = detectNumericPattern(columnValues);
    if (numericPat && !currency && !barcode) {
      candidates.push({ targetField: 'reorderPoint', confidence: numericPat.confidence - 10, source: 'pattern', explanation: numericPat.explanation });
    }

    // Phase 3: Combine — boost when alias + pattern agree
    const mergedMap = new Map<TargetField, ColumnMappingCandidate>();
    for (const c of candidates) {
      const existing = mergedMap.get(c.targetField);
      if (!existing) {
        mergedMap.set(c.targetField, { ...c });
      } else {
        // If alias + pattern agree, boost
        const hasAlias = existing.source === 'alias' || existing.source === 'fuzzy_alias' || c.source === 'alias' || c.source === 'fuzzy_alias';
        const hasPattern = existing.source === 'pattern' || c.source === 'pattern';
        const bestConfidence = Math.max(existing.confidence, c.confidence);

        if (hasAlias && hasPattern) {
          mergedMap.set(c.targetField, {
            targetField: c.targetField,
            confidence: Math.min(99, bestConfidence + 10),
            source: 'combined',
            explanation: `${existing.explanation}; confirmed by data patterns`,
          });
        } else if (c.confidence > existing.confidence) {
          mergedMap.set(c.targetField, { ...c });
        }
      }
    }

    // Text heuristics for name/description if no other match found
    if (mergedMap.size === 0) {
      const textInfo = detectTextPattern(columnValues);
      if (textInfo.avgLength > 50) {
        mergedMap.set('description', {
          targetField: 'description',
          confidence: 40,
          source: 'pattern',
          explanation: `Long text column (avg ${Math.round(textInfo.avgLength)} chars) — likely a description`,
        });
      } else if (textInfo.avgLength > 3 && textInfo.avgLength <= 50) {
        // Could be name, department, category, vendor — low confidence
        mergedMap.set('name', {
          targetField: 'name',
          confidence: 25,
          source: 'pattern',
          explanation: `Short text column (avg ${Math.round(textInfo.avgLength)} chars) — could be an item name`,
        });
      }
    }

    // Penalize sparse columns
    const nonEmptyCount = getNonEmptyValues(columnValues).length;
    const fillRate = nonEmptyCount / Math.max(columnValues.length, 1);
    if (fillRate < 0.2) {
      for (const c of mergedMap.values()) {
        c.confidence = Math.max(0, c.confidence - 15);
        c.explanation += ' (sparse data — low fill rate)';
      }
    }

    const sortedCandidates = [...mergedMap.values()].sort((a, b) => b.confidence - a.confidence);

    allColumnCandidates.push({
      columnIndex: colIdx,
      sourceHeader: header,
      sampleValues,
      candidates: sortedCandidates,
    });
  }

  // Phase 4: Greedy assignment — highest confidence first globally
  type FlatCandidate = {
    columnIndex: number;
    sourceHeader: string;
    sampleValues: string[];
    candidate: ColumnMappingCandidate;
    allCandidates: ColumnMappingCandidate[];
  };

  const flat: FlatCandidate[] = [];
  for (const col of allColumnCandidates) {
    for (const c of col.candidates) {
      flat.push({
        columnIndex: col.columnIndex,
        sourceHeader: col.sourceHeader,
        sampleValues: col.sampleValues,
        candidate: c,
        allCandidates: col.candidates,
      });
    }
  }

  flat.sort((a, b) => b.candidate.confidence - a.candidate.confidence);

  const assignedColumns = new Set<number>();
  const mappings: ColumnMapping[] = [];

  for (const entry of flat) {
    if (assignedColumns.has(entry.columnIndex)) continue;
    if (usedTargets.has(entry.candidate.targetField)) continue;
    if (entry.candidate.confidence < 30) continue;

    usedTargets.add(entry.candidate.targetField);
    assignedColumns.add(entry.columnIndex);

    mappings.push({
      columnIndex: entry.columnIndex,
      sourceHeader: entry.sourceHeader,
      targetField: entry.candidate.targetField,
      confidence: entry.candidate.confidence,
      explanation: entry.candidate.explanation,
      alternatives: entry.allCandidates
        .filter((c) => c.targetField !== entry.candidate.targetField)
        .slice(0, 3),
      sampleValues: entry.sampleValues,
    });
  }

  // Add unmapped columns
  for (const col of allColumnCandidates) {
    if (!assignedColumns.has(col.columnIndex)) {
      mappings.push({
        columnIndex: col.columnIndex,
        sourceHeader: col.sourceHeader,
        targetField: null,
        confidence: 0,
        explanation: 'Could not determine column purpose',
        alternatives: col.candidates.slice(0, 3),
        sampleValues: col.sampleValues,
      });
    }
  }

  // Sort back by column index for display
  mappings.sort((a, b) => a.columnIndex - b.columnIndex);

  return mappings;
}
