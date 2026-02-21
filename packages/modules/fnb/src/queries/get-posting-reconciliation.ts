import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetPostingReconciliationInput } from '../validation';

export interface PostingReconciliationData {
  businessDate: string;
  totalBatches: number;
  postedBatches: number;
  unpostedBatches: number;
  totalGrossSalesCents: number;
  totalNetSalesCents: number;
  totalTaxCollectedCents: number;
  totalTipsCents: number;
  totalCashOverShortCents: number;
  batches: Array<{
    id: string;
    locationId: string;
    status: string;
    isPosted: boolean;
    glJournalEntryId: string | null;
    netSalesCents: number;
  }>;
}

export async function getPostingReconciliation(
  input: GetPostingReconciliationInput,
): Promise<PostingReconciliationData> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`b.tenant_id = ${input.tenantId}`,
      sql`b.business_date = ${input.businessDate}`,
    ];

    if (input.locationId) {
      conditions.push(sql`b.location_id = ${input.locationId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT b.id, b.location_id, b.status, b.gl_journal_entry_id,
                 COALESCE(s.gross_sales_cents, 0) as gross_sales_cents,
                 COALESCE(s.net_sales_cents, 0) as net_sales_cents,
                 COALESCE(s.tax_collected_cents, 0) as tax_collected_cents,
                 COALESCE(s.tips_credit_cents, 0) + COALESCE(s.tips_cash_declared_cents, 0) as total_tips_cents,
                 COALESCE(s.cash_over_short_cents, 0) as cash_over_short_cents
          FROM fnb_close_batches b
          LEFT JOIN fnb_close_batch_summaries s ON s.close_batch_id = b.id
          WHERE ${whereClause}
          ORDER BY b.location_id`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);

    let totalGross = 0;
    let totalNet = 0;
    let totalTax = 0;
    let totalTips = 0;
    let totalOverShort = 0;
    let postedCount = 0;

    const batchList = results.map((r) => {
      const netSales = Number(r.net_sales_cents);
      const isPosted = r.gl_journal_entry_id != null;

      totalGross += Number(r.gross_sales_cents);
      totalNet += netSales;
      totalTax += Number(r.tax_collected_cents);
      totalTips += Number(r.total_tips_cents);
      totalOverShort += Number(r.cash_over_short_cents);
      if (isPosted) postedCount++;

      return {
        id: r.id as string,
        locationId: r.location_id as string,
        status: r.status as string,
        isPosted,
        glJournalEntryId: (r.gl_journal_entry_id as string) ?? null,
        netSalesCents: netSales,
      };
    });

    return {
      businessDate: input.businessDate,
      totalBatches: results.length,
      postedBatches: postedCount,
      unpostedBatches: results.length - postedCount,
      totalGrossSalesCents: totalGross,
      totalNetSalesCents: totalNet,
      totalTaxCollectedCents: totalTax,
      totalTipsCents: totalTips,
      totalCashOverShortCents: totalOverShort,
      batches: batchList,
    };
  });
}
