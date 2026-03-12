import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaAppointmentItems,
  spaProviders,
  spaServices,
  customers,
  rmSpaDailyOperations,
  rmSpaProviderMetrics,
  rmSpaServiceMetrics,
} from '@oppsera/db';

export interface UpcomingAppointmentRow {
  id: string;
  appointmentNumber: string;
  guestName: string | null;
  providerId: string | null;
  providerName: string | null;
  serviceName: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
}

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
  /** Upcoming active appointments for today (confirmed/checked_in/in_service) */
  upcomingAppointments: UpcomingAppointmentRow[];
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
  // Validate date format before using in date arithmetic
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, got "${input.date}"`);
  }
  const parsedDate = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid date value: "${input.date}"`);
  }

  return withTenant(input.tenantId, async (tx) => {
    // Pad UTC day boundaries by 14 hours to cover all client timezone offsets.
    // The operational queries count by status (always accurate for the padded
    // range) and the dashboard KPIs come from date-keyed read models.
    const dayStart = new Date(parsedDate.getTime() - 14 * 60 * 60 * 1000);
    const dayEnd = new Date(new Date(`${input.date}T23:59:59.999Z`).getTime() + 14 * 60 * 60 * 1000);

    const thirtyDaysAgo = new Date(parsedDate.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    // All 5 queries fire in a single parallel batch — no sequential Phase 2
    const [dailyOps, todayAppointments, providerMetrics, serviceMetrics, upcomingRows] = await Promise.all([
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

      // 3. Provider metrics — JOIN provider names/colors directly (eliminates Phase 2 lookup)
      tx
        .select({
          providerId: rmSpaProviderMetrics.providerId,
          providerName: spaProviders.displayName,
          providerColor: spaProviders.color,
          appointmentCount: rmSpaProviderMetrics.appointmentCount,
          completedCount: rmSpaProviderMetrics.completedCount,
          utilizationPct: rmSpaProviderMetrics.utilizationPct,
          totalRevenue: rmSpaProviderMetrics.totalRevenue,
        })
        .from(rmSpaProviderMetrics)
        .leftJoin(spaProviders, eq(rmSpaProviderMetrics.providerId, spaProviders.id))
        .where(
          and(
            eq(rmSpaProviderMetrics.tenantId, input.tenantId),
            eq(rmSpaProviderMetrics.businessDate, input.date),
          ),
        ),

      // 4. Top services — JOIN service names directly (eliminates Phase 2 lookup)
      tx
        .select({
          serviceId: rmSpaServiceMetrics.serviceId,
          serviceName: spaServices.name,
          bookingCount: sql<number>`sum(${rmSpaServiceMetrics.bookingCount})::int`,
          completedCount: sql<number>`sum(${rmSpaServiceMetrics.completedCount})::int`,
          totalRevenue: sql<number>`sum(${rmSpaServiceMetrics.totalRevenue}::numeric)::numeric`,
        })
        .from(rmSpaServiceMetrics)
        .leftJoin(spaServices, eq(rmSpaServiceMetrics.serviceId, spaServices.id))
        .where(
          and(
            eq(rmSpaServiceMetrics.tenantId, input.tenantId),
            gte(rmSpaServiceMetrics.businessDate, thirtyDaysAgo),
            lte(rmSpaServiceMetrics.businessDate, input.date),
          ),
        )
        .groupBy(rmSpaServiceMetrics.serviceId, spaServices.name)
        .orderBy(desc(sql`sum(${rmSpaServiceMetrics.bookingCount})`))
        .limit(10),

      // 5. Upcoming appointments — JOIN first service name via lateral subquery (eliminates Phase 2 lookup)
      tx
        .select({
          id: spaAppointments.id,
          appointmentNumber: spaAppointments.appointmentNumber,
          guestName: sql<string | null>`COALESCE(${spaAppointments.guestName}, ${customers.displayName})`.as('guest_name'),
          providerId: spaAppointments.providerId,
          providerName: spaProviders.displayName,
          serviceName: sql<string | null>`(
            SELECT ${spaServices.name}
            FROM ${spaAppointmentItems}
            INNER JOIN ${spaServices} ON ${spaAppointmentItems.serviceId} = ${spaServices.id}
            WHERE ${spaAppointmentItems.appointmentId} = ${spaAppointments.id}
              AND ${spaAppointmentItems.tenantId} = ${spaAppointments.tenantId}
            ORDER BY ${spaAppointmentItems.sortOrder}
            LIMIT 1
          )`.as('service_name'),
          startAt: spaAppointments.startAt,
          endAt: spaAppointments.endAt,
          status: spaAppointments.status,
        })
        .from(spaAppointments)
        .leftJoin(customers, eq(spaAppointments.customerId, customers.id))
        .leftJoin(spaProviders, eq(spaAppointments.providerId, spaProviders.id))
        .where(
          and(
            eq(spaAppointments.tenantId, input.tenantId),
            eq(spaAppointments.locationId, input.locationId),
            gte(spaAppointments.startAt, dayStart),
            lte(spaAppointments.startAt, dayEnd),
            inArray(spaAppointments.status, ['confirmed', 'checked_in', 'in_service']),
          ),
        )
        .orderBy(spaAppointments.startAt)
        .limit(5),
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
    // Drizzle numeric columns return strings — Number() convert with NaN guard
    const safeNum = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    const ops = dailyOps[0];
    const revenue = {
      totalRevenue: ops ? safeNum(ops.totalRevenue) : 0,
      serviceRevenue: ops ? safeNum(ops.serviceRevenue) : 0,
      addonRevenue: ops ? safeNum(ops.addonRevenue) : 0,
      retailRevenue: ops ? safeNum(ops.retailRevenue) : 0,
      tipTotal: ops ? safeNum(ops.tipTotal) : 0,
    };

    // Provider utilization — names already joined, no second lookup needed
    const providerUtilization = providerMetrics.map((p) => ({
      providerId: p.providerId,
      providerName: p.providerName ?? 'Unknown',
      providerColor: p.providerColor ?? null,
      appointmentCount: p.appointmentCount,
      completedCount: p.completedCount,
      utilizationPct: safeNum(p.utilizationPct),
      totalRevenue: safeNum(p.totalRevenue),
    }));

    // Sort by utilization descending
    providerUtilization.sort((a, b) => b.utilizationPct - a.utilizationPct);

    // Top services — names already joined, no second lookup needed
    const topServices = serviceMetrics.map((s) => ({
      serviceId: s.serviceId,
      serviceName: s.serviceName ?? 'Unknown',
      bookingCount: s.bookingCount,
      totalRevenue: safeNum(s.totalRevenue),
      completedCount: s.completedCount,
    }));

    // Compute no-show rate from today's data
    const noShowRate =
      totalToday > 0
        ? Math.round(((statusCounts['no_show'] ?? 0) / totalToday) * 10000) / 100
        : 0;

    const kpis = {
      avgAppointmentDuration: ops?.avgAppointmentDuration ?? 0,
      utilizationPct: ops ? safeNum(ops.utilizationPct) : 0,
      rebookingRate: ops ? safeNum(ops.rebookingRate) : 0,
      noShowRate,
      walkInCount: ops?.walkInCount ?? 0,
      onlineBookingCount: ops?.onlineBookingCount ?? 0,
    };

    // Upcoming appointments — service names already joined via correlated subquery
    const upcomingAppointments: UpcomingAppointmentRow[] = upcomingRows.map((r) => ({
      id: r.id,
      appointmentNumber: r.appointmentNumber,
      guestName: r.guestName ?? null,
      providerId: r.providerId ?? null,
      providerName: r.providerName ?? null,
      serviceName: r.serviceName ?? null,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
    }));

    return {
      today,
      revenue,
      providerUtilization,
      topServices,
      kpis,
      upcomingAppointments,
    };
  });
}
