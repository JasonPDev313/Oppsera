import { eq, and, gte, lte, sql, desc, asc } from 'drizzle-orm';
import { withTenant, rmSpaServiceMetrics, spaServices } from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────

export interface GetServiceAnalyticsInput {
  tenantId: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  limit?: number;      // max services to return (default 50)
  sortBy?: 'revenue' | 'bookings' | 'completions' | 'name'; // default: revenue
}

export interface ServiceAnalyticsRow {
  serviceId: string;
  serviceName: string;
  bookingCount: number;
  completedCount: number;
  canceledCount: number;
  totalRevenue: number;           // dollars from read model
  avgPriceCents: number;
  packageRedemptions: number;
  addonAttachmentRate: number;    // percentage
  avgDurationMinutes: number;
  completionRate: number;         // completed / bookings * 100
}

export interface GetServiceAnalyticsResult {
  items: ServiceAnalyticsRow[];
}

// ── Query ────────────────────────────────────────────────────────

/**
 * Aggregate service analytics from the rm_spa_service_metrics read model.
 * Groups by serviceId across the date range, resolves service names,
 * and computes derived fields (completionRate).
 */
export async function getServiceAnalytics(
  input: GetServiceAnalyticsInput,
): Promise<GetServiceAnalyticsResult> {
  const limit = input.limit ?? 50;
  const sortBy = input.sortBy ?? 'revenue';

  return withTenant(input.tenantId, async (tx) => {
    // 1. Aggregate service metrics over the date range
    const orderByExpr = (() => {
      switch (sortBy) {
        case 'bookings':
          return desc(sql`sum(${rmSpaServiceMetrics.bookingCount})`);
        case 'completions':
          return desc(sql`sum(${rmSpaServiceMetrics.completedCount})`);
        case 'name':
          return asc(sql`min(${rmSpaServiceMetrics.serviceId})`); // placeholder, resolved later
        default:
          return desc(sql`sum(${rmSpaServiceMetrics.totalRevenue}::numeric)`);
      }
    })();

    const metricsRows = await tx
      .select({
        serviceId: rmSpaServiceMetrics.serviceId,
        bookingCount: sql<number>`sum(${rmSpaServiceMetrics.bookingCount})::int`,
        completedCount: sql<number>`sum(${rmSpaServiceMetrics.completedCount})::int`,
        canceledCount: sql<number>`sum(${rmSpaServiceMetrics.canceledCount})::int`,
        totalRevenue: sql<number>`sum(${rmSpaServiceMetrics.totalRevenue}::numeric)::numeric`,
        avgPriceCents: sql<number>`CASE WHEN sum(${rmSpaServiceMetrics.completedCount}) > 0
          THEN (sum(${rmSpaServiceMetrics.avgPriceCents}::bigint * ${rmSpaServiceMetrics.completedCount}::bigint) / sum(${rmSpaServiceMetrics.completedCount}))::int
          ELSE 0 END`,
        packageRedemptions: sql<number>`sum(${rmSpaServiceMetrics.packageRedemptions})::int`,
        addonAttachmentRate: sql<number>`CASE WHEN sum(${rmSpaServiceMetrics.completedCount}) > 0
          THEN round(sum(${rmSpaServiceMetrics.addonAttachmentRate}::numeric * ${rmSpaServiceMetrics.completedCount}::numeric) / sum(${rmSpaServiceMetrics.completedCount}::numeric), 2)::numeric
          ELSE 0 END`,
        avgDurationMinutes: sql<number>`CASE WHEN sum(${rmSpaServiceMetrics.completedCount}) > 0
          THEN (sum(${rmSpaServiceMetrics.avgDurationMinutes}::bigint * ${rmSpaServiceMetrics.completedCount}::bigint) / sum(${rmSpaServiceMetrics.completedCount}))::int
          ELSE 0 END`,
      })
      .from(rmSpaServiceMetrics)
      .where(
        and(
          eq(rmSpaServiceMetrics.tenantId, input.tenantId),
          gte(rmSpaServiceMetrics.businessDate, input.startDate),
          lte(rmSpaServiceMetrics.businessDate, input.endDate),
        ),
      )
      .groupBy(rmSpaServiceMetrics.serviceId)
      .orderBy(orderByExpr)
      .limit(limit);

    if (metricsRows.length === 0) {
      return { items: [] };
    }

    // 2. Resolve service names
    const serviceIds = metricsRows.map((r) => r.serviceId);
    const serviceRows = await tx
      .select({ id: spaServices.id, name: spaServices.name })
      .from(spaServices)
      .where(
        and(
          eq(spaServices.tenantId, input.tenantId),
          sql`${spaServices.id} IN (${sql.join(
            serviceIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );

    const nameMap = new Map(serviceRows.map((s) => [s.id, s.name]));

    // 3. Map and compute derived fields
    const items: ServiceAnalyticsRow[] = metricsRows.map((r) => {
      const bookingCount = r.bookingCount;
      const completedCount = r.completedCount;
      const completionRate =
        bookingCount > 0
          ? Math.round((completedCount / bookingCount) * 10000) / 100
          : 0;

      return {
        serviceId: r.serviceId,
        serviceName: nameMap.get(r.serviceId) ?? 'Unknown',
        bookingCount,
        completedCount,
        canceledCount: r.canceledCount,
        totalRevenue: Number(r.totalRevenue),
        avgPriceCents: r.avgPriceCents,
        packageRedemptions: r.packageRedemptions,
        addonAttachmentRate: Number(r.addonAttachmentRate),
        avgDurationMinutes: r.avgDurationMinutes,
        completionRate,
      };
    });

    // Sort by name if requested (name wasn't available in the SQL)
    if (sortBy === 'name') {
      items.sort((a, b) => a.serviceName.localeCompare(b.serviceName));
    }

    return { items };
  });
}
