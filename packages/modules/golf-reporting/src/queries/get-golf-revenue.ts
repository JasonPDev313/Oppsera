import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { num, safeDivide, courseFilterSql } from './_shared';

export interface GetGolfRevenueInput {
  tenantId: string;
  courseId?: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface GolfRevenueRow {
  businessDate: string;
  greenFeeRevenue: number;
  cartFeeRevenue: number;
  rangeFeeRevenue: number;
  foodBevRevenue: number;
  proShopRevenue: number;
  taxTotal: number;
  totalRevenue: number;
  roundsPlayed: number;
  revPerRound: number;
}

/**
 * Daily revenue breakdown from rm_golf_revenue_daily.
 *
 * Multi-course: SUMs all revenue columns per date, recomputes revPerRound
 * from totals (not averaged per-day, per CLAUDE.md §81).
 */
export async function getGolfRevenue(input: GetGolfRevenueInput): Promise<GolfRevenueRow[]> {
  const cf = courseFilterSql(input.tenantId, input.courseId, input.locationId);

  return withTenant(input.tenantId, async (tx) => {
    const result = await (tx as any).execute(sql`
      SELECT
        business_date,
        SUM(green_fee_revenue)::numeric(19,4)  AS green_fee_revenue,
        SUM(cart_fee_revenue)::numeric(19,4)   AS cart_fee_revenue,
        SUM(range_fee_revenue)::numeric(19,4)  AS range_fee_revenue,
        SUM(food_bev_revenue)::numeric(19,4)   AS food_bev_revenue,
        SUM(pro_shop_revenue)::numeric(19,4)   AS pro_shop_revenue,
        SUM(tax_total)::numeric(19,4)          AS tax_total,
        SUM(total_revenue)::numeric(19,4)      AS total_revenue,
        SUM(rounds_played)::int                AS rounds_played
      FROM rm_golf_revenue_daily
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.dateFrom}
        AND business_date <= ${input.dateTo}
        ${cf}
      GROUP BY business_date
      ORDER BY business_date ASC
    `);
    const rows = Array.from(result as Iterable<{
      business_date: string;
      green_fee_revenue: string;
      cart_fee_revenue: string;
      range_fee_revenue: string;
      food_bev_revenue: string;
      pro_shop_revenue: string;
      tax_total: string;
      total_revenue: string;
      rounds_played: string;
    }>);

    return rows.map((r) => {
      const total = num(r.total_revenue);
      const rounds = num(r.rounds_played);
      return {
        businessDate: r.business_date,
        greenFeeRevenue: num(r.green_fee_revenue),
        cartFeeRevenue: num(r.cart_fee_revenue),
        rangeFeeRevenue: num(r.range_fee_revenue),
        foodBevRevenue: num(r.food_bev_revenue),
        proShopRevenue: num(r.pro_shop_revenue),
        taxTotal: num(r.tax_total),
        totalRevenue: total,
        roundsPlayed: rounds,
        revPerRound: Math.round(safeDivide(total, rounds) * 100) / 100,
      };
    });
  });
}
