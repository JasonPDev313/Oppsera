import { eq, and, gte, lte, asc, sql } from 'drizzle-orm';
import { withTenant, rmDailySales } from '@oppsera/db';

export interface GetDailySalesInput {
  tenantId: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface DailySalesRow {
  businessDate: string;
  locationId: string | null;
  orderCount: number;
  grossSales: number;
  discountTotal: number;
  taxTotal: number;
  netSales: number;
  tenderCash: number;
  tenderCard: number;
  tenderGiftCard: number;
  tenderHouseAccount: number;
  tenderAch: number;
  tenderOther: number;
  tipTotal: number;
  serviceChargeTotal: number;
  surchargeTotal: number;
  returnTotal: number;
  voidCount: number;
  voidTotal: number;
  avgOrderValue: number;
}

const num = (v: string | number | null | undefined): number => Number(v) || 0;

/**
 * Retrieves daily sales data for a date range.
 *
 * Prefers CQRS read models (rm_daily_sales) for speed.
 * Falls back to querying operational tables directly when read models are empty
 * (e.g., after direct seeding that bypassed the event system).
 *
 * - With locationId: returns per-date rows for that location.
 * - Without locationId: aggregates across all locations per date,
 *   recomputing avgOrderValue as SUM(netSales) / SUM(orderCount).
 */
export async function getDailySales(input: GetDailySalesInput): Promise<DailySalesRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    const dateConditions = [
      eq(rmDailySales.tenantId, input.tenantId),
      gte(rmDailySales.businessDate, input.dateFrom),
      lte(rmDailySales.businessDate, input.dateTo),
    ];

    if (input.locationId) {
      // Single location — direct select
      dateConditions.push(eq(rmDailySales.locationId, input.locationId));

      const rows = await tx
        .select()
        .from(rmDailySales)
        .where(and(...dateConditions))
        .orderBy(asc(rmDailySales.businessDate));

      if (rows.length > 0) {
        return rows.map((r) => ({
          businessDate: r.businessDate,
          locationId: r.locationId,
          orderCount: r.orderCount,
          grossSales: num(r.grossSales),
          discountTotal: num(r.discountTotal),
          taxTotal: num(r.taxTotal),
          netSales: num(r.netSales),
          tenderCash: num(r.tenderCash),
          tenderCard: num(r.tenderCard),
          tenderGiftCard: num(r.tenderGiftCard),
          tenderHouseAccount: num(r.tenderHouseAccount),
          tenderAch: num(r.tenderAch),
          tenderOther: num(r.tenderOther),
          tipTotal: num(r.tipTotal),
          serviceChargeTotal: num(r.serviceChargeTotal),
          surchargeTotal: num(r.surchargeTotal),
          returnTotal: num(r.returnTotal),
          voidCount: r.voidCount,
          voidTotal: num(r.voidTotal),
          avgOrderValue: num(r.avgOrderValue),
        }));
      }

      // Fallback: query operational orders + tenders when read model is empty
      return queryOrdersWithTenders(tx, input.tenantId, input.dateFrom, input.dateTo, input.locationId);
    }

    // Multi-location — aggregate across all locations per date
    const rows = await tx
      .select({
        businessDate: rmDailySales.businessDate,
        orderCount: sql<number>`sum(${rmDailySales.orderCount})::int`,
        grossSales: sql<string>`sum(${rmDailySales.grossSales})::numeric(19,4)`,
        discountTotal: sql<string>`sum(${rmDailySales.discountTotal})::numeric(19,4)`,
        taxTotal: sql<string>`sum(${rmDailySales.taxTotal})::numeric(19,4)`,
        netSales: sql<string>`sum(${rmDailySales.netSales})::numeric(19,4)`,
        tenderCash: sql<string>`sum(${rmDailySales.tenderCash})::numeric(19,4)`,
        tenderCard: sql<string>`sum(${rmDailySales.tenderCard})::numeric(19,4)`,
        tenderGiftCard: sql<string>`sum(${rmDailySales.tenderGiftCard})::numeric(19,4)`,
        tenderHouseAccount: sql<string>`sum(${rmDailySales.tenderHouseAccount})::numeric(19,4)`,
        tenderAch: sql<string>`sum(${rmDailySales.tenderAch})::numeric(19,4)`,
        tenderOther: sql<string>`sum(${rmDailySales.tenderOther})::numeric(19,4)`,
        tipTotal: sql<string>`sum(${rmDailySales.tipTotal})::numeric(19,4)`,
        serviceChargeTotal: sql<string>`sum(${rmDailySales.serviceChargeTotal})::numeric(19,4)`,
        surchargeTotal: sql<string>`sum(${rmDailySales.surchargeTotal})::numeric(19,4)`,
        returnTotal: sql<string>`sum(${rmDailySales.returnTotal})::numeric(19,4)`,
        voidCount: sql<number>`sum(${rmDailySales.voidCount})::int`,
        voidTotal: sql<string>`sum(${rmDailySales.voidTotal})::numeric(19,4)`,
        avgOrderValue: sql<string>`case when sum(${rmDailySales.orderCount}) > 0
          then (sum(${rmDailySales.netSales}) / sum(${rmDailySales.orderCount}))::numeric(19,4)
          else 0 end`,
      })
      .from(rmDailySales)
      .where(and(...dateConditions))
      .groupBy(rmDailySales.businessDate)
      .orderBy(asc(rmDailySales.businessDate));

    if (rows.length > 0) {
      return rows.map((r) => ({
        businessDate: r.businessDate,
        locationId: null,
        orderCount: r.orderCount,
        grossSales: num(r.grossSales),
        discountTotal: num(r.discountTotal),
        taxTotal: num(r.taxTotal),
        netSales: num(r.netSales),
        tenderCash: num(r.tenderCash),
        tenderCard: num(r.tenderCard),
        tenderGiftCard: num(r.tenderGiftCard),
        tenderHouseAccount: num(r.tenderHouseAccount),
        tenderAch: num(r.tenderAch),
        tenderOther: num(r.tenderOther),
        tipTotal: num(r.tipTotal),
        serviceChargeTotal: num(r.serviceChargeTotal),
        surchargeTotal: num(r.surchargeTotal),
        returnTotal: num(r.returnTotal),
        voidCount: r.voidCount,
        voidTotal: num(r.voidTotal),
        avgOrderValue: num(r.avgOrderValue),
      }));
    }

    // Fallback: query operational orders + tenders when read model is empty
    return queryOrdersWithTenders(tx, input.tenantId, input.dateFrom, input.dateTo);
  });
}

/**
 * Fallback: query operational orders + tenders tables directly
 * when rm_daily_sales read model is empty (e.g., seed data, consumers not yet run).
 * Converts cents → dollars to match read model format.
 * Includes tender breakdown via LEFT JOIN LATERAL on tenders table.
 *
 * Uses sargable WHERE clauses: filters on business_date first (indexed),
 * then falls back to created_at::date for rows with NULL business_date.
 */
async function queryOrdersWithTenders(
  tx: any,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  locationId?: string,
): Promise<DailySalesRow[]> {
  const locFilter = locationId
    ? sql` AND o.location_id = ${locationId}`
    : sql``;

  const rows = await tx.execute(sql`
    SELECT
      d.biz_date AS business_date,
      d.order_count,
      d.gross_sales_cents,
      d.discount_total_cents,
      d.tax_total_cents,
      d.net_sales_cents,
      d.svc_charge_cents,
      d.void_count,
      d.void_total_cents,
      coalesce(t.tender_cash, 0)::bigint AS tender_cash_cents,
      coalesce(t.tender_card, 0)::bigint AS tender_card_cents,
      coalesce(t.tender_gift_card, 0)::bigint AS tender_gift_card_cents,
      coalesce(t.tender_house_account, 0)::bigint AS tender_house_account_cents,
      coalesce(t.tender_ach, 0)::bigint AS tender_ach_cents,
      coalesce(t.tender_other, 0)::bigint AS tender_other_cents,
      coalesce(t.tip_total, 0)::bigint AS tip_total_cents,
      coalesce(t.surcharge_total, 0)::bigint AS surcharge_total_cents
    FROM (
      SELECT
        COALESCE(o.business_date, o.created_at::date::text) AS biz_date,
        count(*)::int AS order_count,
        coalesce(sum(CASE WHEN o.status != 'voided' THEN o.subtotal ELSE 0 END), 0)::bigint AS gross_sales_cents,
        coalesce(sum(CASE WHEN o.status != 'voided' THEN COALESCE(o.discount_total, 0) ELSE 0 END), 0)::bigint AS discount_total_cents,
        coalesce(sum(CASE WHEN o.status != 'voided' THEN o.tax_total ELSE 0 END), 0)::bigint AS tax_total_cents,
        coalesce(sum(CASE WHEN o.status != 'voided' THEN o.total ELSE 0 END), 0)::bigint AS net_sales_cents,
        coalesce(sum(CASE WHEN o.status != 'voided' THEN COALESCE(o.service_charge_total, 0) ELSE 0 END), 0)::bigint AS svc_charge_cents,
        coalesce(sum(CASE WHEN o.status = 'voided' THEN 1 ELSE 0 END), 0)::int AS void_count,
        coalesce(sum(CASE WHEN o.status = 'voided' THEN o.total ELSE 0 END), 0)::bigint AS void_total_cents
      FROM orders o
      WHERE o.tenant_id = ${tenantId}
        AND o.status IN ('placed', 'paid', 'voided')
        AND (
          (o.business_date IS NOT NULL AND o.business_date >= ${dateFrom} AND o.business_date <= ${dateTo})
          OR
          (o.business_date IS NULL AND o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + interval '1 day'))
        )
        ${locFilter}
      GROUP BY COALESCE(o.business_date, o.created_at::date::text)
    ) d
    LEFT JOIN LATERAL (
      SELECT
        sum(CASE WHEN tn.tender_type = 'cash' THEN tn.amount ELSE 0 END)::bigint AS tender_cash,
        sum(CASE WHEN tn.tender_type IN ('card', 'credit_card', 'debit_card') THEN tn.amount ELSE 0 END)::bigint AS tender_card,
        sum(CASE WHEN tn.tender_type = 'gift_card' THEN tn.amount ELSE 0 END)::bigint AS tender_gift_card,
        sum(CASE WHEN tn.tender_type = 'house_account' THEN tn.amount ELSE 0 END)::bigint AS tender_house_account,
        sum(CASE WHEN tn.tender_type = 'ach' THEN tn.amount ELSE 0 END)::bigint AS tender_ach,
        sum(CASE WHEN tn.tender_type NOT IN ('cash', 'card', 'credit_card', 'debit_card', 'gift_card', 'house_account', 'ach') THEN tn.amount ELSE 0 END)::bigint AS tender_other,
        sum(COALESCE(tn.tip_amount, 0))::bigint AS tip_total,
        sum(COALESCE(tn.surcharge_amount_cents, 0))::bigint AS surcharge_total
      FROM tenders tn
      JOIN orders o2 ON o2.id = tn.order_id
      WHERE tn.tenant_id = ${tenantId}
        AND tn.status != 'reversed'
        AND o2.status IN ('placed', 'paid')
        AND COALESCE(o2.business_date, o2.created_at::date::text) = d.biz_date
        ${locationId ? sql` AND o2.location_id = ${locationId}` : sql``}
    ) t ON true
    ORDER BY d.biz_date ASC
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
    const orderCount = Number(r.order_count) || 0;
    const grossSales = (Number(r.gross_sales_cents) || 0) / 100;
    const discountTotal = (Number(r.discount_total_cents) || 0) / 100;
    const taxTotal = (Number(r.tax_total_cents) || 0) / 100;
    const netSales = (Number(r.net_sales_cents) || 0) / 100;
    const voidTotal = (Number(r.void_total_cents) || 0) / 100;

    return {
      businessDate: String(r.business_date),
      locationId: locationId ?? null,
      orderCount,
      grossSales,
      discountTotal,
      taxTotal,
      netSales,
      tenderCash: (Number(r.tender_cash_cents) || 0) / 100,
      tenderCard: (Number(r.tender_card_cents) || 0) / 100,
      tenderGiftCard: (Number(r.tender_gift_card_cents) || 0) / 100,
      tenderHouseAccount: (Number(r.tender_house_account_cents) || 0) / 100,
      tenderAch: (Number(r.tender_ach_cents) || 0) / 100,
      tenderOther: (Number(r.tender_other_cents) || 0) / 100,
      tipTotal: (Number(r.tip_total_cents) || 0) / 100,
      serviceChargeTotal: (Number(r.svc_charge_cents) || 0) / 100,
      surchargeTotal: (Number(r.surcharge_total_cents) || 0) / 100,
      returnTotal: 0,
      voidCount: Number(r.void_count) || 0,
      voidTotal,
      avgOrderValue: orderCount > 0 ? netSales / orderCount : 0,
    };
  });
}
