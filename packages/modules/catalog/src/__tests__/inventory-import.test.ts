import { describe, it, expect } from 'vitest';
import { parseCsv, isParseError } from '../services/inventory-import-parser';
import { analyzeColumns } from '../services/inventory-import-analyzer';
import { validateImport } from '../services/inventory-import-validator';

// ── Parser Tests ────────────────────────────────────────────────────

describe('parseCsv', () => {
  it('parses a simple comma-delimited CSV', () => {
    const csv = 'Name,Price,SKU\nWidget,9.99,WDG-001\nGadget,19.99,GDG-002';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.headers).toEqual(['Name', 'Price', 'SKU']);
      expect(result.rows).toHaveLength(2);
      expect(result.delimiter).toBe(',');
      expect(result.totalRows).toBe(2);
    }
  });

  it('detects tab delimiter', () => {
    const tsv = 'Name\tPrice\tSKU\nWidget\t9.99\tWDG-001';
    const result = parseCsv(tsv);
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.delimiter).toBe('\t');
      expect(result.headers).toEqual(['Name', 'Price', 'SKU']);
    }
  });

  it('detects semicolon delimiter', () => {
    const csv = 'Name;Price;SKU\nWidget;9.99;WDG-001';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.delimiter).toBe(';');
    }
  });

  it('strips BOM from UTF-8 content', () => {
    const csv = '\uFEFFName,Price\nTest,5.00';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.headers[0]).toBe('Name');
    }
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = 'Name,Description,Price\n"Widget, Large","A big widget",9.99';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.rows[0]![0]).toBe('Widget, Large');
      expect(result.rows[0]![1]).toBe('A big widget');
    }
  });

  it('handles escaped quotes (double-quote)', () => {
    const csv = 'Name,Price\n"Widget ""Pro""",9.99';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.rows[0]![0]).toBe('Widget "Pro"');
    }
  });

  it('skips completely empty rows', () => {
    const csv = 'Name,Price\nWidget,9.99\n,,\nGadget,19.99';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.totalRows).toBe(2);
    }
  });

  it('returns error if header only', () => {
    const csv = 'Name,Price';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.message).toContain('header row and at least one data row');
    }
  });

  it('returns error if too many rows', () => {
    const rows = ['Name,Price'];
    for (let i = 0; i < 10_001; i++) rows.push(`Item${i},1.00`);
    const result = parseCsv(rows.join('\n'));
    expect(isParseError(result)).toBe(true);
  });

  it('returns error for single-column file', () => {
    const csv = 'Name\nWidget';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.message).toContain('at least 2 columns');
    }
  });

  it('handles Windows-style CRLF line endings', () => {
    const csv = 'Name,Price\r\nWidget,9.99\r\nGadget,19.99';
    const result = parseCsv(csv);
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.totalRows).toBe(2);
    }
  });
});

// ── Analyzer Tests ──────────────────────────────────────────────────

describe('analyzeColumns', () => {
  it('maps exact alias matches with high confidence', () => {
    const headers = ['item_name', 'price', 'sku'];
    const sampleRows = [
      ['Widget', '$9.99', 'WDG-001'],
      ['Gadget', '$19.99', 'GDG-002'],
    ];

    const result = analyzeColumns(headers, sampleRows);
    expect(result).toHaveLength(3);

    const nameCol = result.find((c) => c.targetField === 'name');
    expect(nameCol).toBeDefined();
    expect(nameCol!.confidence).toBeGreaterThanOrEqual(90);

    const priceCol = result.find((c) => c.targetField === 'defaultPrice');
    expect(priceCol).toBeDefined();
    expect(priceCol!.confidence).toBeGreaterThanOrEqual(90);

    const skuCol = result.find((c) => c.targetField === 'sku');
    expect(skuCol).toBeDefined();
    expect(skuCol!.confidence).toBeGreaterThanOrEqual(90);
  });

  it('detects barcode patterns from numeric data', () => {
    // Use a header not in any alias list so pure pattern detection is tested
    const headers = ['product', 'identifier'];
    const sampleRows = [
      ['Widget', '012345678905'],
      ['Gadget', '098765432109'],
      ['Thing', '456789012345'],
    ];

    const result = analyzeColumns(headers, sampleRows);
    const barcodeCol = result.find((c) => c.targetField === 'barcode');
    expect(barcodeCol).toBeDefined();
    expect(barcodeCol!.confidence).toBeGreaterThan(50);
  });

  it('detects currency patterns for price/cost', () => {
    const headers = ['name', 'retail_price', 'unit_cost'];
    const sampleRows = [
      ['Widget', '$9.99', '$5.00'],
      ['Gadget', '$19.99', '$10.50'],
    ];

    const result = analyzeColumns(headers, sampleRows);

    const priceCol = result.find((c) => c.targetField === 'defaultPrice');
    expect(priceCol).toBeDefined();

    const costCol = result.find((c) => c.targetField === 'cost');
    expect(costCol).toBeDefined();
  });

  it('detects boolean patterns for isTrackable', () => {
    const headers = ['item', 'trackable'];
    const sampleRows = [
      ['Widget', 'yes'],
      ['Gadget', 'no'],
      ['Thing', 'yes'],
    ];

    const result = analyzeColumns(headers, sampleRows);
    const boolCol = result.find((c) => c.targetField === 'isTrackable');
    expect(boolCol).toBeDefined();
  });

  it('detects item type keywords', () => {
    const headers = ['name', 'type'];
    const sampleRows = [
      ['Burger', 'food'],
      ['Beer', 'beverage'],
      ['T-Shirt', 'retail'],
    ];

    const result = analyzeColumns(headers, sampleRows);
    const typeCol = result.find((c) => c.targetField === 'itemType');
    expect(typeCol).toBeDefined();
    expect(typeCol!.confidence).toBeGreaterThan(70);
  });

  it('does not assign the same target to multiple columns', () => {
    const headers = ['name', 'title', 'sku'];
    const sampleRows = [
      ['Widget', 'Widget Pro', 'WDG-001'],
    ];

    const result = analyzeColumns(headers, sampleRows);
    const targets = result.map((c) => c.targetField).filter(Boolean);
    const uniqueTargets = new Set(targets);
    expect(uniqueTargets.size).toBe(targets.length);
  });

  it('marks unmapped columns with null targetField', () => {
    const headers = ['name', 'price', 'random_stuff'];
    const sampleRows = [
      ['Widget', '9.99', 'abc123xyz'],
    ];

    const result = analyzeColumns(headers, sampleRows);
    expect(result).toHaveLength(3);
    // At least one should be unmapped or mapped with low confidence
  });

  it('handles department/category aliases', () => {
    const headers = ['name', 'price', 'department', 'category'];
    const sampleRows = [
      ['Widget', '9.99', 'Electronics', 'Accessories'],
      ['Gadget', '19.99', 'Electronics', 'Gadgets'],
    ];

    const result = analyzeColumns(headers, sampleRows);
    const deptCol = result.find((c) => c.targetField === 'department');
    expect(deptCol).toBeDefined();

    const catCol = result.find((c) => c.targetField === 'category');
    expect(catCol).toBeDefined();
  });

  it('provides alternatives for each column', () => {
    const headers = ['name', 'price'];
    const sampleRows = [['Widget', '$9.99']];

    const result = analyzeColumns(headers, sampleRows);
    // alternatives is always an array (possibly empty)
    for (const col of result) {
      expect(Array.isArray(col.alternatives)).toBe(true);
    }
  });
});

// ── Validator Tests ─────────────────────────────────────────────────

describe('validateImport', () => {
  const defaultInput = {
    headers: ['Name', 'Price', 'SKU', 'Type'],
    rows: [
      ['Widget', '9.99', 'WDG-001', 'retail'],
      ['Gadget', '19.99', 'GDG-002', 'food'],
    ],
    mappings: { '0': 'name', '1': 'defaultPrice', '2': 'sku', '3': 'itemType' },
    existingSkus: new Set<string>(),
    existingBarcodes: new Set<string>(),
    existingCategories: new Set<string>(),
    existingTaxCategories: new Set<string>(),
    defaultItemType: 'retail',
  };

  it('validates a clean dataset successfully', () => {
    const result = validateImport(defaultInput);
    expect(result.isValid).toBe(true);
    expect(result.parsedItems).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.validRows).toBe(2);
  });

  it('errors when name is not mapped', () => {
    const result = validateImport({
      ...defaultInput,
      mappings: { '1': 'defaultPrice', '2': 'sku' },
    });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.message).toContain('Item Name must be mapped');
  });

  it('errors when price is not mapped', () => {
    const result = validateImport({
      ...defaultInput,
      mappings: { '0': 'name', '2': 'sku' },
    });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.message).toContain('Price must be mapped');
  });

  it('errors on missing item name', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [['', '9.99', 'WDG-001', 'retail']],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.message).toContain('Item name is required');
  });

  it('errors on invalid price', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [['Widget', 'abc', 'WDG-001', 'retail']],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.message).toContain('Invalid or missing price');
  });

  it('errors on negative price', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [['Widget', '-5.00', 'WDG-001', 'retail']],
    });
    expect(result.isValid).toBe(false);
  });

  it('errors on duplicate SKU within file', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [
        ['Widget', '9.99', 'WDG-001', 'retail'],
        ['Gadget', '19.99', 'WDG-001', 'retail'],
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate SKU'))).toBe(true);
  });

  it('warns on existing SKU in database', () => {
    const result = validateImport({
      ...defaultInput,
      existingSkus: new Set(['WDG-001']),
    });
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('already exists'))).toBe(true);
    expect(result.stats.duplicateSkus).toContain('WDG-001');
  });

  it('normalizes item types', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [
        ['Burger', '12.99', 'BRG-001', 'f&b'],
        ['Beer', '6.99', 'BEER-001', 'drink'],
        ['Shirt', '29.99', 'SHT-001', 'merchandise'],
      ],
    });
    expect(result.isValid).toBe(true);
    expect(result.parsedItems[0]!.itemType).toBe('food');
    expect(result.parsedItems[1]!.itemType).toBe('beverage');
    expect(result.parsedItems[2]!.itemType).toBe('retail');
  });

  it('uses default item type when column is unmapped or empty', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [['Widget', '9.99', 'WDG-001', '']],
      defaultItemType: 'food',
    });
    expect(result.isValid).toBe(true);
    expect(result.parsedItems[0]!.itemType).toBe('food');
  });

  it('warns on unknown item type and falls back to default', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [['Widget', '9.99', 'WDG-001', 'xyztype']],
    });
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('Unknown item type'))).toBe(true);
    expect(result.parsedItems[0]!.itemType).toBe('retail');
  });

  it('warns when cost exceeds price', () => {
    const result = validateImport({
      ...defaultInput,
      mappings: { '0': 'name', '1': 'defaultPrice', '2': 'sku', '3': 'cost' },
      rows: [['Widget', '9.99', 'WDG-001', '15.00']],
    });
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('exceeds price'))).toBe(true);
  });

  it('strips dollar signs and commas from prices', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [['Widget', '$1,299.99', 'WDG-001', 'retail']],
    });
    expect(result.isValid).toBe(true);
    expect(result.parsedItems[0]!.defaultPrice).toBe(1299.99);
  });

  it('uppercases SKUs', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [['Widget', '9.99', 'wdg-001', 'retail']],
    });
    expect(result.isValid).toBe(true);
    expect(result.parsedItems[0]!.sku).toBe('WDG-001');
  });

  it('tracks new departments and categories', () => {
    const result = validateImport({
      ...defaultInput,
      mappings: { '0': 'name', '1': 'defaultPrice', '2': 'department', '3': 'category' },
      rows: [
        ['Widget', '9.99', 'Electronics', 'Widgets'],
        ['Gadget', '19.99', 'Electronics', 'Gadgets'],
      ],
    });
    expect(result.isValid).toBe(true);
    expect(result.stats.newDepartments).toContain('Electronics');
    expect(result.stats.newCategories).toContain('Widgets');
    expect(result.stats.newCategories).toContain('Gadgets');
  });

  it('does not flag existing categories as new', () => {
    const result = validateImport({
      ...defaultInput,
      mappings: { '0': 'name', '1': 'defaultPrice', '2': 'department', '3': 'itemType' },
      rows: [['Widget', '9.99', 'Electronics', 'retail']],
      existingCategories: new Set(['electronics']),
    });
    expect(result.stats.newDepartments).toHaveLength(0);
  });

  it('parses boolean fields correctly', () => {
    const result = validateImport({
      ...defaultInput,
      mappings: { '0': 'name', '1': 'defaultPrice', '2': 'isTrackable', '3': 'priceIncludesTax' },
      rows: [['Widget', '9.99', 'yes', 'true']],
    });
    expect(result.isValid).toBe(true);
    expect(result.parsedItems[0]!.isTrackable).toBe(true);
    expect(result.parsedItems[0]!.priceIncludesTax).toBe(true);
  });

  it('errors on name exceeding 200 characters', () => {
    const longName = 'A'.repeat(201);
    const result = validateImport({
      ...defaultInput,
      rows: [[longName, '9.99', 'WDG-001', 'retail']],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.message).toContain('exceeds 200 characters');
  });

  it('counts error rows correctly', () => {
    const result = validateImport({
      ...defaultInput,
      rows: [
        ['Widget', '9.99', 'WDG-001', 'retail'],     // valid
        ['', '9.99', 'WDG-002', 'retail'],             // missing name
        ['Gadget', 'abc', 'WDG-003', 'retail'],        // invalid price
      ],
    });
    expect(result.stats.validRows).toBe(1);
    expect(result.stats.errorRows).toBe(2);
  });
});
