export type TaxMode = 'exclusive' | 'inclusive';

export interface TaxRateBreakdown {
  taxRateId: string | null;
  taxName: string;
  rateDecimal: number;
  amount: number;
}

export interface TaxCalculationResult {
  calculationMode: TaxMode;
  subtotal: number;
  taxTotal: number;
  total: number;
  breakdown: TaxRateBreakdown[];
}

export interface TaxCalculationInput {
  lineSubtotal: number;
  calculationMode: TaxMode;
  taxRates: Array<{
    taxRateId: string | null;
    taxName: string;
    rateDecimal: number;
  }>;
}

/**
 * Calculate taxes for a line item (all amounts in cents).
 *
 * EXCLUSIVE mode — tax is added on top of the entered price:
 *   subtotal = lineSubtotal (the entered price, unchanged)
 *   taxTotal = round(lineSubtotal × totalRate)
 *   total    = subtotal + taxTotal (what the customer pays)
 *
 * INCLUSIVE mode — tax is already embedded in the entered price:
 *   total    = lineSubtotal (the entered price, unchanged — customer pays this)
 *   taxTotal = round(lineSubtotal − lineSubtotal / (1 + totalRate))
 *   subtotal = lineSubtotal − taxTotal (the pre-tax base price)
 *
 * In both modes: total = subtotal + taxTotal (always holds).
 *
 * Individual rate amounts are allocated proportionally by their share of the
 * combined rate. The last rate receives the remainder to guarantee
 * sum(breakdown) === taxTotal exactly.
 */
export function calculateTaxes(input: TaxCalculationInput): TaxCalculationResult {
  const { lineSubtotal, calculationMode, taxRates } = input;

  // Zero-price early return — no tax on free items
  if (lineSubtotal === 0) {
    return { calculationMode, subtotal: 0, taxTotal: 0, total: 0, breakdown: [] };
  }

  if (taxRates.length === 0) {
    return {
      calculationMode,
      subtotal: lineSubtotal,
      taxTotal: 0,
      total: lineSubtotal,
      breakdown: [],
    };
  }

  const totalRate = taxRates.reduce((sum, r) => sum + r.rateDecimal, 0);

  let taxTotal: number;
  let total: number;

  if (calculationMode === 'exclusive') {
    taxTotal = Math.round(lineSubtotal * totalRate);
    total = lineSubtotal + taxTotal;
  } else {
    taxTotal = Math.round(lineSubtotal - lineSubtotal / (1 + totalRate));
    total = lineSubtotal;
  }

  const breakdown: TaxRateBreakdown[] = [];
  let allocatedTax = 0;

  for (let i = 0; i < taxRates.length; i++) {
    const rate = taxRates[i]!;
    let rateAmount: number;

    if (i === taxRates.length - 1) {
      rateAmount = taxTotal - allocatedTax;
    } else {
      const rateShare = totalRate > 0 ? rate.rateDecimal / totalRate : 0;
      rateAmount = Math.round(taxTotal * rateShare);
    }

    allocatedTax += rateAmount;

    breakdown.push({
      taxRateId: rate.taxRateId,
      taxName: rate.taxName,
      rateDecimal: rate.rateDecimal,
      amount: rateAmount,
    });
  }

  return {
    calculationMode,
    subtotal: calculationMode === 'inclusive' ? lineSubtotal - taxTotal : lineSubtotal,
    taxTotal,
    total,
    breakdown,
  };
}
