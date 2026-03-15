import { orderLines, orderLineTaxes, orderCharges, orderDiscounts } from '@oppsera/db';
import { calculateTaxes } from '@oppsera/core/helpers/tax-calc';
import type { TaxMode } from '@oppsera/core/helpers/tax-calc';
import { and, eq, sql } from 'drizzle-orm';
import type { OrderTotals } from './order-totals';

/**
 * Prorates cart-level discounts across order lines and recalculates
 * per-line tax on the discounted amount. Each line becomes the source of
 * truth for its post-discount financials.
 *
 * Original prices are preserved in lineSubtotal/lineTax/lineTotal.
 * Post-discount truth is stored in finalLineSubtotal/finalLineTax/finalLineTotal.
 *
 * Works correctly for both EXCLUSIVE and INCLUSIVE tax modes:
 *
 * EXCLUSIVE: discount reduces the pre-tax base.
 *   finalLineSubtotal = lineSubtotal - allocation
 *   finalLineTax = tax on finalLineSubtotal
 *   finalLineTotal = finalLineSubtotal + finalLineTax
 *
 * INCLUSIVE: discount reduces the gross (sticker) price.
 *   discountedGross = lineTotal - allocation
 *   finalLineTax = tax extracted from discountedGross
 *   finalLineSubtotal = discountedGross - finalLineTax
 *   finalLineTotal = discountedGross
 *
 * Order totals are computed from finalized line values:
 *   orders.subtotal = SUM(finalLineSubtotal)
 *   orders.taxTotal = SUM(finalLineTax)
 *   orders.total = SUM(finalLineTotal) + serviceCharges
 *   orders.discountTotal = SUM(discountAllocationCents)
 */
export async function recalculateOrderTaxesAfterDiscount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle tx type
  tx: any,
  tenantId: string,
  orderId: string,
): Promise<OrderTotals> {
  // 1. Fetch all lines, their tax breakdowns, charges, and discounts in parallel
  const [allLines, allTaxBreakdown, allCharges, allDiscounts] = await Promise.all([
    tx.select({
      id: orderLines.id,
      lineSubtotal: orderLines.lineSubtotal,
      lineTax: orderLines.lineTax,
      lineTotal: orderLines.lineTotal,
      taxCalculationMode: orderLines.taxCalculationMode,
    }).from(orderLines).where(and(eq(orderLines.orderId, orderId), eq(orderLines.tenantId, tenantId))),
    tx.select({
      id: orderLineTaxes.id,
      orderLineId: orderLineTaxes.orderLineId,
      taxRateId: orderLineTaxes.taxRateId,
      taxName: orderLineTaxes.taxName,
      rateDecimal: orderLineTaxes.rateDecimal,
      amount: orderLineTaxes.amount,
    }).from(orderLineTaxes)
      .innerJoin(orderLines, and(
        eq(orderLineTaxes.orderLineId, orderLines.id),
        eq(orderLineTaxes.tenantId, orderLines.tenantId),
      ))
      .where(and(eq(orderLines.orderId, orderId), eq(orderLines.tenantId, tenantId))),
    tx.select({
      amount: orderCharges.amount,
      taxAmount: orderCharges.taxAmount,
    }).from(orderCharges).where(and(eq(orderCharges.orderId, orderId), eq(orderCharges.tenantId, tenantId))),
    tx.select({
      amount: orderDiscounts.amount,
    }).from(orderDiscounts).where(and(eq(orderDiscounts.orderId, orderId), eq(orderDiscounts.tenantId, tenantId))),
  ]);

  // Build tax rates map: lineId → array of rates
  const taxRatesByLine = new Map<string, Array<{
    id: string;
    taxRateId: string | null;
    taxName: string;
    rateDecimal: number;
  }>>();
  for (const t of allTaxBreakdown) {
    const lineRates = taxRatesByLine.get(t.orderLineId) ?? [];
    lineRates.push({
      id: t.id,
      taxRateId: t.taxRateId,
      taxName: t.taxName,
      rateDecimal: Number(t.rateDecimal) || 0, // guard against NaN from null/non-numeric DB values
    });
    taxRatesByLine.set(t.orderLineId, lineRates);
  }

  // 2. Compute total discount and prorate across lines
  const totalDiscount = allDiscounts.reduce(
    (sum: number, d: { amount: number }) => sum + d.amount,
    0,
  );
  // Use lineTotal for proration basis — this is the "sticker price" the customer sees.
  // For EXCLUSIVE lines, lineTotal = lineSubtotal + lineTax.
  // For INCLUSIVE lines, lineTotal = the gross price (what the customer pays).
  // Using lineTotal ensures mixed-mode orders prorate proportionally by customer-facing value.
  const prorationBasis = allLines.reduce(
    (sum: number, l: { lineTotal: number }) => sum + l.lineTotal,
    0,
  );

  // Prorate discount proportionally by lineTotal, last line gets remainder.
  // The allocation is then applied against lineSubtotal (exclusive) or lineTotal (inclusive).
  const allocations = new Map<string, number>();
  if (totalDiscount > 0 && prorationBasis > 0) {
    let allocated = 0;
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i]!;
      let lineAllocation: number;
      if (i === allLines.length - 1) {
        lineAllocation = totalDiscount - allocated;
      } else {
        lineAllocation = Math.round(totalDiscount * (line.lineTotal / prorationBasis));
      }
      // Clamp: never negative (rounding accumulation), never exceed line value.
      // Use lineTotal (the proration basis) for the upper bound — using lineSubtotal
      // would silently lose cents on exclusive-tax lines where lineTotal > lineSubtotal.
      lineAllocation = Math.max(0, Math.min(lineAllocation, line.lineTotal));
      allocations.set(line.id, lineAllocation);
      allocated += lineAllocation;
    }
  }

  // 3. Compute finalized line values (pure math — no DB calls)
  let orderFinalSubtotal = 0;
  let orderFinalTax = 0;
  let orderFinalTotal = 0;
  let orderDiscountTotal = 0;

  // Collect batch updates instead of issuing serial awaits per row
  const lineUpdates: Array<{
    id: string;
    allocation: number;
    finalSubtotal: number;
    finalTax: number;
    finalTotal: number;
  }> = [];
  const taxRowUpdates: Array<{ id: string; amount: number }> = [];

  for (const line of allLines) {
    const allocation = allocations.get(line.id) ?? 0;
    const lineRates = taxRatesByLine.get(line.id);
    const mode: TaxMode = (line.taxCalculationMode as TaxMode) ?? 'exclusive';

    const ratesInput = lineRates?.map((r) => ({
      taxRateId: r.taxRateId,
      taxName: r.taxName,
      rateDecimal: r.rateDecimal,
    })) ?? [];

    let finalSubtotal: number;
    let finalTax: number;
    let finalTotal: number;
    let taxResultForBreakdown: ReturnType<typeof calculateTaxes> | null = null;

    if (!lineRates || lineRates.length === 0) {
      finalSubtotal = Math.max(0, line.lineSubtotal - allocation);
      finalTax = 0;
      finalTotal = finalSubtotal;
    } else if (mode === 'inclusive') {
      const discountedGross = Math.max(0, line.lineTotal - allocation);
      const taxResult = calculateTaxes({
        lineSubtotal: discountedGross,
        calculationMode: 'inclusive',
        taxRates: ratesInput,
      });
      finalTax = taxResult.taxTotal;
      finalSubtotal = taxResult.subtotal;
      finalTotal = discountedGross;
      taxResultForBreakdown = taxResult;
    } else {
      const taxableBase = Math.max(0, line.lineSubtotal - allocation);
      const taxResult = calculateTaxes({
        lineSubtotal: taxableBase,
        calculationMode: 'exclusive',
        taxRates: ratesInput,
      });
      finalSubtotal = taxableBase;
      finalTax = taxResult.taxTotal;
      finalTotal = finalSubtotal + finalTax;
      taxResultForBreakdown = taxResult;
    }

    lineUpdates.push({ id: line.id, allocation, finalSubtotal, finalTax, finalTotal });

    if (taxResultForBreakdown && lineRates && lineRates.length > 0) {
      for (const breakdown of taxResultForBreakdown.breakdown) {
        const existingRow = lineRates.find((r) =>
          r.taxRateId === breakdown.taxRateId && r.taxName === breakdown.taxName,
        );
        if (existingRow) {
          taxRowUpdates.push({ id: existingRow.id, amount: breakdown.amount });
        }
      }
    }

    orderFinalSubtotal += finalSubtotal;
    orderFinalTax += finalTax;
    orderFinalTotal += finalTotal;
    orderDiscountTotal += allocation;
  }

  // ── Batch update order lines (single query via VALUES join) ────
  if (lineUpdates.length > 0) {
    // Build a VALUES list for the batch update — uses tagged sql`` for parameterization
    const valueFragments = lineUpdates.map((u) =>
      sql`(${u.id}, ${u.allocation}, ${u.finalSubtotal}, ${u.finalTax}, ${u.finalTotal})`,
    );
    // Join fragments with commas
    const valuesList = sql.join(valueFragments, sql`, `);

    await tx.execute(sql`
      UPDATE order_lines AS ol SET
        discount_allocation_cents = v.alloc,
        final_line_subtotal = v.sub,
        final_line_tax = v.tax,
        final_line_total = v.total
      FROM (VALUES ${valuesList})
        AS v(id, alloc, sub, tax, total)
      WHERE ol.id = v.id AND ol.tenant_id = ${tenantId}
    `);
  }

  // ── Batch update tax breakdown rows (single query) ────────────
  if (taxRowUpdates.length > 0) {
    const taxFragments = taxRowUpdates.map((u) =>
      sql`(${u.id}, ${u.amount})`,
    );
    const taxValuesList = sql.join(taxFragments, sql`, `);

    await tx.execute(sql`
      UPDATE order_line_taxes AS olt SET
        amount = v.amt
      FROM (VALUES ${taxValuesList})
        AS v(id, amt)
      WHERE olt.id = v.id AND olt.tenant_id = ${tenantId}
    `);
  }

  // Add service charge amounts
  const serviceChargeTotal = allCharges.reduce((sum: number, c: { amount: number }) => sum + c.amount, 0);
  const serviceChargeTax = allCharges.reduce((sum: number, c: { taxAmount: number }) => sum + c.taxAmount, 0);

  // 4. Build order totals from finalized line values
  // orders.total = sum of finalized line totals + service charges (including tax)
  // orders.discountTotal is stored for display/reporting but NOT subtracted again
  const totals: OrderTotals = {
    subtotal: orderFinalSubtotal,
    taxTotal: orderFinalTax + serviceChargeTax,
    serviceChargeTotal,
    discountTotal: orderDiscountTotal,
    roundingAdjustment: 0,
    total: Math.max(0, orderFinalTotal + serviceChargeTotal + serviceChargeTax),
  };

  return totals;
}
