import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface AssetItemSummary {
  id: string;
  assetNumber: string;
  name: string;
  cost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: string;
  depreciationMethod: string;
}

export interface AssetCategorySummary {
  category: string;
  assetCount: number;
  totalCost: number;
  totalAccumulatedDepreciation: number;
  totalNetBookValue: number;
  fullyDepreciatedCount: number;
  assets: AssetItemSummary[];
}

export interface AssetSummaryReport {
  totalAssets: number;
  totalCost: number;
  totalAccumulatedDepreciation: number;
  totalNetBookValue: number;
  totalMonthlyDepreciation: number;
  fullyDepreciatedCount: number;
  disposedCount: number;
  categories: AssetCategorySummary[];
}

interface GetAssetSummaryInput {
  tenantId: string;
  locationId?: string;
}

export async function getAssetSummary(
  input: GetAssetSummaryInput,
): Promise<AssetSummaryReport> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND fa.location_id = ${input.locationId}`
      : sql``;

    // ── Per-category aggregation ────────────────────────────────────
    // LEFT JOIN a subquery that finds the latest accumulated_total per asset.
    const categoryRows = await tx.execute(sql`
      SELECT
        fa.category,
        COUNT(*)::int AS asset_count,
        COALESCE(SUM(fa.acquisition_cost), 0) AS total_cost,
        COALESCE(SUM(dep_agg.max_accumulated), 0) AS total_accumulated_depreciation,
        COALESCE(
          SUM(fa.acquisition_cost) - SUM(COALESCE(dep_agg.max_accumulated, 0)),
          0
        ) AS total_net_book_value,
        COUNT(*) FILTER (WHERE fa.status = 'fully_depreciated')::int AS fully_depreciated_count
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
        AND fa.status != 'disposed'
        ${locationFilter}
      GROUP BY fa.category
      ORDER BY fa.category
    `);

    // ── Individual assets per category ──────────────────────────────
    const assetRows = await tx.execute(sql`
      SELECT
        fa.id,
        fa.asset_number,
        fa.name,
        fa.category,
        fa.acquisition_cost AS cost,
        COALESCE(dep_agg.max_accumulated, 0) AS accumulated_depreciation,
        fa.acquisition_cost - COALESCE(dep_agg.max_accumulated, 0) AS net_book_value,
        fa.status,
        fa.depreciation_method
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
        AND fa.status != 'disposed'
        ${locationFilter}
      ORDER BY fa.category, fa.name
    `);

    const assetsByCategory = new Map<string, AssetItemSummary[]>();
    for (const row of Array.from(assetRows as Iterable<Record<string, unknown>>)) {
      const cat = String(row.category);
      if (!assetsByCategory.has(cat)) assetsByCategory.set(cat, []);
      assetsByCategory.get(cat)!.push({
        id: String(row.id),
        assetNumber: String(row.asset_number),
        name: String(row.name),
        cost: Number(row.cost),
        accumulatedDepreciation: Number(row.accumulated_depreciation),
        netBookValue: Number(row.net_book_value),
        status: String(row.status),
        depreciationMethod: String(row.depreciation_method),
      });
    }

    const categories: AssetCategorySummary[] = Array.from(
      categoryRows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      category: String(row.category),
      assetCount: Number(row.asset_count),
      totalCost: Number(row.total_cost),
      totalAccumulatedDepreciation: Number(row.total_accumulated_depreciation),
      totalNetBookValue: Number(row.total_net_book_value),
      fullyDepreciatedCount: Number(row.fully_depreciated_count),
      assets: assetsByCategory.get(String(row.category)) ?? [],
    }));

    // ── Disposed count ──────────────────────────────────────────────
    const disposedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS disposed_count
      FROM fixed_assets
      WHERE tenant_id = ${input.tenantId}
        AND status = 'disposed'
        ${input.locationId ? sql`AND location_id = ${input.locationId}` : sql``}
    `);
    const disposedCount = Number(
      (Array.from(disposedRows as Iterable<Record<string, unknown>>)[0] ?? { disposed_count: 0 })
        .disposed_count,
    );

    // ── Total monthly depreciation (straight-line equivalent) ───────
    // For active assets only: (acquisition_cost - salvage_value) / useful_life_months
    const monthlyRows = await tx.execute(sql`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN useful_life_months > 0
              THEN (acquisition_cost - salvage_value) / useful_life_months
              ELSE 0
            END
          ),
          0
        ) AS total_monthly_depreciation
      FROM fixed_assets
      WHERE tenant_id = ${input.tenantId}
        AND status = 'active'
        ${input.locationId ? sql`AND location_id = ${input.locationId}` : sql``}
    `);
    const totalMonthlyDepreciation = Math.round(
      Number(
        (Array.from(monthlyRows as Iterable<Record<string, unknown>>)[0] ?? {
          total_monthly_depreciation: 0,
        }).total_monthly_depreciation,
      ) * 100,
    ) / 100;

    // ── Aggregate totals from categories ────────────────────────────
    let totalAssets = 0;
    let totalCost = 0;
    let totalAccumulatedDepreciation = 0;
    let totalNetBookValue = 0;
    let fullyDepreciatedCount = 0;

    for (const cat of categories) {
      totalAssets += cat.assetCount;
      totalCost += cat.totalCost;
      totalAccumulatedDepreciation += cat.totalAccumulatedDepreciation;
      totalNetBookValue += cat.totalNetBookValue;
      fullyDepreciatedCount += cat.fullyDepreciatedCount;
    }

    totalCost = Math.round(totalCost * 100) / 100;
    totalAccumulatedDepreciation = Math.round(totalAccumulatedDepreciation * 100) / 100;
    totalNetBookValue = Math.round(totalNetBookValue * 100) / 100;

    return {
      totalAssets,
      totalCost,
      totalAccumulatedDepreciation,
      totalNetBookValue,
      totalMonthlyDepreciation,
      fullyDepreciatedCount,
      disposedCount,
      categories,
    };
  });
}
