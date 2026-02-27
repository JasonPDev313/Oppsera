import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { HostGetDashboardMetricsInput } from '../validation-host';

export interface HostDashboardMetrics {
  coversSeated: number;
  coversExpected: number;
  tablesOccupied: number;
  tablesTotal: number;
  avgWaitMinutes: number;
  reservationsRemaining: number;
  noShowCount: number;
  waitlistCount: number;
}

/**
 * Aggregate dashboard metrics for the host stand.
 * All queries run within a single withTenant call using Promise.all for parallelism.
 */
export async function hostGetDashboardMetrics(
  input: HostGetDashboardMetricsInput,
): Promise<HostDashboardMetrics> {
  const emptyMetrics: HostDashboardMetrics = {
    coversSeated: 0,
    coversExpected: 0,
    tablesOccupied: 0,
    tablesTotal: 0,
    avgWaitMinutes: 0,
    reservationsRemaining: 0,
    noShowCount: 0,
    waitlistCount: 0,
  };

  try {
    const today = new Date().toISOString().slice(0, 10);

    return await withTenant(input.tenantId, async (tx) => {
      const safeQuery = (q: Promise<unknown>) => q.catch(() => []);

      const [coverRows, tableRows, waitRows, reservationRows] = await Promise.all([
        safeQuery(tx.execute(sql`
          SELECT
            COALESCE(
              SUM(party_size) FILTER (WHERE status IN ('seated', 'completed')),
              0
            )::int AS covers_seated,
            COALESCE(
              SUM(party_size) FILTER (WHERE status NOT IN ('canceled', 'no_show')),
              0
            )::int AS covers_expected
          FROM fnb_reservations
          WHERE tenant_id = ${input.tenantId}
            AND location_id = ${input.locationId}
            AND reservation_date = ${today}
        `)),

        safeQuery(tx.execute(sql`
          SELECT
            COUNT(*)::int AS tables_total,
            COUNT(*) FILTER (
              WHERE ls.status = 'occupied'
                OR ls.status IN ('seated', 'ordered', 'entrees_fired', 'dessert', 'check_presented')
            )::int AS tables_occupied
          FROM fnb_tables t
          LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
          WHERE t.tenant_id = ${input.tenantId}
            AND t.location_id = ${input.locationId}
            AND t.is_active = true
        `)),

        safeQuery(tx.execute(sql`
          SELECT
            COALESCE(
              AVG(EXTRACT(EPOCH FROM (now() - added_at)) / 60),
              0
            )::numeric(10,1) AS avg_wait_minutes,
            COUNT(*)::int AS waitlist_count
          FROM fnb_waitlist_entries
          WHERE tenant_id = ${input.tenantId}
            AND location_id = ${input.locationId}
            AND status IN ('waiting', 'notified')
        `)),

        safeQuery(tx.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE status IN ('booked', 'confirmed'))::int AS reservations_remaining,
            COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show_count
          FROM fnb_reservations
          WHERE tenant_id = ${input.tenantId}
            AND location_id = ${input.locationId}
            AND reservation_date = ${today}
        `)),
      ]);

      const covers = Array.from(coverRows as Iterable<Record<string, unknown>>)[0] ?? {};
      const tables = Array.from(tableRows as Iterable<Record<string, unknown>>)[0] ?? {};
      const waits = Array.from(waitRows as Iterable<Record<string, unknown>>)[0] ?? {};
      const reservations = Array.from(reservationRows as Iterable<Record<string, unknown>>)[0] ?? {};

      return {
        coversSeated: Number(covers.covers_seated ?? 0),
        coversExpected: Number(covers.covers_expected ?? 0),
        tablesOccupied: Number(tables.tables_occupied ?? 0),
        tablesTotal: Number(tables.tables_total ?? 0),
        avgWaitMinutes: Math.round(Number(waits.avg_wait_minutes ?? 0)),
        reservationsRemaining: Number(reservations.reservations_remaining ?? 0),
        noShowCount: Number(reservations.no_show_count ?? 0),
        waitlistCount: Number(waits.waitlist_count ?? 0),
      };
    });
  } catch (err) {
    console.error('[hostGetDashboardMetrics] Query failed — returning empty metrics:', err);
    return emptyMetrics;
  }
}
