import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { ValidationError } from '@oppsera/shared';

// ── Allowed metric slugs → rm_daily_sales column names ───────────
// Static allowlist prevents SQL injection — only known columns accepted.

const METRIC_COLUMN_MAP: Record<string, string> = {
  net_sales: 'net_sales',
  gross_sales: 'gross_sales',
  order_count: 'order_count',
  avg_order_value: 'avg_order_value',
  discount_total: 'discount_total',
  tax_total: 'tax_total',
  void_count: 'void_count',
  void_total: 'void_total',
  tender_cash: 'tender_cash',
  tender_card: 'tender_card',
  tender_gift_card: 'tender_gift_card',
  tender_house_account: 'tender_house_account',
  tender_ach: 'tender_ach',
  tender_other: 'tender_other',
  tip_total: 'tip_total',
  service_charge_total: 'service_charge_total',
  surcharge_total: 'surcharge_total',
  return_total: 'return_total',
  pms_revenue: 'pms_revenue',
  ar_revenue: 'ar_revenue',
  membership_revenue: 'membership_revenue',
  voucher_revenue: 'voucher_revenue',
  spa_revenue: 'spa_revenue',
  total_business_revenue: 'total_business_revenue',
};

// Integer columns use SUM and return as int; numeric columns use SUM and return as float
const INTEGER_COLUMNS = new Set(['order_count', 'void_count']);

// ── Validation ────────────────────────────────────────────────────

const metricsQuerySchema = z.object({
  slugs: z.array(z.string().min(1).max(128)).min(1).max(20),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── POST /api/v1/semantic/metrics-query ───────────────────────────
// Structured metrics query against rm_daily_sales.
// Returns daily values for each requested metric slug.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = metricsQuerySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { slugs, startDate, endDate } = parsed.data;

    // Validate all slugs are known
    const unknownSlugs = slugs.filter((s) => !METRIC_COLUMN_MAP[s]);
    if (unknownSlugs.length > 0) {
      throw new ValidationError('Unknown metric slugs', unknownSlugs.map((s) => ({
        field: 'slugs',
        message: `Unknown metric: "${s}"`,
      })));
    }

    // Build SELECT columns — safe because we only use values from METRIC_COLUMN_MAP
    const selectCols = slugs.map((slug) => {
      const col = METRIC_COLUMN_MAP[slug]!;
      if (INTEGER_COLUMNS.has(col)) {
        return sql.raw(`COALESCE(SUM(${col}), 0)::int AS "${slug}"`);
      }
      return sql.raw(`COALESCE(SUM(${col}), 0)::numeric AS "${slug}"`);
    });

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const locFilter = ctx.locationId
        ? sql` AND location_id = ${ctx.locationId}`
        : sql``;

      const rows = await tx.execute(sql`
        SELECT
          business_date AS date,
          ${sql.join(selectCols, sql`, `)}
        FROM rm_daily_sales
        WHERE tenant_id = ${ctx.tenantId}
          AND business_date >= ${startDate}
          AND business_date <= ${endDate}
          ${locFilter}
        GROUP BY business_date
        ORDER BY business_date ASC
      `);

      return Array.from(rows as Iterable<Record<string, unknown>>);
    });

    // Build per-metric response with sparkline + change %
    const metrics: Record<string, {
      values: number[];
      dates: string[];
      current: number | null;
      previous: number | null;
      changePercent: number | null;
    }> = {};

    for (const slug of slugs) {
      const values = result.map((row) => Number(row[slug]) || 0);
      const dates = result.map((row) => String(row.date));
      const current = values.length > 0 ? values[values.length - 1]! : null;
      const previous = values.length > 1 ? values[0]! : null;
      const changePercent =
        current != null && previous != null && previous !== 0
          ? ((current - previous) / Math.abs(previous)) * 100
          : null;

      metrics[slug] = { values, dates, current, previous, changePercent };
    }

    return NextResponse.json({ data: metrics });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
