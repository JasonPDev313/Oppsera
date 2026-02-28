import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface FixedAssetListItem {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  status: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  netBookValue: number;
  accumulatedDepreciation: number;
  locationId: string | null;
  createdAt: string;
}

export interface ListFixedAssetsResult {
  items: FixedAssetListItem[];
  cursor: string | null;
  hasMore: boolean;
}

interface ListFixedAssetsInput {
  tenantId: string;
  status?: string;
  category?: string;
  locationId?: string;
  cursor?: string;
  limit?: number;
}

export async function listFixedAssets(
  input: ListFixedAssetsInput,
): Promise<ListFixedAssetsResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const statusFilter = input.status
      ? sql`AND fa.status = ${input.status}`
      : sql``;

    const categoryFilter = input.category
      ? sql`AND fa.category = ${input.category}`
      : sql``;

    const locationFilter = input.locationId
      ? sql`AND fa.location_id = ${input.locationId}`
      : sql``;

    const cursorFilter = input.cursor
      ? sql`AND fa.id < ${input.cursor}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        fa.id,
        fa.asset_number,
        fa.name,
        fa.category,
        fa.status,
        fa.acquisition_date,
        fa.acquisition_cost,
        fa.salvage_value,
        fa.useful_life_months,
        fa.depreciation_method,
        fa.location_id,
        fa.created_at,
        COALESCE(dep_agg.max_accumulated, 0) AS accumulated_depreciation,
        fa.acquisition_cost - COALESCE(dep_agg.max_accumulated, 0) AS net_book_value
      FROM fixed_assets fa
      LEFT JOIN (
        SELECT
          asset_id,
          MAX(accumulated_total) AS max_accumulated
        FROM fixed_asset_depreciation
        WHERE tenant_id = ${input.tenantId}
        GROUP BY asset_id
      ) dep_agg ON dep_agg.asset_id = fa.id
      WHERE fa.tenant_id = ${input.tenantId}
        ${statusFilter}
        ${categoryFilter}
        ${locationFilter}
        ${cursorFilter}
      ORDER BY fa.created_at DESC, fa.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const pageRows = hasMore ? allRows.slice(0, limit) : allRows;

    const items: FixedAssetListItem[] = pageRows.map((row) => ({
      id: String(row.id),
      assetNumber: String(row.asset_number),
      name: String(row.name),
      category: String(row.category),
      status: String(row.status),
      acquisitionDate: String(row.acquisition_date),
      acquisitionCost: Number(row.acquisition_cost),
      salvageValue: Number(row.salvage_value),
      usefulLifeMonths: Number(row.useful_life_months),
      depreciationMethod: String(row.depreciation_method),
      netBookValue: Number(row.net_book_value),
      accumulatedDepreciation: Number(row.accumulated_depreciation),
      locationId: row.location_id ? String(row.location_id) : null,
      createdAt: String(row.created_at),
    }));

    return {
      items,
      cursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
