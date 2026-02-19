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

    return rows.map((r) => ({
      catalogItemId: r.catalogItemId,
      catalogItemName: r.catalogItemName,
      quantitySold: r.quantitySold,
      grossRevenue: num(r.grossRevenue),
      quantityVoided: r.quantityVoided,
      voidRevenue: num(r.voidRevenue),
    }));
  });
}
