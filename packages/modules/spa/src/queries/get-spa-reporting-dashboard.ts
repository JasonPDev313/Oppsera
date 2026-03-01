import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────

export interface SpaReportingDashboardInput {
  tenantId: string;
  locationId?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface SpaReportingDashboardResult {
  totalAppointments: number;
  completedAppointments: number;
  canceledAppointments: number;
  noShows: number;
  totalRevenue: number;
  serviceRevenue: number;
  addonRevenue: number;
  retailRevenue: number;
  tipTotal: number;
  avgAppointmentDuration: number;
  avgUtilization: number;
  rebookingRate: number;
  onlineBookingPct: number;
  walkInPct: number;
  noShowRate: number;
}

// ── Query ────────────────────────────────────────────────────────

/**
 * Aggregate spa dashboard KPIs from `rm_spa_daily_operations` for a date range.
 *
 * All revenue amounts are NUMERIC(19,4) dollars in the read model — returned
 * as plain numbers via `Number()`.
 *
 * Percentages (onlineBookingPct, walkInPct, noShowRate) are computed from
 * their respective counts against totalAppointments.
 *
 * avgUtilization and rebookingRate are weighted averages across the period
 * (weighted by completed/appointment count to avoid simple-average distortion).
 */
export async function getSpaReportingDashboard(
  input: SpaReportingDashboardInput,
): Promise<SpaReportingDashboardResult> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND location_id = ${input.locationId}`
      : sql``;

    const result = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(appointment_count), 0)::int          AS total_appointments,
        COALESCE(SUM(completed_count), 0)::int             AS completed_appointments,
        COALESCE(SUM(canceled_count), 0)::int              AS canceled_appointments,
        COALESCE(SUM(no_show_count), 0)::int               AS no_shows,
        COALESCE(SUM(total_revenue), 0)::numeric           AS total_revenue,
        COALESCE(SUM(service_revenue), 0)::numeric         AS service_revenue,
        COALESCE(SUM(addon_revenue), 0)::numeric           AS addon_revenue,
        COALESCE(SUM(retail_revenue), 0)::numeric          AS retail_revenue,
        COALESCE(SUM(tip_total), 0)::numeric               AS tip_total,
        CASE WHEN SUM(completed_count) > 0
          THEN (SUM(avg_appointment_duration::numeric * completed_count) / SUM(completed_count))::int
          ELSE 0
        END AS avg_appointment_duration,
        CASE WHEN SUM(completed_count) > 0
          THEN (SUM(utilization_pct::numeric * completed_count) / SUM(completed_count))::numeric
          ELSE 0
        END AS avg_utilization,
        CASE WHEN SUM(completed_count) > 0
          THEN (SUM(rebooking_rate::numeric * completed_count) / SUM(completed_count))::numeric
          ELSE 0
        END AS avg_rebooking_rate,
        COALESCE(SUM(online_booking_count), 0)::int        AS online_booking_count,
        COALESCE(SUM(walk_in_count), 0)::int               AS walk_in_count
      FROM rm_spa_daily_operations
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.startDate}
        AND business_date <= ${input.endDate}
        ${locationFilter}
    `);

    const rows = Array.from(result as Iterable<any>);
    const row = rows[0] ?? {};

    const totalAppointments = Number(row.total_appointments ?? 0);
    const onlineBookingCount = Number(row.online_booking_count ?? 0);
    const walkInCount = Number(row.walk_in_count ?? 0);
    const noShows = Number(row.no_shows ?? 0);

    return {
      totalAppointments,
      completedAppointments: Number(row.completed_appointments ?? 0),
      canceledAppointments: Number(row.canceled_appointments ?? 0),
      noShows,
      totalRevenue: Number(row.total_revenue ?? 0),
      serviceRevenue: Number(row.service_revenue ?? 0),
      addonRevenue: Number(row.addon_revenue ?? 0),
      retailRevenue: Number(row.retail_revenue ?? 0),
      tipTotal: Number(row.tip_total ?? 0),
      avgAppointmentDuration: Number(row.avg_appointment_duration ?? 0),
      avgUtilization: Number(row.avg_utilization ?? 0),
      rebookingRate: Number(row.avg_rebooking_rate ?? 0),
      onlineBookingPct:
        totalAppointments > 0
          ? Math.round((onlineBookingCount / totalAppointments) * 10000) / 100
          : 0,
      walkInPct:
        totalAppointments > 0
          ? Math.round((walkInCount / totalAppointments) * 10000) / 100
          : 0,
      noShowRate:
        totalAppointments > 0
          ? Math.round((noShows / totalAppointments) * 10000) / 100
          : 0,
    };
  });
}
