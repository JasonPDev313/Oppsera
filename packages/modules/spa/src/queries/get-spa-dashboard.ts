import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaProviders,
  spaServices,
  rmSpaDailyOperations,
  rmSpaProviderMetrics,
  rmSpaServiceMetrics,
} from '@oppsera/db';

export interface SpaDashboardMetrics {
  /** Today's appointment counts by status */
  today: {
    totalAppointments: number;
    confirmed: number;
    checkedIn: number;
    inService: number;
    completed: number;
    canceled: number;
    noShow: number;
  };
  /** Revenue from read model (dollars) or computed from today's appointments */
  revenue: {
    totalRevenue: number;
    serviceRevenue: number;
    addonRevenue: number;
    retailRevenue: number;
    tipTotal: number;
  };
  /** Provider utilization for today */
  providerUtilization: Array<{
    providerId: string;
    providerName: string;
    providerColor: string | null;
    appointmentCount: number;
    completedCount: number;
    utilizationPct: number;
    totalRevenue: number;
  }>;
  /** Top services by booking count over the period */
  topServices: Array<{
    serviceId: string;
    serviceName: string;
    bookingCount: number;
    totalRevenue: number;
    completedCount: number;
  }>;
  /** Operational KPIs */
  kpis: {
    avgAppointmentDuration: number;
    utilizationPct: number;
    rebookingRate: number;
    noShowRate: number;
    walkInCount: number;
    onlineBookingCount: number;
  };
}

/**
 * Get spa dashboard metrics for a location on a specific date.
 * Prefers CQRS read models (rm_spa_*) when available, falls back to
 * counting from the operational spaAppointments table.
 * Used by the spa manager dashboard.
 */
export async function getSpaDashboard(input: {
  tenantId: string;
  locationId: string;
  date: string; // YYYY-MM-DD — typically today
}): Promise<SpaDashboardMetrics> {
  return withTenant(input.tenantId, async (tx) => {
    const dateObj = new Date(input.date);
    const dayStart = new Date(dateObj);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dateObj);
    dayEnd.setHours(23, 59, 59, 999);

    // Fetch read model data, today's appointments, provider metrics,
    // and service metrics in parallel
    const [dailyOps, todayAppointments, providerMetrics, serviceMetrics] = await Promise.all([
      // 1. Read model daily operations
      tx
        .select({
          totalRevenue: rmSpaDailyOperations.totalRevenue,
          serviceRevenue: rmSpaDailyOperations.serviceRevenue,
          addonRevenue: rmSpaDailyOperations.addonRevenue,
          retailRevenue: rmSpaDailyOperations.retailRevenue,
          tipTotal: rmSpaDailyOperations.tipTotal,
          avgAppointmentDuration: rmSpaDailyOperations.avgAppointmentDuration,
          utilizationPct: rmSpaDailyOperations.utilizationPct,
          rebookingRate: rmSpaDailyOperations.rebookingRate,
          walkInCount: rmSpaDailyOperations.walkInCount,
          onlineBookingCount: rmSpaDailyOperations.onlineBookingCount,
          appointmentCount: rmSpaDailyOperations.appointmentCount,
          noShowCount: rmSpaDailyOperations.noShowCount,
        })
        .from(rmSpaDailyOperations)
        .where(
          and(
            eq(rmSpaDailyOperations.tenantId, input.tenantId),
            eq(rmSpaDailyOperations.locationId, input.locationId),
            eq(rmSpaDailyOperations.businessDate, input.date),
          ),
        )
        .limit(1),

      // 2. Today's appointments from operational table (always accurate)
      tx
        .select({
          status: spaAppointments.status,
          cnt: sql<number>`count(*)::int`,
        })
        .from(spaAppointments)
        .where(
          and(
            eq(spaAppointments.tenantId, input.tenantId),
            eq(spaAppointments.locationId, input.locationId),
            gte(spaAppointments.startAt, dayStart),
            lte(spaAppointments.startAt, dayEnd),
          ),
        )
        .groupBy(spaAppointments.status),

      // 3. Provider metrics from read model
      tx
        .select({
          providerId: rmSpaProviderMetrics.providerId,
          appointmentCount: rmSpaProviderMetrics.appointmentCount,
          completedCount: rmSpaProviderMetrics.completedCount,
          utilizationPct: rmSpaProviderMetrics.utilizationPct,
          totalRevenue: rmSpaProviderMetrics.totalRevenue,
        })
        .from(rmSpaProviderMetrics)
        .where(
          and(
            eq(rmSpaProviderMetrics.tenantId, input.tenantId),
            eq(rmSpaProviderMetrics.businessDate, input.date),
          ),
        ),

      // 4. Top services from read model (last 30 days for meaningful data)
      tx
        .select({
          serviceId: rmSpaServiceMetrics.serviceId,
          bookingCount: sql<number>`sum(${rmSpaServiceMetrics.bookingCount})::int`,
          completedCount: sql<number>`sum(${rmSpaServiceMetrics.completedCount})::int`,
          totalRevenue: sql<number>`sum(${rmSpaServiceMetrics.totalRevenue}::numeric)::numeric`,
        })
        .from(rmSpaServiceMetrics)
        .where(
          and(
            eq(rmSpaServiceMetrics.tenantId, input.tenantId),
            gte(
              rmSpaServiceMetrics.businessDate,
              new Date(dateObj.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            ),
            lte(rmSpaServiceMetrics.businessDate, input.date),
          ),
        )
        .groupBy(rmSpaServiceMetrics.serviceId)
        .orderBy(desc(sql`sum(${rmSpaServiceMetrics.bookingCount})`))
        .limit(10),
    ]);

    // Build today's counts from operational data
    const statusCounts: Record<string, number> = {};
    for (const row of todayAppointments) {
      statusCounts[row.status] = row.cnt;
    }

    const totalToday = Object.values(statusCounts).reduce((sum, c) => sum + c, 0);

    const today = {
      totalAppointments: totalToday,
      confirmed: statusCounts['confirmed'] ?? 0,
      checkedIn: statusCounts['checked_in'] ?? 0,
      inService: statusCounts['in_service'] ?? 0,
      completed: statusCounts['completed'] ?? 0,
      canceled: statusCounts['canceled'] ?? 0,
      noShow: statusCounts['no_show'] ?? 0,
    };

    // Revenue from read model (fallback to zeros if not populated yet)
    const ops = dailyOps[0];
    const revenue = {
      totalRevenue: ops ? Number(ops.totalRevenue) : 0,
      serviceRevenue: ops ? Number(ops.serviceRevenue) : 0,
      addonRevenue: ops ? Number(ops.addonRevenue) : 0,
      retailRevenue: ops ? Number(ops.retailRevenue) : 0,
      tipTotal: ops ? Number(ops.tipTotal) : 0,
    };

    // Resolve provider and service names in parallel (both are independent lookups)
    const providerIds = providerMetrics.map((p) => p.providerId);
    const svcIds = serviceMetrics.map((s) => s.serviceId);

    const [providerNameMap, serviceNameMap] = await Promise.all([
      // Provider name lookup
      providerIds.length > 0
        ? tx
            .select({
              id: spaProviders.id,
              displayName: spaProviders.displayName,
              color: spaProviders.color,
            })
            .from(spaProviders)
            .where(
              and(
                eq(spaProviders.tenantId, input.tenantId),
                sql`${spaProviders.id} IN (${sql.join(
                  providerIds.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
              ),
            )
            .then(
              (rows) =>
                new Map(rows.map((p) => [p.id, { name: p.displayName, color: p.color ?? null }])),
            )
        : Promise.resolve(new Map<string, { name: string; color: string | null }>()),

      // Service name lookup
      svcIds.length > 0
        ? tx
            .select({
              id: spaServices.id,
              name: spaServices.name,
            })
            .from(spaServices)
            .where(
              and(
                eq(spaServices.tenantId, input.tenantId),
                sql`${spaServices.id} IN (${sql.join(
                  svcIds.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
              ),
            )
            .then((rows) => new Map(rows.map((s) => [s.id, s.name])))
        : Promise.resolve(new Map<string, string>()),
    ]);

    const providerUtilization = providerMetrics.map((p) => {
      const info = providerNameMap.get(p.providerId);
      return {
        providerId: p.providerId,
        providerName: info?.name ?? 'Unknown',
        providerColor: info?.color ?? null,
        appointmentCount: p.appointmentCount,
        completedCount: p.completedCount,
        utilizationPct: Number(p.utilizationPct),
        totalRevenue: Number(p.totalRevenue),
      };
    });

    // Sort by utilization descending
    providerUtilization.sort((a, b) => b.utilizationPct - a.utilizationPct);

    const topServices = serviceMetrics.map((s) => ({
      serviceId: s.serviceId,
      serviceName: serviceNameMap.get(s.serviceId) ?? 'Unknown',
      bookingCount: s.bookingCount,
      totalRevenue: Number(s.totalRevenue),
      completedCount: s.completedCount,
    }));

    // Compute no-show rate from today's data
    const noShowRate =
      totalToday > 0
        ? Math.round(((statusCounts['no_show'] ?? 0) / totalToday) * 10000) / 100
        : 0;

    const kpis = {
      avgAppointmentDuration: ops?.avgAppointmentDuration ?? 0,
      utilizationPct: ops ? Number(ops.utilizationPct) : 0,
      rebookingRate: ops ? Number(ops.rebookingRate) : 0,
      noShowRate,
      walkInCount: ops?.walkInCount ?? 0,
      onlineBookingCount: ops?.onlineBookingCount ?? 0,
    };

    return {
      today,
      revenue,
      providerUtilization,
      topServices,
      kpis,
    };
  });
}
