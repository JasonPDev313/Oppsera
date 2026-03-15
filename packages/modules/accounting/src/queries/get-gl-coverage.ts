import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export interface GlCoverageModule {
  sourceModule: string;
  salesDollars: number;
  glRevenueDollars: number;
  glEntryCount: number;
  varianceDollars: number;
  variancePct: number;
  status: 'ok' | 'warning' | 'critical';
}

export interface GlCoverageReport {
  tenantId: string;
  periodDays: number;
  modules: GlCoverageModule[];
  overallStatus: 'ok' | 'warning' | 'critical';
  checkedAt: string;
}

/**
 * Compares sales pipeline revenue (rm_revenue_activity) against GL journal
 * entries per source module. Returns a coverage report that flags modules
 * where revenue exists but GL entries are missing or significantly divergent.
 *
 * Thresholds:
 *   - ok:       variance < 5%
 *   - warning:  variance 5–25%
 *   - critical: variance > 25% OR zero GL entries with non-zero sales
 */
export async function getGlCoverage(
  tenantId: string,
  periodDays = 7,
): Promise<GlCoverageReport> {
  const result = await db.execute(sql`
    WITH sales AS (
      SELECT
        source_sub_type,
        SUM(CASE WHEN status != 'voided' THEN amount_dollars ELSE 0 END) AS total_dollars,
        COUNT(CASE WHEN status != 'voided' THEN 1 END)::int AS order_count
      FROM rm_revenue_activity
      WHERE tenant_id = ${tenantId}
        AND source = 'pos_order'
        AND business_date >= CURRENT_DATE - ${periodDays}
      GROUP BY source_sub_type
    ),
    gl AS (
      SELECT
        source_module,
        COUNT(*)::int AS entry_count
      FROM gl_journal_entries
      WHERE tenant_id = ${tenantId}
        AND source_module IN ('pos', 'fnb')
        AND status != 'voided'
        AND business_date >= CURRENT_DATE - ${periodDays}
      GROUP BY source_module
    )
    SELECT
      s.source_sub_type,
      s.total_dollars::numeric AS sales_dollars,
      s.order_count,
      COALESCE(g.entry_count, 0) AS gl_entry_count
    FROM sales s
    LEFT JOIN gl g ON (
      (s.source_sub_type = 'pos_retail' AND g.source_module = 'pos')
      OR (s.source_sub_type = 'pos_fnb' AND g.source_module = 'fnb')
    )
    ORDER BY s.source_sub_type
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);

  const modules: GlCoverageModule[] = rows.map((row) => {
    const salesDollars = Number(row.sales_dollars) || 0;
    const glEntryCount = Number(row.gl_entry_count) || 0;
    const orderCount = Number(row.order_count) || 0;

    // Estimate GL revenue from entry count vs order count ratio
    // (actual line-level comparison is too expensive for a health check)
    const coverageRatio = orderCount > 0 ? glEntryCount / orderCount : 0;
    const estimatedGlRevenue = salesDollars * Math.min(coverageRatio, 1);
    const varianceDollars = salesDollars - estimatedGlRevenue;
    const variancePct = salesDollars > 0 ? (varianceDollars / salesDollars) * 100 : 0;

    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (glEntryCount === 0 && salesDollars > 0) {
      status = 'critical';
    } else if (variancePct > 25) {
      status = 'critical';
    } else if (variancePct > 5) {
      status = 'warning';
    }

    return {
      sourceModule: row.source_sub_type as string,
      salesDollars: Math.round(salesDollars * 100) / 100,
      glRevenueDollars: Math.round(estimatedGlRevenue * 100) / 100,
      glEntryCount,
      varianceDollars: Math.round(varianceDollars * 100) / 100,
      variancePct: Math.round(variancePct * 10) / 10,
      status,
    };
  });

  const overallStatus = modules.some((m) => m.status === 'critical')
    ? 'critical'
    : modules.some((m) => m.status === 'warning')
      ? 'warning'
      : 'ok';

  return {
    tenantId,
    periodDays,
    modules,
    overallStatus,
    checkedAt: new Date().toISOString(),
  };
}
