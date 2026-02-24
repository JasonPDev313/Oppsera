/**
 * Tax mapper: detect tax columns and suggest OppsEra tax group mappings.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface TaxMappingSuggestion {
  legacyColumn: string;
  legacyRate: number | null;
  taxMode: 'inclusive' | 'exclusive';
  confidence: number;
}

// ── Tax Column Detection ──────────────────────────────────────────────

const TAX_COLUMN_HINTS = [
  'tax', 'tax_amount', 'tax_total', 'sales_tax', 'total_tax',
  'tax_1', 'tax_2', 'tax_3', 'state_tax', 'county_tax', 'city_tax',
  'vat', 'gst', 'hst', 'pst', 'qst',
  'tax_rate', 'tax_pct', 'tax_percent',
];

/**
 * Detect which columns are tax-related from the CSV headers.
 */
export function detectTaxColumns(headers: string[]): { index: number; name: string }[] {
  const results: { index: number; name: string }[] = [];
  for (let i = 0; i < headers.length; i++) {
    const normalized = headers[i]!.toLowerCase().replace(/[^a-z0-9_]/g, '_').trim();
    if (TAX_COLUMN_HINTS.includes(normalized) || normalized.includes('tax')) {
      results.push({ index: i, name: headers[i]! });
    }
  }
  return results;
}

// ── Tax Rate Detection ────────────────────────────────────────────────

/**
 * Attempt to detect the tax rate from a set of values.
 * Examines subtotal→tax relationships or explicit rate columns.
 */
export function detectTaxRate(
  taxValues: string[],
  subtotalValues?: string[],
): number | null {
  // If all values look like percentages (0-30 range), treat as rate column
  const numericTax = taxValues
    .map((v) => parseFloat(v.replace(/[$,%]/g, '')))
    .filter((n) => !isNaN(n));

  if (numericTax.length === 0) return null;

  // Check if values are small percentages (0-30 range)
  const allSmall = numericTax.every((n) => n >= 0 && n <= 30);
  const avgValue = numericTax.reduce((s, n) => s + n, 0) / numericTax.length;
  if (allSmall && avgValue < 20) {
    // Likely a rate column
    return Math.round(avgValue * 10000) / 10000;
  }

  // If we have subtotals, try to compute the rate
  if (subtotalValues && subtotalValues.length === taxValues.length) {
    const rates: number[] = [];
    for (let i = 0; i < taxValues.length; i++) {
      const tax = parseFloat(taxValues[i]!.replace(/[$,]/g, ''));
      const subtotal = parseFloat(subtotalValues[i]!.replace(/[$,]/g, ''));
      if (!isNaN(tax) && !isNaN(subtotal) && subtotal > 0 && tax > 0) {
        rates.push(tax / subtotal);
      }
    }
    if (rates.length > 5) {
      // Cluster rates — take the mode
      const rounded = rates.map((r) => Math.round(r * 10000) / 10000);
      const freq = new Map<number, number>();
      for (const r of rounded) {
        freq.set(r, (freq.get(r) ?? 0) + 1);
      }
      let modeRate = 0;
      let modeCount = 0;
      for (const [rate, count] of freq) {
        if (count > modeCount) {
          modeRate = rate;
          modeCount = count;
        }
      }
      if (modeCount > rates.length * 0.3) {
        return modeRate;
      }
    }
  }

  return null;
}

// ── Main Function ─────────────────────────────────────────────────────

/**
 * Auto-map detected tax columns to suggestions.
 */
export function autoMapTaxColumns(
  taxColumns: { index: number; name: string }[],
  getColumnValues: (index: number) => string[],
  subtotalColumnIndex?: number,
): TaxMappingSuggestion[] {
  const subtotalValues = subtotalColumnIndex !== undefined
    ? getColumnValues(subtotalColumnIndex)
    : undefined;

  return taxColumns.map((col) => {
    const values = getColumnValues(col.index);
    const detectedRate = detectTaxRate(values, subtotalValues);

    return {
      legacyColumn: col.name,
      legacyRate: detectedRate,
      taxMode: 'exclusive' as const, // default assumption
      confidence: detectedRate !== null ? 0.75 : 0.50,
    };
  });
}
