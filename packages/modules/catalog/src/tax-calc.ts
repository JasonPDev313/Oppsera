export interface TaxRateBreakdown {
  taxRateId: string | null;
  taxName: string;
  rateDecimal: number;
  amount: number;
}

export interface TaxCalculationResult {
  calculationMode: 'exclusive' | 'inclusive';
  subtotal: number;
  taxTotal: number;
  total: number;
  breakdown: TaxRateBreakdown[];
}

export interface TaxCalculationInput {
  lineSubtotal: number;
  calculationMode: 'exclusive' | 'inclusive';
  taxRates: Array<{
    taxRateId: string | null;
    taxName: string;
    rateDecimal: number;
  }>;
}

/**
 * Calculate taxes for a line item.
 *
 * EXCLUSIVE: taxes are added on top of the subtotal.
 *   taxTotal = subtotal * totalRate
 *   total = subtotal + taxTotal
 *
 * INCLUSIVE: taxes are extracted from the price (price already includes tax).
 *   taxTotal = subtotal - (subtotal / (1 + totalRate))
 *   total = subtotal (unchanged — tax is already inside)
 *
 * Individual rate amounts are proportional to their share of the total rate.
 */
export function calculateTaxes(input: TaxCalculationInput): TaxCalculationResult {
  const { lineSubtotal, calculationMode, taxRates } = input;

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
