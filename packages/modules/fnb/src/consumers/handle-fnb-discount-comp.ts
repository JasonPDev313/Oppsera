import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface DiscountCompEventData {
  locationId: string;
  businessDate: string;
  grossSalesCents: number;
  discountCents: number;
  discountType: string | null;
  compCents: number;
  compReason: string | null;
  voidCount: number;
  voidReason: string | null;
}

/**
 * Consumer: handles F&B discount/comp/void events.
 * Upserts into rm_fnb_discount_comp_analysis.
 */
export async function handleFnbDiscountComp(
  tenantId: string,
  data: DiscountCompEventData,
): Promise<void> {
  const discountDollars = (data.discountCents / 100).toFixed(4);
  const compDollars = (data.compCents / 100).toFixed(4);
  const grossSalesDollars = (data.grossSalesCents / 100).toFixed(4);

  const discountByType = data.discountType
    ? JSON.stringify({ [data.discountType]: Number(discountDollars) })
    : null;
  const compByReason = data.compReason
    ? JSON.stringify({ [data.compReason]: Number(compDollars) })
    : null;
  const voidByReason = data.voidReason
    ? JSON.stringify({ [data.voidReason]: data.voidCount })
    : null;

  const discountPct = Number(grossSalesDollars) > 0
    ? Number(((data.discountCents / data.grossSalesCents) * 100).toFixed(2))
    : null;

  await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO rm_fnb_discount_comp_analysis (
        id, tenant_id, location_id, business_date,
        total_discounts, discount_by_type,
        total_comps, comp_by_reason,
        void_count, void_by_reason,
        discount_as_pct_of_sales, updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.businessDate},
        ${discountDollars}, ${discountByType},
        ${compDollars}, ${compByReason},
        ${data.voidCount}, ${voidByReason},
        ${discountPct}, NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        total_discounts = rm_fnb_discount_comp_analysis.total_discounts + EXCLUDED.total_discounts,
        total_comps = rm_fnb_discount_comp_analysis.total_comps + EXCLUDED.total_comps,
        void_count = rm_fnb_discount_comp_analysis.void_count + EXCLUDED.void_count,
        updated_at = NOW()
    `);
  });
}
