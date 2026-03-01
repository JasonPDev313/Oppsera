import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────

export interface ProviderPerformanceReportInput {
  tenantId: string;
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  providerId?: string;
  limit?: number;
}

export interface ProviderPerformanceReportRow {
  providerId: string;
  appointmentCount: number;
  completedCount: number;
  canceledCount: number;
  noShowCount: number;
  totalRevenue: number;
  commissionTotal: number;
  tipTotal: number;
  avgServiceDuration: number;
  utilizationPct: number;
  rebookingRate: number;
  avgRating: number;
  clientCount: number;
  newClientCount: number;
}

export interface ProviderPerformanceReportResult {
  items: ProviderPerformanceReportRow[];
}

// ── Query ────────────────────────────────────────────────────────

/**
 * Aggregate provider performance from `rm_spa_provider_metrics` for a date range.
 *
 * Groups by provider_id and sums counts/revenue.
 *
 * Weighted averages are used for per-day metrics:
 * - avgServiceDuration: weighted by completedCount (minutes)
 * - utilizationPct: weighted by completedCount
 * - rebookingRate: weighted by completedCount
 * - avgRating: weighted by appointmentCount (all rated appointments)
 *
 * Sorted by totalRevenue descending (highest earner first).
 */
export async function getProviderPerformanceReport(
  input: ProviderPerformanceReportInput,
): Promise<ProviderPerformanceReportResult> {
  return withTenant(input.tenantId, async (tx) => {
    const providerFilter = input.providerId
      ? sql`AND provider_id = ${input.providerId}`
      : sql``;

    const limit = input.limit ?? 100;

    const result = await (tx as any).execute(sql`
      SELECT
        provider_id,
        COALESCE(SUM(appointment_count), 0)::int           AS appointment_count,
        COALESCE(SUM(completed_count), 0)::int              AS completed_count,
        COALESCE(SUM(canceled_count), 0)::int               AS canceled_count,
        COALESCE(SUM(no_show_count), 0)::int                AS no_show_count,
        COALESCE(SUM(total_revenue), 0)::numeric            AS total_revenue,
        COALESCE(SUM(commission_total), 0)::numeric         AS commission_total,
        COALESCE(SUM(tip_total), 0)::numeric                AS tip_total,
        CASE WHEN SUM(completed_count) > 0
          THEN (SUM(avg_service_duration::numeric * completed_count) / SUM(completed_count))::int
          ELSE 0
        END AS avg_service_duration,
        CASE WHEN SUM(completed_count) > 0
          THEN (SUM(utilization_pct::numeric * completed_count) / SUM(completed_count))::numeric
          ELSE 0
        END AS utilization_pct,
        CASE WHEN SUM(completed_count) > 0
          THEN (SUM(rebooking_rate::numeric * completed_count) / SUM(completed_count))::numeric
          ELSE 0
        END AS rebooking_rate,
        CASE WHEN SUM(appointment_count) > 0
          THEN (SUM(avg_rating::numeric * appointment_count) / SUM(appointment_count))::numeric
          ELSE 0
        END AS avg_rating,
        COALESCE(SUM(client_count), 0)::int                 AS client_count,
        COALESCE(SUM(new_client_count), 0)::int             AS new_client_count
      FROM rm_spa_provider_metrics
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.startDate}
        AND business_date <= ${input.endDate}
        ${providerFilter}
      GROUP BY provider_id
      ORDER BY SUM(total_revenue) DESC NULLS LAST
      LIMIT ${limit}
    `);

    const rows = Array.from(result as Iterable<any>);

    const items: ProviderPerformanceReportRow[] = rows.map((row) => ({
      providerId: row.provider_id,
      appointmentCount: Number(row.appointment_count ?? 0),
      completedCount: Number(row.completed_count ?? 0),
      canceledCount: Number(row.canceled_count ?? 0),
      noShowCount: Number(row.no_show_count ?? 0),
      totalRevenue: Number(row.total_revenue ?? 0),
      commissionTotal: Number(row.commission_total ?? 0),
      tipTotal: Number(row.tip_total ?? 0),
      avgServiceDuration: Number(row.avg_service_duration ?? 0),
      utilizationPct: Number(row.utilization_pct ?? 0),
      rebookingRate: Number(row.rebooking_rate ?? 0),
      avgRating: Number(row.avg_rating ?? 0),
      clientCount: Number(row.client_count ?? 0),
      newClientCount: Number(row.new_client_count ?? 0),
    }));

    return { items };
  });
}
