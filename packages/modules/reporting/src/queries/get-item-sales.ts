import { eq, and, gte, lte, asc, desc, sql } from 'drizzle-orm';
import { withTenant, rmItemSales } from '@oppsera/db';

export interface GetItemSalesInput {
  tenantId: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
  sortBy?: 'quantitySold' | 'grossRevenue';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export interface ItemSalesRow {
  catalogItemId: string;
  catalogItemName: string;
  quantitySold: number;
  grossRevenue: number;
  quantityVoided: number;
  voidRevenue: number;
}

const num = (v: string | number | null | undefined): number => Number(v) || 0;

/**
 * Retrieves item sales aggregated across the date range.
 *
 * Prefers CQRS read models (rm_item_sales) for speed.
 * Falls back to querying operational tables directly when read models are empty
 * (e.g., after direct seeding that bypassed the event system).
 *
 * Groups by catalogItemId, summing quantities and revenue.
 * Supports sorting by quantitySold or grossRevenue and a limit for top-N items.
 */
export async function getItemSales(input: GetItemSalesInput): Promise<ItemSalesRow[]> {
  const limit = Math.min(input.limit ?? 100, 500);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(rmItemSales.tenantId, input.tenantId),
      gte(rmItemSales.businessDate, input.dateFrom),
      lte(rmItemSales.businessDate, input.dateTo),
    ];

    if (input.locationId) {
      conditions.push(eq(rmItemSales.locationId, input.locationId));
    }

    const sortColumn =
      input.sortBy === 'grossRevenue'
        ? sql`sum(${rmItemSales.grossRevenue})`
        : sql`sum(${rmItemSales.quantitySold})`;
    const sortFn = input.sortDir === 'asc' ? asc : desc;

    const rows = await tx
      .select({
        catalogItemId: rmItemSales.catalogItemId,
        catalogItemName: sql<string>`(array_agg(${rmItemSales.catalogItemName} order by ${rmItemSales.businessDate} desc))[1]`,
        quantitySold: sql<number>`sum(${rmItemSales.quantitySold})::int`,
        grossRevenue: sql<string>`sum(${rmItemSales.grossRevenue})::numeric(19,4)`,
        quantityVoided: sql<number>`sum(${rmItemSales.quantityVoided})::int`,
        voidRevenue: sql<string>`sum(${rmItemSales.voidRevenue})::numeric(19,4)`,
      })
      .from(rmItemSales)
      .where(and(...conditions))
      .groupBy(rmItemSales.catalogItemId)
      .orderBy(sortFn(sortColumn))
      .limit(limit);

    if (rows.length > 0) {
      return rows.map((r) => ({
        catalogItemId: r.catalogItemId,
        catalogItemName: r.catalogItemName,
        quantitySold: r.quantitySold,
        grossRevenue: num(r.grossRevenue),
        quantityVoided: r.quantityVoided,
        voidRevenue: num(r.voidRevenue),
      }));
    }

    // Fallback: query operational order_lines + orders when read model is empty
    return queryOrderLinesFallback(
      tx,
      input.tenantId,
      input.dateFrom,
      input.dateTo,
      input.locationId,
      input.sortBy,
      input.sortDir,
      limit,
    );
  });
}

/**
 * Fallback: query operational order_lines + orders tables directly
 * when rm_item_sales read model is empty (e.g., seed data, consumers not yet run).
 * Converts cents → dollars to match read model format.
 */
async function queryOrderLinesFallback(
  tx: any,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  locationId?: string,
  sortBy?: 'quantitySold' | 'grossRevenue',
  sortDir?: 'asc' | 'desc',
  limit?: number,
): Promise<ItemSalesRow[]> {
  const locFilter = locationId
    ? sql` AND o.location_id = ${locationId}`
    : sql``;

  const orderByCol =
    sortBy === 'grossRevenue' ? sql`gross_revenue_cents` : sql`quantity_sold`;
  const orderByDir = sortDir === 'asc' ? sql`ASC` : sql`DESC`;

  const rows = await tx.execute(sql`
    SELECT
      ol.catalog_item_id,
      max(ol.catalog_item_name) AS catalog_item_name,
      coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status IN ('placed', 'paid')), 0)::int AS quantity_sold,
      coalesce(sum(ol.line_total) FILTER (WHERE o.status IN ('placed', 'paid')), 0)::bigint AS gross_revenue_cents,
      coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status = 'voided'), 0)::int AS quantity_voided,
      coalesce(sum(ol.line_total) FILTER (WHERE o.status = 'voided'), 0)::bigint AS void_revenue_cents
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id
    WHERE ol.tenant_id = ${tenantId}
      AND o.status IN ('placed', 'paid', 'voided')
      AND o.business_date >= ${dateFrom}
      AND o.business_date <= ${dateTo}
      ${locFilter}
    GROUP BY ol.catalog_item_id
    ORDER BY ${orderByCol} ${orderByDir}
    LIMIT ${limit ?? 100}
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    catalogItemId: String(r.catalog_item_id),
    catalogItemName: String(r.catalog_item_name),
    quantitySold: Number(r.quantity_sold) || 0,
    grossRevenue: (Number(r.gross_revenue_cents) || 0) / 100,
    quantityVoided: Number(r.quantity_voided) || 0,
    voidRevenue: (Number(r.void_revenue_cents) || 0) / 100,
  }));
}
