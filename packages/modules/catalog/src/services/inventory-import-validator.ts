/**
 * Inventory Import Validator.
 *
 * Applies user-confirmed column mappings to each row and validates
 * the resulting data against OppsEra catalog rules.
 *
 * Pure function — no DB access. Receives existing data as inputs.
 */

import type { TargetField } from './inventory-import-analyzer';

// ── Types ────────────────────────────────────────────────────────────

export interface ParsedItem {
  rowNumber: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  itemType: string;
  defaultPrice: number;
  cost: number | null;
  department: string | null;
  subDepartment: string | null;
  category: string | null;
  taxCategoryName: string | null;
  isTrackable: boolean;
  priceIncludesTax: boolean;
  reorderPoint: number | null;
  parLevel: number | null;
  vendor: string | null;
  vendorSku: string | null;
}

export interface ValidationMessage {
  row?: number;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationStats {
  totalRows: number;
  validRows: number;
  errorRows: number;
  newDepartments: string[];
  newSubDepartments: string[];
  newCategories: string[];
  duplicateSkus: string[];
  duplicateBarcodes: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  parsedItems: ParsedItem[];
  stats: ValidationStats;
}

export interface ValidateImportInput {
  headers: string[];
  rows: string[][];
  mappings: Record<string, string | null>;
  existingSkus: Set<string>;
  existingBarcodes: Set<string>;
  existingCategories: Set<string>;
  existingTaxCategories: Set<string>;
  defaultItemType: string;
}

// ── Item Type Normalization ─────────────────────────────────────────

const ITEM_TYPE_NORMALIZER: Record<string, string> = {
  retail: 'retail',
  food: 'food',
  beverage: 'beverage',
  service: 'service',
  green_fee: 'green_fee',
  rental: 'rental',
  // Aliases
  'f&b': 'food',
  fnb: 'food',
  drink: 'beverage',
  drinks: 'beverage',
  beer: 'beverage',
  wine: 'beverage',
  liquor: 'beverage',
  spirits: 'beverage',
  merchandise: 'retail',
  merch: 'retail',
  goods: 'retail',
  product: 'retail',
  products: 'retail',
  'green fee': 'green_fee',
  greenfee: 'green_fee',
  services: 'service',
  labor: 'service',
  rentals: 'rental',
  equipment: 'rental',
};

const VALID_ITEM_TYPES = new Set(['retail', 'food', 'beverage', 'service', 'green_fee', 'rental']);

function normalizeItemType(raw: string): string | null {
  const normalized = ITEM_TYPE_NORMALIZER[raw.toLowerCase().trim()];
  if (normalized) return normalized;
  if (VALID_ITEM_TYPES.has(raw.toLowerCase().trim())) return raw.toLowerCase().trim();
  return null;
}

// ── Boolean Parser ──────────────────────────────────────────────────

function parseBoolean(raw: string): boolean {
  const lower = raw.toLowerCase().trim();
  return ['true', '1', 'yes', 'y'].includes(lower);
}

// ── Price Parser ────────────────────────────────────────────────────

function parsePrice(raw: string): number | null {
  if (!raw || raw.trim() === '') return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100) / 100; // round to 2dp
}

// ── Main Validator ──────────────────────────────────────────────────

export function validateImport(input: ValidateImportInput): ValidationResult {
  const {
    rows,
    mappings,
    existingSkus,
    existingBarcodes,
    existingCategories,
    existingTaxCategories,
    defaultItemType,
  } = input;

  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const parsedItems: ParsedItem[] = [];

  // Build column index → target field map
  const colToTarget = new Map<number, TargetField>();
  for (const [colIdxStr, targetField] of Object.entries(mappings)) {
    if (targetField) {
      colToTarget.set(parseInt(colIdxStr, 10), targetField as TargetField);
    }
  }

  // Check that 'name' is mapped (required)
  const hasNameMapping = [...colToTarget.values()].includes('name');
  if (!hasNameMapping) {
    errors.push({ message: 'Item Name must be mapped to a column', severity: 'error' });
    return {
      isValid: false,
      errors,
      warnings,
      parsedItems: [],
      stats: emptyStats(rows.length),
    };
  }

  // Check that 'defaultPrice' is mapped (required)
  const hasPriceMapping = [...colToTarget.values()].includes('defaultPrice');
  if (!hasPriceMapping) {
    errors.push({ message: 'Price must be mapped to a column', severity: 'error' });
    return {
      isValid: false,
      errors,
      warnings,
      parsedItems: [],
      stats: emptyStats(rows.length),
    };
  }

  // Track uniqueness within the file
  const fileSkus = new Map<string, number>(); // sku → first row
  const fileBarcodes = new Map<string, number>(); // barcode → first row

  // Track new hierarchy entries
  const newDepts = new Set<string>();
  const newSubDepts = new Set<string>();
  const newCats = new Set<string>();
  const dupSkus: string[] = [];
  const dupBarcodes: string[] = [];

  let errorRowCount = 0;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    const rowNum = rowIdx + 2; // 1-indexed, +1 for header

    // Extract values by mapping
    const getValue = (field: TargetField): string => {
      for (const [colIdx, target] of colToTarget.entries()) {
        if (target === field) return row[colIdx]?.trim() ?? '';
      }
      return '';
    };

    // ── Parse fields ──
    const rawName = getValue('name');
    const rawSku = getValue('sku');
    const rawBarcode = getValue('barcode');
    const rawDescription = getValue('description');
    const rawItemType = getValue('itemType');
    const rawPrice = getValue('defaultPrice');
    const rawCost = getValue('cost');
    const rawDepartment = getValue('department');
    const rawSubDepartment = getValue('subDepartment');
    const rawCategory = getValue('category');
    const rawTaxCategory = getValue('taxCategoryName');
    const rawIsTrackable = getValue('isTrackable');
    const rawPriceIncludesTax = getValue('priceIncludesTax');
    const rawReorderPoint = getValue('reorderPoint');
    const rawParLevel = getValue('parLevel');
    const rawVendor = getValue('vendor');
    const rawVendorSku = getValue('vendorSku');

    let rowHasError = false;

    // ── Validate name (required, 1-200 chars) ──
    if (!rawName) {
      errors.push({ row: rowNum, field: 'name', message: 'Item name is required', severity: 'error' });
      rowHasError = true;
    } else if (rawName.length > 200) {
      errors.push({ row: rowNum, field: 'name', message: `Item name exceeds 200 characters (${rawName.length})`, severity: 'error' });
      rowHasError = true;
    }

    // ── Validate price (required, positive, 2dp) ──
    const price = parsePrice(rawPrice);
    if (price === null || price <= 0) {
      errors.push({ row: rowNum, field: 'defaultPrice', message: `Invalid or missing price: "${rawPrice}"`, severity: 'error' });
      rowHasError = true;
    }

    // ── Validate cost (optional, non-negative) ──
    let cost: number | null = null;
    if (rawCost) {
      cost = parsePrice(rawCost);
      if (cost === null || cost < 0) {
        errors.push({ row: rowNum, field: 'cost', message: `Invalid cost value: "${rawCost}"`, severity: 'error' });
        rowHasError = true;
      } else if (price !== null && cost > price) {
        warnings.push({ row: rowNum, field: 'cost', message: `Cost ($${cost.toFixed(2)}) exceeds price ($${price!.toFixed(2)})`, severity: 'warning' });
      }
    }

    // ── Normalize item type ──
    let itemType = defaultItemType;
    if (rawItemType) {
      const normalized = normalizeItemType(rawItemType);
      if (normalized) {
        itemType = normalized;
      } else {
        warnings.push({ row: rowNum, field: 'itemType', message: `Unknown item type "${rawItemType}" — using default "${defaultItemType}"`, severity: 'warning' });
      }
    }

    // ── Validate SKU uniqueness ──
    const sku = rawSku ? rawSku.trim().toUpperCase() : null;
    if (sku) {
      if (sku.length > 50) {
        errors.push({ row: rowNum, field: 'sku', message: `SKU exceeds 50 characters`, severity: 'error' });
        rowHasError = true;
      } else if (existingSkus.has(sku)) {
        dupSkus.push(sku);
        warnings.push({ row: rowNum, field: 'sku', message: `SKU "${sku}" already exists in catalog`, severity: 'warning' });
      } else if (fileSkus.has(sku)) {
        errors.push({ row: rowNum, field: 'sku', message: `Duplicate SKU "${sku}" — first seen on row ${fileSkus.get(sku)}`, severity: 'error' });
        rowHasError = true;
      } else {
        fileSkus.set(sku, rowNum);
      }
    }

    // ── Validate barcode uniqueness ──
    const barcode = rawBarcode ? rawBarcode.trim() : null;
    if (barcode) {
      if (barcode.length > 100) {
        errors.push({ row: rowNum, field: 'barcode', message: `Barcode exceeds 100 characters`, severity: 'error' });
        rowHasError = true;
      } else if (existingBarcodes.has(barcode)) {
        dupBarcodes.push(barcode);
        warnings.push({ row: rowNum, field: 'barcode', message: `Barcode "${barcode}" already exists in catalog`, severity: 'warning' });
      } else if (fileBarcodes.has(barcode)) {
        errors.push({ row: rowNum, field: 'barcode', message: `Duplicate barcode "${barcode}" — first seen on row ${fileBarcodes.get(barcode)}`, severity: 'error' });
        rowHasError = true;
      } else {
        fileBarcodes.set(barcode, rowNum);
      }
    }

    // ── Validate tax category reference ──
    const taxCategoryName = rawTaxCategory || null;
    if (taxCategoryName && !existingTaxCategories.has(taxCategoryName.toLowerCase())) {
      warnings.push({ row: rowNum, field: 'taxCategoryName', message: `Tax category "${taxCategoryName}" not found — will be skipped`, severity: 'warning' });
    }

    // ── Track new hierarchy entries ──
    const department = rawDepartment || null;
    const subDepartment = rawSubDepartment || null;
    const category = rawCategory || null;

    if (department && !existingCategories.has(department.toLowerCase())) {
      newDepts.add(department);
    }
    if (subDepartment && !existingCategories.has(subDepartment.toLowerCase())) {
      newSubDepts.add(subDepartment);
    }
    if (category && !existingCategories.has(category.toLowerCase())) {
      newCats.add(category);
    }

    // ── Parse numeric fields ──
    const reorderPoint = rawReorderPoint ? parseInt(rawReorderPoint, 10) : null;
    if (rawReorderPoint && (isNaN(reorderPoint!) || reorderPoint! < 0)) {
      warnings.push({ row: rowNum, field: 'reorderPoint', message: `Invalid reorder point "${rawReorderPoint}" — will be ignored`, severity: 'warning' });
    }

    const parLevel = rawParLevel ? parseInt(rawParLevel, 10) : null;
    if (rawParLevel && (isNaN(parLevel!) || parLevel! < 0)) {
      warnings.push({ row: rowNum, field: 'parLevel', message: `Invalid par level "${rawParLevel}" — will be ignored`, severity: 'warning' });
    }

    if (rowHasError) {
      errorRowCount++;
      continue;
    }

    parsedItems.push({
      rowNumber: rowNum,
      name: rawName,
      sku,
      barcode,
      description: rawDescription || null,
      itemType,
      defaultPrice: price!,
      cost,
      department,
      subDepartment,
      category,
      taxCategoryName,
      isTrackable: rawIsTrackable ? parseBoolean(rawIsTrackable) : false,
      priceIncludesTax: rawPriceIncludesTax ? parseBoolean(rawPriceIncludesTax) : false,
      reorderPoint: reorderPoint != null && !isNaN(reorderPoint) && reorderPoint >= 0 ? reorderPoint : null,
      parLevel: parLevel != null && !isNaN(parLevel) && parLevel >= 0 ? parLevel : null,
      vendor: rawVendor || null,
      vendorSku: rawVendorSku || null,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    parsedItems,
    stats: {
      totalRows: rows.length,
      validRows: parsedItems.length,
      errorRows: errorRowCount,
      newDepartments: [...newDepts],
      newSubDepartments: [...newSubDepts],
      newCategories: [...newCats],
      duplicateSkus: [...new Set(dupSkus)],
      duplicateBarcodes: [...new Set(dupBarcodes)],
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function emptyStats(totalRows: number): ValidationStats {
  return {
    totalRows,
    validRows: 0,
    errorRows: 0,
    newDepartments: [],
    newSubDepartments: [],
    newCategories: [],
    duplicateSkus: [],
    duplicateBarcodes: [],
  };
}
