export interface OrderTotals {
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  discountTotal: number;
  roundingAdjustment: number;
  total: number;
}

export function recalculateOrderTotals(
  lines: Array<{ lineSubtotal: number; lineTax: number; lineTotal: number }>,
  charges: Array<{ amount: number; taxAmount: number }>,
  discounts: Array<{ amount: number }>,
  roundingAdjustment: number = 0,
): OrderTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
  const lineItemTax = lines.reduce((sum, l) => sum + l.lineTax, 0);
  const serviceChargeTax = charges.reduce((sum, c) => sum + c.taxAmount, 0);
  const taxTotal = lineItemTax + serviceChargeTax;
  const lineTotalsSum = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const serviceChargeTotal = charges.reduce((sum, c) => sum + c.amount, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = Math.max(0, lineTotalsSum + serviceChargeTotal + serviceChargeTax - discountTotal + roundingAdjustment);
  return { subtotal, taxTotal, serviceChargeTotal, discountTotal, roundingAdjustment, total };
}
