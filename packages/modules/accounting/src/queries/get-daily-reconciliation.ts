import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface DailyReconciliation {
  businessDate: string;
  locationId: string;
  sales: {
    grossSalesCents: number;
    discountsCents: number;
    netSalesCents: number;
    taxCents: number;
    serviceChargeCents: number;
    tipsCents: number;
    totalCents: number;
    orderCount: number;
    voidCount: number;
    voidAmountCents: number;
  };
  tenders: {
    cashCents: number;
    cardCents: number;
    otherCents: number;
    totalCents: number;
    tenderCount: number;
  };
  gl: {
    revenueDebitsCents: number;
    revenueCreditsCents: number;
    totalDebitsDollars: string;
    totalCreditsDollars: string;
    isBalanced: boolean;
  };
  reconciliation: {
    salesVsTendersDiffCents: number;
    status: 'balanced' | 'difference';
  };
}

/**
 * Daily reconciliation: Sales vs Tenders vs GL for a location on a business date.
 * Three-column comparison showing the full accounting picture.
 */
export async function getDailyReconciliation(input: {
  tenantId: string;
  locationId: string;
  businessDate: string;
}): Promise<DailyReconciliation> {
  return withTenant(input.tenantId, async (tx) => {
    // Sales column: from orders
    const salesRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN o.status != 'voided' THEN o.subtotal + o.tax_total + o.service_charge_total ELSE 0 END), 0)::integer AS gross_sales,
        COALESCE(SUM(CASE WHEN o.status != 'voided' THEN o.discount_total ELSE 0 END), 0)::integer AS discounts,
        COALESCE(SUM(CASE WHEN o.status != 'voided' THEN o.total ELSE 0 END), 0)::integer AS net_sales,
        COALESCE(SUM(CASE WHEN o.status != 'voided' THEN o.tax_total ELSE 0 END), 0)::integer AS tax,
        COALESCE(SUM(CASE WHEN o.status != 'voided' THEN o.service_charge_total ELSE 0 END), 0)::integer AS service_charge,
        COUNT(CASE WHEN o.status != 'voided' THEN 1 END)::int AS order_count,
        COUNT(CASE WHEN o.status = 'voided' THEN 1 END)::int AS void_count,
        COALESCE(SUM(CASE WHEN o.status = 'voided' THEN o.total ELSE 0 END), 0)::integer AS void_amount
      FROM orders o
      WHERE o.tenant_id = ${input.tenantId}
        AND o.location_id = ${input.locationId}
        AND o.business_date = ${input.businessDate}
    `);
    const salesArr = Array.from(salesRows as Iterable<Record<string, unknown>>);
    const s = salesArr[0]!;

    // Tips from tenders
    const tipRows = await tx.execute(sql`
      SELECT COALESCE(SUM(t.tip_amount), 0)::integer AS tips
      FROM tenders t
      WHERE t.tenant_id = ${input.tenantId}
        AND t.location_id = ${input.locationId}
        AND t.business_date = ${input.businessDate}
        AND t.status = 'captured'
    `);
    const tipArr = Array.from(tipRows as Iterable<Record<string, unknown>>);
    const tipsCents = tipArr.length > 0 ? Number(tipArr[0]!.tips) : 0;

    // Tenders column
    const tenderRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN t.tender_type = 'cash' THEN t.amount ELSE 0 END), 0)::integer AS cash,
        COALESCE(SUM(CASE WHEN t.tender_type IN ('credit_card', 'debit_card') THEN t.amount ELSE 0 END), 0)::integer AS card,
        COALESCE(SUM(CASE WHEN t.tender_type NOT IN ('cash', 'credit_card', 'debit_card') THEN t.amount ELSE 0 END), 0)::integer AS other,
        COALESCE(SUM(t.amount), 0)::integer AS total,
        COUNT(*)::int AS tender_count
      FROM tenders t
      WHERE t.tenant_id = ${input.tenantId}
        AND t.location_id = ${input.locationId}
        AND t.business_date = ${input.businessDate}
        AND t.status = 'captured'
    `);
    const tenderArr = Array.from(tenderRows as Iterable<Record<string, unknown>>);
    const td = tenderArr[0]!;

    // GL column: from journal entries for this date
    const glRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(jl.debit_amount), 0) AS total_debits,
        COALESCE(SUM(jl.credit_amount), 0) AS total_credits
      FROM gl_journal_lines jl
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.tenant_id = ${input.tenantId}
        AND je.business_date = ${input.businessDate}
        AND je.status = 'posted'
        AND jl.location_id = ${input.locationId}
    `);
    const glArr = Array.from(glRows as Iterable<Record<string, unknown>>);
    const gl = glArr[0]!;
    const totalDebits = Number(gl.total_debits);
    const totalCredits = Number(gl.total_credits);

    const netSalesCents = Number(s.net_sales);
    const totalTenderCents = Number(td.total);
    const diffCents = Math.abs(netSalesCents - totalTenderCents);

    return {
      businessDate: input.businessDate,
      locationId: input.locationId,
      sales: {
        grossSalesCents: Number(s.gross_sales),
        discountsCents: Number(s.discounts),
        netSalesCents,
        taxCents: Number(s.tax),
        serviceChargeCents: Number(s.service_charge),
        tipsCents,
        totalCents: netSalesCents + tipsCents,
        orderCount: Number(s.order_count),
        voidCount: Number(s.void_count),
        voidAmountCents: Number(s.void_amount),
      },
      tenders: {
        cashCents: Number(td.cash),
        cardCents: Number(td.card),
        otherCents: Number(td.other),
        totalCents: totalTenderCents,
        tenderCount: Number(td.tender_count),
      },
      gl: {
        revenueDebitsCents: Math.round(totalDebits * 100),
        revenueCreditsCents: Math.round(totalCredits * 100),
        totalDebitsDollars: totalDebits.toFixed(2),
        totalCreditsDollars: totalCredits.toFixed(2),
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      },
      reconciliation: {
        salesVsTendersDiffCents: diffCents,
        status: diffCents < 1 ? 'balanced' : 'difference',
      },
    };
  });
}
