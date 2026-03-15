import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { ValidationError } from '@oppsera/shared';
import { getMetric } from '@oppsera/module-semantic/registry';
import type { MetricDef } from '@oppsera/module-semantic/registry';

// ── Tables that support date-range sparklines ─────────────────────
const DATE_RANGE_TABLES = new Set(['rm_daily_sales', 'rm_item_sales']);

// ── Validation ────────────────────────────────────────────────────

const metricsQuerySchema = z.object({
  slugs: z.array(z.string().min(1).max(128)).min(1).max(30),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── Metric result shape ───────────────────────────────────────────

interface MetricResult {
  values: number[];
  dates: string[];
  current: number | null;
  previous: number | null;
  changePercent: number | null;
}

// ── POST /api/v1/semantic/metrics-query ───────────────────────────
// Structured metrics query using the semantic registry.
// Groups metrics by source table and queries each table separately.
// Date-range tables return daily sparklines; snapshot tables return current values.

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

    // Look up each slug in the registry
    const metricDefs: MetricDef[] = [];
    const unknownSlugs: string[] = [];
    for (const slug of slugs) {
      try {
        const def = await getMetric(slug);
        metricDefs.push(def);
      } catch {
        unknownSlugs.push(slug);
      }
    }

    if (unknownSlugs.length > 0) {
      throw new ValidationError('Unknown metric slugs', unknownSlugs.map((s) => ({
        field: 'slugs',
        message: `Unknown metric: "${s}"`,
      })));
    }

    // Group metrics by source table
    const byTable = new Map<string, MetricDef[]>();
    for (const def of metricDefs) {
      const group = byTable.get(def.sqlTable) ?? [];
      group.push(def);
      byTable.set(def.sqlTable, group);
    }

    const results: Record<string, MetricResult> = {};

    await withTenant(ctx.tenantId, async (tx) => {
      const locFilter = ctx.locationId
        ? sql` AND location_id = ${ctx.locationId}`
        : sql``;

      for (const [table, tableDefs] of byTable) {
        if (DATE_RANGE_TABLES.has(table)) {
          // ── Date-range query: daily sparklines ──
          const selectCols = tableDefs.map((def) => {
            // Use the registry's sqlExpression directly (e.g. "SUM(quantity_sold)")
            // For rm_daily_sales metrics with simple column names, wrap in COALESCE+SUM
            const expr = def.sqlExpression;
            const isSimpleColumn = /^[a-z_]+$/.test(expr);
            if (isSimpleColumn) {
              return sql.raw(`COALESCE(SUM(${expr}), 0)::numeric AS "${def.slug}"`);
            }
            // Complex expressions (e.g. "SUM(quantity_sold)") — wrap in COALESCE
            return sql.raw(`COALESCE(${expr}, 0)::numeric AS "${def.slug}"`);
          });

          const rows = await tx.execute(sql`
            SELECT
              business_date AS date,
              ${sql.join(selectCols, sql`, `)}
            FROM ${sql.raw(table)}
            WHERE tenant_id = ${ctx.tenantId}
              AND business_date >= ${startDate}
              AND business_date <= ${endDate}
              ${locFilter}
            GROUP BY business_date
            ORDER BY business_date ASC
          `);

          const rowArr = Array.from(rows as Iterable<Record<string, unknown>>);

          for (const def of tableDefs) {
            const values = rowArr.map((row) => Number(row[def.slug]) || 0);
            const dates = rowArr.map((row) => String(row.date));
            const current = values.length > 0 ? values[values.length - 1]! : null;
            const previous = values.length > 1 ? values[0]! : null;
            const changePercent =
              current != null && previous != null && previous !== 0
                ? ((current - previous) / Math.abs(previous)) * 100
                : null;

            results[def.slug] = { values, dates, current, previous, changePercent };
          }
        } else {
          // ── Snapshot query: current aggregate value, no sparkline ──
          const selectCols = tableDefs.map((def) => {
            const expr = def.sqlExpression;
            return sql.raw(`COALESCE((${expr})::numeric, 0) AS "${def.slug}"`);
          });

          const rows = await tx.execute(sql`
            SELECT ${sql.join(selectCols, sql`, `)}
            FROM ${sql.raw(table)}
            WHERE tenant_id = ${ctx.tenantId}
              ${locFilter}
          `);

          const rowArr = Array.from(rows as Iterable<Record<string, unknown>>);
          const row = rowArr[0] ?? {};

          for (const def of tableDefs) {
            const val = Number(row[def.slug]) || 0;
            results[def.slug] = {
              values: [val],
              dates: [],
              current: val,
              previous: null,
              changePercent: null,
            };
          }
        }
      }
    });

    return NextResponse.json({ data: results });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
