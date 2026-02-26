import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { parseLimit } from '@/lib/api-params';
import {
  db,
  sql,
  semanticMetricGoals,
  semanticAlertNotifications,
  semanticAnalysisFindings,
  semanticUserPreferences,
} from '@oppsera/db';

// ── GET /api/v1/semantic/feed ─────────────────────────────────────
// Returns a role-based insight feed combining:
//   - KPI snapshots (from read models based on user's preferred metrics)
//   - Active goal pacing summaries
//   - Recent unread alert notifications
//   - Recent unread background findings
//   - Suggested questions based on user's role and preferences
//
// Supports: ?limit=20 (max items per section)

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get('limit'), 50, 10);
    const todayStr = new Date().toISOString().split('T')[0]!;

    // Fetch user preferences for personalization
    const [prefs] = await db
      .select()
      .from(semanticUserPreferences)
      .where(
        and(
          eq(semanticUserPreferences.tenantId, ctx.tenantId),
          eq(semanticUserPreferences.userId, ctx.user.id),
        ),
      );

    // Fetch KPI snapshots from read models
    const kpiMetrics = prefs?.preferredMetrics
      ? Object.keys(prefs.preferredMetrics).slice(0, 6)
      : ['net_sales', 'order_count', 'avg_order_value'];

    const kpiResults: Array<{ metricSlug: string; todayValue: number; yesterdayValue: number; changePct: number }> = [];

    const metricExprMap: Record<string, string> = {
      net_sales: 'COALESCE(SUM(net_sales), 0)',
      gross_sales: 'COALESCE(SUM(gross_sales), 0)',
      order_count: 'COALESCE(SUM(order_count), 0)',
      avg_order_value: 'CASE WHEN SUM(order_count) > 0 THEN SUM(net_sales) / SUM(order_count) ELSE 0 END',
      void_count: 'COALESCE(SUM(void_count), 0)',
      discount_total: 'COALESCE(SUM(discount_total), 0)',
      tax_total: 'COALESCE(SUM(tax_total), 0)',
    };

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]!;

    for (const metric of kpiMetrics) {
      const sqlExpr = metricExprMap[metric];
      if (!sqlExpr) continue;

      try {
        const locationFilter = prefs?.preferredLocationId
          ? sql`AND location_id = ${prefs.preferredLocationId}`
          : sql``;

        const [todayResult, yesterdayResult] = await Promise.all([
          db.execute(sql`
            SELECT ${sql.raw(sqlExpr)} AS value
            FROM rm_daily_sales
            WHERE tenant_id = ${ctx.tenantId}
              AND business_date = ${todayStr}
              ${locationFilter}
          `),
          db.execute(sql`
            SELECT ${sql.raw(sqlExpr)} AS value
            FROM rm_daily_sales
            WHERE tenant_id = ${ctx.tenantId}
              AND business_date = ${yesterdayStr}
              ${locationFilter}
          `),
        ]);

        const todayRows = Array.from(todayResult as Iterable<{ value: string | number }>);
        const yesterdayRows = Array.from(yesterdayResult as Iterable<{ value: string | number }>);
        const todayValue = todayRows[0]?.value !== null && todayRows[0]?.value !== undefined ? Number(todayRows[0].value) : 0;
        const yesterdayValue = yesterdayRows[0]?.value !== null && yesterdayRows[0]?.value !== undefined ? Number(yesterdayRows[0].value) : 0;
        const changePct = yesterdayValue > 0 ? ((todayValue - yesterdayValue) / yesterdayValue) * 100 : 0;

        kpiResults.push({
          metricSlug: metric,
          todayValue,
          yesterdayValue,
          changePct: Math.round(changePct * 100) / 100,
        });
      } catch (err) {
        console.warn(`[semantic/feed] Failed to fetch KPI for ${metric}:`, err);
      }
    }

    // Fetch active goal pacing summaries
    const activeGoals = await db
      .select({
        id: semanticMetricGoals.id,
        metricSlug: semanticMetricGoals.metricSlug,
        targetValue: semanticMetricGoals.targetValue,
        periodType: semanticMetricGoals.periodType,
        periodStart: semanticMetricGoals.periodStart,
        periodEnd: semanticMetricGoals.periodEnd,
        notes: semanticMetricGoals.notes,
      })
      .from(semanticMetricGoals)
      .where(
        and(
          eq(semanticMetricGoals.tenantId, ctx.tenantId),
          eq(semanticMetricGoals.isActive, true),
        ),
      )
      .orderBy(desc(semanticMetricGoals.createdAt))
      .limit(limit);

    // Fetch recent unread alerts
    const unreadAlerts = await db
      .select({
        id: semanticAlertNotifications.id,
        title: semanticAlertNotifications.title,
        body: semanticAlertNotifications.body,
        severity: semanticAlertNotifications.severity,
        metricSlug: semanticAlertNotifications.metricSlug,
        metricValue: semanticAlertNotifications.metricValue,
        createdAt: semanticAlertNotifications.createdAt,
      })
      .from(semanticAlertNotifications)
      .where(
        and(
          eq(semanticAlertNotifications.tenantId, ctx.tenantId),
          eq(semanticAlertNotifications.isRead, false),
          eq(semanticAlertNotifications.isDismissed, false),
        ),
      )
      .orderBy(desc(semanticAlertNotifications.createdAt))
      .limit(limit);

    // Fetch recent unread findings
    const unreadFindings = await db
      .select({
        id: semanticAnalysisFindings.id,
        findingType: semanticAnalysisFindings.findingType,
        title: semanticAnalysisFindings.title,
        summary: semanticAnalysisFindings.summary,
        priority: semanticAnalysisFindings.priority,
        confidence: semanticAnalysisFindings.confidence,
        changePct: semanticAnalysisFindings.changePct,
        createdAt: semanticAnalysisFindings.createdAt,
      })
      .from(semanticAnalysisFindings)
      .where(
        and(
          eq(semanticAnalysisFindings.tenantId, ctx.tenantId),
          eq(semanticAnalysisFindings.isRead, false),
          eq(semanticAnalysisFindings.isDismissed, false),
        ),
      )
      .orderBy(desc(semanticAnalysisFindings.createdAt))
      .limit(limit);

    // Build suggested questions based on role
    const userRole = prefs?.insightFeedRole ?? 'staff';
    const suggestedQuestions = getSuggestedQuestionsForRole(userRole);

    return NextResponse.json({
      data: {
        kpis: kpiResults,
        goals: activeGoals.map((g) => ({
          id: g.id,
          metricSlug: g.metricSlug,
          targetValue: Number(g.targetValue),
          periodType: g.periodType,
          periodStart: g.periodStart,
          periodEnd: g.periodEnd,
          notes: g.notes ?? null,
        })),
        alerts: unreadAlerts.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          severity: a.severity,
          metricSlug: a.metricSlug ?? null,
          metricValue: a.metricValue ? Number(a.metricValue) : null,
          createdAt: a.createdAt,
        })),
        findings: unreadFindings.map((f) => ({
          id: f.id,
          findingType: f.findingType,
          title: f.title,
          summary: f.summary,
          priority: f.priority,
          confidence: f.confidence ? Number(f.confidence) : null,
          changePct: f.changePct ? Number(f.changePct) : null,
          createdAt: f.createdAt,
        })),
        suggestedQuestions,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── Role-based question suggestions ──────────────────────────────

function getSuggestedQuestionsForRole(role: string): string[] {
  const roleQuestions: Record<string, string[]> = {
    owner: [
      'How are sales trending this month compared to last month?',
      'Which locations are underperforming?',
      'What is our customer retention rate?',
      'Show me the top 10 items by revenue this week',
      'What are our busiest hours?',
    ],
    manager: [
      'How did we do today compared to yesterday?',
      'Which items have the highest margin?',
      'Show me labor cost as a percentage of sales',
      'What is the average ticket size by day of week?',
      'Are there any items running low on inventory?',
    ],
    supervisor: [
      'What were total sales today?',
      'How many orders did we process this shift?',
      'Which servers have the highest average check?',
      'Show me voids and comps for today',
    ],
    cashier: [
      'How many transactions have I processed today?',
      'What is the most popular item today?',
    ],
    server: [
      'What are our specials performing like?',
      'How do my sales compare to other servers?',
    ],
    staff: [
      'What were total sales today?',
      'How are we trending this week?',
      'Show me the top selling items',
    ],
  };

  return roleQuestions[role] ?? roleQuestions['staff']!;
}
