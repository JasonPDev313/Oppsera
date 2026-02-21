import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetMenuMixInput } from '../validation';

export interface MenuMixRow {
  id: string;
  locationId: string;
  businessDate: string;
  catalogItemId: string;
  catalogItemName: string;
  categoryName: string | null;
  departmentName: string | null;
  quantitySold: number;
  percentageOfTotalItems: number | null;
  revenue: number;
  percentageOfTotalRevenue: number | null;
}

export interface MenuMixResult {
  items: MenuMixRow[];
  totals: {
    totalQuantity: number;
    totalRevenue: number;
  };
}

export async function getMenuMix(
  input: GetMenuMixInput,
): Promise<MenuMixResult> {
  const { tenantId, locationId, startDate, endDate, topN = 20, sortBy = 'revenue' } = input;

  return withTenant(tenantId, async (tx) => {
    // First get totals for percentage computation
    const totalRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(quantity_sold), 0) AS total_qty,
        COALESCE(SUM(revenue), 0) AS total_rev
      FROM rm_fnb_menu_mix
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
    `);

    const totalsArr = Array.from(totalRows as Iterable<Record<string, unknown>>);
    const totalQuantity = Number(totalsArr[0]?.total_qty ?? 0);
    const totalRevenue = Number(totalsArr[0]?.total_rev ?? 0);

    const orderClause = sortBy === 'quantity_sold'
      ? sql`ORDER BY SUM(quantity_sold) DESC`
      : sql`ORDER BY SUM(revenue) DESC`;

    const rows = await tx.execute(sql`
      SELECT
        MIN(id) AS id,
        location_id,
        catalog_item_id,
        MAX(catalog_item_name) AS catalog_item_name,
        MAX(category_name) AS category_name,
        MAX(department_name) AS department_name,
        SUM(quantity_sold) AS quantity_sold,
        SUM(revenue) AS revenue
      FROM rm_fnb_menu_mix
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
      GROUP BY location_id, catalog_item_id
      ${orderClause}
      LIMIT ${topN}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
      const qty = Number(r.quantity_sold);
      const rev = Number(r.revenue);
      return {
        id: String(r.id),
        locationId: String(r.location_id),
        businessDate: '', // aggregated across dates
        catalogItemId: String(r.catalog_item_id),
        catalogItemName: String(r.catalog_item_name),
        categoryName: r.category_name != null ? String(r.category_name) : null,
        departmentName: r.department_name != null ? String(r.department_name) : null,
        quantitySold: qty,
        percentageOfTotalItems: totalQuantity > 0
          ? Number(((qty / totalQuantity) * 100).toFixed(2))
          : null,
        revenue: rev,
        percentageOfTotalRevenue: totalRevenue > 0
          ? Number(((rev / totalRevenue) * 100).toFixed(2))
          : null,
      };
    });

    return {
      items,
      totals: { totalQuantity, totalRevenue },
    };
  });
}
