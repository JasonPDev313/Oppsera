import { eq, and, gte, lte, asc, sql } from 'drizzle-orm';
import { withTenant, rmSpaDailyOperations } from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────

export interface GetSpaDailyTrendsInput {
  tenantId: string;
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD
  locationId?: string;     // filter to specific location
}

export interface DailyTrendRow {
  businessDate: string;
  appointmentCount: number;
  completedCount: number;
  canceledCount: number;
  noShowCount: number;
  walkInCount: number;
  onlineBookingCount: number;
  totalRevenue: number;         // dollars
  serviceRevenue: number;       // dollars
  addonRevenue: number;         // dollars
  retailRevenue: number;        // dollars
  tipTotal: number;             // dollars
  avgAppointmentDuration: number;
  utilizationPct: number;
  rebookingRate: number;
}

export interface GetSpaDailyTrendsResult {
  items: DailyTrendRow[];
}

// ── Query ────────────────────────────────────────────────────────

/**
 * Return daily trend data from the rm_spa_daily_operations read model.
 * One row per business date, ordered ascending by date.
 *
 * - With locationId: returns per-date rows for that single location.
 * - Without locationId: aggregates across ALL locations per date.
 *   Counts are summed; utilization/rebooking are averaged; duration
 *   is weighted by completed count.
 */
export async function getSpaDailyTrends(
  input: GetSpaDailyTrendsInput,
): Promise<GetSpaDailyTrendsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(rmSpaDailyOperations.tenantId, input.tenantId),
      gte(rmSpaDailyOperations.businessDate, input.startDate),
      lte(rmSpaDailyOperations.businessDate, input.endDate),
    ];

    if (input.locationId) {
      // Single location — direct select, no aggregation needed
      conditions.push(eq(rmSpaDailyOperations.locationId, input.locationId));

      const rows = await tx
        .select({
          businessDate: rmSpaDailyOperations.businessDate,
          appointmentCount: rmSpaDailyOperations.appointmentCount,
          completedCount: rmSpaDailyOperations.completedCount,
          canceledCount: rmSpaDailyOperations.canceledCount,
          noShowCount: rmSpaDailyOperations.noShowCount,
          walkInCount: rmSpaDailyOperations.walkInCount,
          onlineBookingCount: rmSpaDailyOperations.onlineBookingCount,
          totalRevenue: rmSpaDailyOperations.totalRevenue,
          serviceRevenue: rmSpaDailyOperations.serviceRevenue,
          addonRevenue: rmSpaDailyOperations.addonRevenue,
          retailRevenue: rmSpaDailyOperations.retailRevenue,
          tipTotal: rmSpaDailyOperations.tipTotal,
          avgAppointmentDuration: rmSpaDailyOperations.avgAppointmentDuration,
          utilizationPct: rmSpaDailyOperations.utilizationPct,
          rebookingRate: rmSpaDailyOperations.rebookingRate,
        })
        .from(rmSpaDailyOperations)
        .where(and(...conditions))
        .orderBy(asc(rmSpaDailyOperations.businessDate));

      const items: DailyTrendRow[] = rows.map((r) => ({
        businessDate: r.businessDate,
        appointmentCount: r.appointmentCount,
        completedCount: r.completedCount,
        canceledCount: r.canceledCount,
        noShowCount: r.noShowCount,
        walkInCount: r.walkInCount,
        onlineBookingCount: r.onlineBookingCount,
        totalRevenue: Number(r.totalRevenue),
        serviceRevenue: Number(r.serviceRevenue),
        addonRevenue: Number(r.addonRevenue),
        retailRevenue: Number(r.retailRevenue),
        tipTotal: Number(r.tipTotal),
        avgAppointmentDuration: r.avgAppointmentDuration,
        utilizationPct: Number(r.utilizationPct),
        rebookingRate: Number(r.rebookingRate),
      }));

      return { items };
    }

    // Multi-location — aggregate across all locations per date
    const rows = await tx
      .select({
        businessDate: rmSpaDailyOperations.businessDate,
        appointmentCount: sql<number>`sum(${rmSpaDailyOperations.appointmentCount})::int`,
        completedCount: sql<number>`sum(${rmSpaDailyOperations.completedCount})::int`,
        canceledCount: sql<number>`sum(${rmSpaDailyOperations.canceledCount})::int`,
        noShowCount: sql<number>`sum(${rmSpaDailyOperations.noShowCount})::int`,
        walkInCount: sql<number>`sum(${rmSpaDailyOperations.walkInCount})::int`,
        onlineBookingCount: sql<number>`sum(${rmSpaDailyOperations.onlineBookingCount})::int`,
        totalRevenue: sql<string>`sum(${rmSpaDailyOperations.totalRevenue}::numeric)::numeric`,
        serviceRevenue: sql<string>`sum(${rmSpaDailyOperations.serviceRevenue}::numeric)::numeric`,
        addonRevenue: sql<string>`sum(${rmSpaDailyOperations.addonRevenue}::numeric)::numeric`,
        retailRevenue: sql<string>`sum(${rmSpaDailyOperations.retailRevenue}::numeric)::numeric`,
        tipTotal: sql<string>`sum(${rmSpaDailyOperations.tipTotal}::numeric)::numeric`,
        avgAppointmentDuration: sql<number>`case when sum(${rmSpaDailyOperations.completedCount}) > 0
          then (sum(${rmSpaDailyOperations.avgAppointmentDuration}::numeric * ${rmSpaDailyOperations.completedCount}) / sum(${rmSpaDailyOperations.completedCount}))::int
          else 0 end`,
        utilizationPct: sql<string>`coalesce(avg(${rmSpaDailyOperations.utilizationPct}::numeric), 0)::numeric`,
        rebookingRate: sql<string>`coalesce(avg(${rmSpaDailyOperations.rebookingRate}::numeric), 0)::numeric`,
      })
      .from(rmSpaDailyOperations)
      .where(and(...conditions))
      .groupBy(rmSpaDailyOperations.businessDate)
      .orderBy(asc(rmSpaDailyOperations.businessDate));

    const items: DailyTrendRow[] = rows.map((r) => ({
      businessDate: r.businessDate,
      appointmentCount: r.appointmentCount,
      completedCount: r.completedCount,
      canceledCount: r.canceledCount,
      noShowCount: r.noShowCount,
      walkInCount: r.walkInCount,
      onlineBookingCount: r.onlineBookingCount,
      totalRevenue: Number(r.totalRevenue),
      serviceRevenue: Number(r.serviceRevenue),
      addonRevenue: Number(r.addonRevenue),
      retailRevenue: Number(r.retailRevenue),
      tipTotal: Number(r.tipTotal),
      avgAppointmentDuration: r.avgAppointmentDuration,
      utilizationPct: Number(r.utilizationPct),
      rebookingRate: Number(r.rebookingRate),
    }));

    return { items };
  });
}
