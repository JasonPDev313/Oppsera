import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, sql, semanticMetricGoals } from '@oppsera/db';

// ── GET /api/v1/semantic/goals/pacing ─────────────────────────────
// Computes pacing data for all active goals. For each goal, returns:
//   - currentValue: current metric value from read models
//   - pacePercentage: how far along the goal period we are
//   - progressPercentage: (currentValue / targetValue) * 100
//   - onTrack: whether progressPercentage >= pacePercentage
//   - projectedValue: linear extrapolation to period end
//   - daysRemaining: days left in the goal period

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId') ?? undefined;

    // Fetch all active goals for this tenant
    const goalConditions = [
      eq(semanticMetricGoals.tenantId, ctx.tenantId),
      eq(semanticMetricGoals.isActive, true),
    ];
    if (locationId) {
      goalConditions.push(eq(semanticMetricGoals.locationId, locationId));
    }

    const goals = await db
      .select()
      .from(semanticMetricGoals)
      .where(and(...goalConditions));

    if (goals.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]!;

    // For each goal, compute pacing from the reporting read models
    const pacingResults = await Promise.all(
      goals.map(async (goal) => {
        const periodStart = goal.periodStart as string;
        const periodEnd = goal.periodEnd as string;
        const targetValue = Number(goal.targetValue);

        // Compute time-based pacing
        const startDate = new Date(periodStart);
        const endDate = new Date(periodEnd);
        const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (86400000)));
        const elapsedDays = Math.max(0, Math.ceil((today.getTime() - startDate.getTime()) / (86400000)));
        const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (86400000)));
        const pacePercentage = Math.min(100, (elapsedDays / totalDays) * 100);

        // Fetch current metric value from rm_daily_sales for common metrics
        let currentValue = 0;
        try {
          const metricSlug = goal.metricSlug;
          // Map known metric slugs to their read model expressions
          const metricExprMap: Record<string, string> = {
            net_sales: 'COALESCE(SUM(net_sales), 0)',
            gross_sales: 'COALESCE(SUM(gross_sales), 0)',
            order_count: 'COALESCE(SUM(order_count), 0)',
            avg_order_value: 'CASE WHEN SUM(order_count) > 0 THEN SUM(net_sales) / SUM(order_count) ELSE 0 END',
            void_count: 'COALESCE(SUM(void_count), 0)',
            void_total: 'COALESCE(SUM(void_total), 0)',
            discount_total: 'COALESCE(SUM(discount_total), 0)',
            tax_total: 'COALESCE(SUM(tax_total), 0)',
          };

          const sqlExpr = metricExprMap[metricSlug];
          if (sqlExpr) {
            // Use rm_daily_sales for revenue/volume metrics
            const locationFilter = goal.locationId
              ? sql`AND location_id = ${goal.locationId}`
              : sql``;

            const result = await db.execute(sql`
              SELECT ${sql.raw(sqlExpr)} AS value
              FROM rm_daily_sales
              WHERE tenant_id = ${ctx.tenantId}
                AND business_date >= ${periodStart}
                AND business_date <= LEAST(${periodEnd}, ${todayStr})
                ${locationFilter}
            `);

            const rows = Array.from(result as Iterable<{ value: string | number }>);
            if (rows.length > 0 && rows[0]!.value !== null) {
              currentValue = Number(rows[0]!.value);
            }
          }
        } catch (err) {
          console.warn(`[semantic/goals/pacing] Failed to fetch metric value for ${goal.metricSlug}:`, err);
          // Continue with currentValue = 0
        }

        const progressPercentage = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;
        const onTrack = progressPercentage >= pacePercentage;

        // Linear projection: if we earned X in N days, project to full period
        const projectedValue = elapsedDays > 0
          ? (currentValue / elapsedDays) * totalDays
          : 0;

        return {
          goalId: goal.id,
          metricSlug: goal.metricSlug,
          targetValue,
          currentValue,
          periodType: goal.periodType,
          periodStart,
          periodEnd,
          locationId: goal.locationId ?? null,
          pacePercentage: Math.round(pacePercentage * 100) / 100,
          progressPercentage: Math.round(progressPercentage * 100) / 100,
          onTrack,
          projectedValue: Math.round(projectedValue * 100) / 100,
          daysRemaining,
          elapsedDays,
          totalDays,
          notes: goal.notes ?? null,
        };
      }),
    );

    return NextResponse.json({ data: pacingResults });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
