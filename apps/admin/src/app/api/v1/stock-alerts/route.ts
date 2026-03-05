import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticAlertNotifications } from '@oppsera/db';
import { tenants } from '@oppsera/db';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

/**
 * GET /api/v1/stock-alerts
 *
 * Admin-level stock alert report. Returns inventory alert notifications
 * across all tenants (or filtered to a specific tenant).
 *
 * Query params:
 * - tenantId: filter to a specific tenant
 * - severity: 'critical' | 'warning' | 'all'
 * - daysBack: number of days to look back (default 30, max 90)
 * - limit: max results (default 100, max 500)
 */
export const GET = withAdminAuth(async (req: NextRequest) => {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId');
  const severity = url.searchParams.get('severity');
  const daysBack = Math.min(Number(url.searchParams.get('daysBack') || '30'), 90);
  const limit = Math.min(Number(url.searchParams.get('limit') || '100'), 500);

  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const conditions = [
    gte(semanticAlertNotifications.createdAt, cutoff),
    sql`${semanticAlertNotifications.metricSlug} LIKE 'inventory.%'`,
  ];

  if (tenantId) {
    conditions.push(eq(semanticAlertNotifications.tenantId, tenantId));
  }
  if (severity && severity !== 'all') {
    conditions.push(eq(semanticAlertNotifications.severity, severity));
  }

  // Alerts with tenant name
  const alerts = await db
    .select({
      id: semanticAlertNotifications.id,
      tenantId: semanticAlertNotifications.tenantId,
      tenantName: tenants.name,
      title: semanticAlertNotifications.title,
      body: semanticAlertNotifications.body,
      severity: semanticAlertNotifications.severity,
      metricSlug: semanticAlertNotifications.metricSlug,
      metricValue: semanticAlertNotifications.metricValue,
      baselineValue: semanticAlertNotifications.baselineValue,
      locationId: semanticAlertNotifications.locationId,
      isRead: semanticAlertNotifications.isRead,
      isDismissed: semanticAlertNotifications.isDismissed,
      createdAt: semanticAlertNotifications.createdAt,
    })
    .from(semanticAlertNotifications)
    .innerJoin(tenants, eq(semanticAlertNotifications.tenantId, tenants.id))
    .where(and(...conditions))
    .orderBy(desc(semanticAlertNotifications.createdAt))
    .limit(limit);

  // Summary by severity
  const summaryRows = await db
    .select({
      severity: semanticAlertNotifications.severity,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(semanticAlertNotifications)
    .where(and(...conditions))
    .groupBy(semanticAlertNotifications.severity);

  const summary: Record<string, number> = {};
  for (const row of summaryRows) {
    summary[row.severity] = row.count;
  }

  // Tenant breakdown (top 10 by alert count)
  const tenantBreakdown = await db
    .select({
      tenantId: semanticAlertNotifications.tenantId,
      tenantName: tenants.name,
      alertCount: sql<number>`COUNT(*)::int`,
      criticalCount: sql<number>`COUNT(*) FILTER (WHERE ${semanticAlertNotifications.severity} = 'critical')::int`,
      warningCount: sql<number>`COUNT(*) FILTER (WHERE ${semanticAlertNotifications.severity} = 'warning')::int`,
    })
    .from(semanticAlertNotifications)
    .innerJoin(tenants, eq(semanticAlertNotifications.tenantId, tenants.id))
    .where(
      and(
        gte(semanticAlertNotifications.createdAt, cutoff),
        sql`${semanticAlertNotifications.metricSlug} LIKE 'inventory.%'`,
      ),
    )
    .groupBy(semanticAlertNotifications.tenantId, tenants.name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  return NextResponse.json({
    data: alerts,
    meta: {
      summary,
      tenantBreakdown,
      daysBack,
      totalAlerts: alerts.length,
    },
  });
});
