import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetDiscountCompAnalysisInput } from '../validation';

export interface DiscountCompAnalysisRow {
  id: string;
  locationId: string;
  businessDate: string;
  totalDiscounts: number;
  discountByType: Record<string, number> | null;
  totalComps: number;
  compByReason: Record<string, number> | null;
  voidCount: number;
  voidByReason: Record<string, number> | null;
  discountAsPctOfSales: number | null;
}

export interface DiscountCompAnalysisResult {
  items: DiscountCompAnalysisRow[];
  summary: {
    totalDiscounts: number;
    totalComps: number;
    totalVoids: number;
  };
}

export async function getDiscountCompAnalysis(
  input: GetDiscountCompAnalysisInput,
): Promise<DiscountCompAnalysisResult> {
  const { tenantId, locationId, startDate, endDate } = input;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        id, location_id, business_date,
        total_discounts, discount_by_type,
        total_comps, comp_by_reason,
        void_count, void_by_reason,
        discount_as_pct_of_sales
      FROM rm_fnb_discount_comp_analysis
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
      ORDER BY business_date DESC
    `);

    let totalDiscounts = 0;
    let totalComps = 0;
    let totalVoids = 0;

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
      const disc = Number(r.total_discounts);
      const comp = Number(r.total_comps);
      const voids = Number(r.void_count);
      totalDiscounts += disc;
      totalComps += comp;
      totalVoids += voids;

      return {
        id: String(r.id),
        locationId: String(r.location_id),
        businessDate: String(r.business_date),
        totalDiscounts: disc,
        discountByType: (r.discount_by_type as Record<string, number>) ?? null,
        totalComps: comp,
        compByReason: (r.comp_by_reason as Record<string, number>) ?? null,
        voidCount: voids,
        voidByReason: (r.void_by_reason as Record<string, number>) ?? null,
        discountAsPctOfSales: r.discount_as_pct_of_sales != null ? Number(r.discount_as_pct_of_sales) : null,
      };
    });

    return {
      items,
      summary: { totalDiscounts, totalComps, totalVoids },
    };
  });
}
