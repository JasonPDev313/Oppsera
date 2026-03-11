import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface KdsLocationMetricsInput {
  tenantId: string;
  locationId: string;
  businessDate: string;
}

export interface StationSummary {
  stationId: string;
  stationName: string;
  activeTickets: number;
  avgTicketTimeSeconds: number | null;
  itemsBumped: number;
  itemsVoided: number;
}

export interface KdsLocationMetrics {
  locationId: string;
  businessDate: string;
  totalActiveTickets: number;
  totalCompletedTickets: number;
  avgTicketTimeSeconds: number | null;
  totalItemsBumped: number;
  totalItemsVoided: number;
  ticketsPastThreshold: number;
  heldTicketCount: number;
  rushTicketCount: number;
  /** Items per hour across all stations (last hour) */
  itemsPerHourLastHour: number;
  /** Busiest station by active ticket count */
  busiestStation: { stationId: string; stationName: string; count: number } | null;
  /** Per-station breakdown */
  stations: StationSummary[];
}

/**
 * Aggregate location-level KDS metrics for a given business date.
 * Computes real-time stats from ticket/item data (not from snapshot tables).
 */
export async function getKdsLocationMetrics(
  input: KdsLocationMetricsInput,
): Promise<KdsLocationMetrics> {
  return withTenant(input.tenantId, async (tx) => {
    // Active tickets overview
    const overviewRows = await tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress'))::int AS active_tickets,
        COUNT(*) FILTER (WHERE status IN ('served', 'ready'))::int AS completed_tickets,
        COUNT(*) FILTER (WHERE is_held = true AND status NOT IN ('served', 'voided'))::int AS held_tickets,
        COUNT(*) FILTER (WHERE priority_level > 0 AND status NOT IN ('served', 'voided'))::int AS rush_tickets,
        AVG(EXTRACT(EPOCH FROM (COALESCE(served_at, ready_at) - sent_at)))
          FILTER (WHERE COALESCE(served_at, ready_at) IS NOT NULL)::int AS avg_ticket_time
      FROM fnb_kitchen_tickets
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND business_date = ${input.businessDate}
    `);
    const overview = Array.from(overviewRows as Iterable<Record<string, unknown>>)[0] ?? {};

    // Item-level stats
    const itemRows = await tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE kti.item_status IN ('ready', 'served'))::int AS items_bumped,
        COUNT(*) FILTER (WHERE kti.item_status = 'voided')::int AS items_voided
      FROM fnb_kitchen_ticket_items kti
      INNER JOIN fnb_kitchen_tickets kt ON kt.id = kti.ticket_id
      WHERE kti.tenant_id = ${input.tenantId}
        AND kt.location_id = ${input.locationId}
        AND kt.business_date = ${input.businessDate}
    `);
    const itemStats = Array.from(itemRows as Iterable<Record<string, unknown>>)[0] ?? {};

    // Items per hour (last hour)
    const throughputRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS items_last_hour
      FROM fnb_kitchen_ticket_items kti
      INNER JOIN fnb_kitchen_tickets kt ON kt.id = kti.ticket_id
      WHERE kti.tenant_id = ${input.tenantId}
        AND kt.location_id = ${input.locationId}
        AND kt.business_date = ${input.businessDate}
        AND kti.ready_at >= NOW() - INTERVAL '1 hour'
        AND kti.item_status IN ('ready', 'served')
    `);
    const throughput = Array.from(throughputRows as Iterable<Record<string, unknown>>)[0] ?? {};

    // Tickets past threshold (using minimum threshold across all stations at this location)
    const thresholdRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS past_threshold
      FROM fnb_kitchen_tickets kt
      WHERE kt.tenant_id = ${input.tenantId}
        AND kt.location_id = ${input.locationId}
        AND kt.business_date = ${input.businessDate}
        AND kt.status IN ('pending', 'in_progress')
        AND EXTRACT(EPOCH FROM (NOW() - kt.sent_at)) > COALESCE(
          (SELECT MIN(warning_threshold_seconds) FROM fnb_kitchen_stations
           WHERE tenant_id = ${input.tenantId} AND location_id = ${input.locationId} AND is_active = true),
          480
        )
    `);
    const thresholdStats = Array.from(thresholdRows as Iterable<Record<string, unknown>>)[0] ?? {};

    // Per-station breakdown
    const stationRows = await tx.execute(sql`
      SELECT
        ks.id AS station_id,
        ks.display_name AS station_name,
        COUNT(DISTINCT kt.id) FILTER (WHERE kt.status IN ('pending', 'in_progress'))::int AS active_tickets,
        AVG(EXTRACT(EPOCH FROM (COALESCE(kt.served_at, kt.ready_at) - kt.sent_at)))
          FILTER (WHERE COALESCE(kt.served_at, kt.ready_at) IS NOT NULL)::int AS avg_ticket_time,
        COUNT(*) FILTER (WHERE kti.item_status IN ('ready', 'served'))::int AS items_bumped,
        COUNT(*) FILTER (WHERE kti.item_status = 'voided')::int AS items_voided
      FROM fnb_kitchen_stations ks
      LEFT JOIN fnb_kitchen_ticket_items kti ON kti.station_id = ks.id
      LEFT JOIN fnb_kitchen_tickets kt ON kt.id = kti.ticket_id
        AND kt.business_date = ${input.businessDate}
      WHERE ks.tenant_id = ${input.tenantId}
        AND ks.location_id = ${input.locationId}
        AND ks.is_active = true
        AND ks.station_type != 'expo'
      GROUP BY ks.id, ks.display_name
      ORDER BY active_tickets DESC
    `);
    const stations: StationSummary[] = Array.from(
      stationRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      stationId: r.station_id as string,
      stationName: (r.station_name as string) ?? 'Unknown',
      activeTickets: Number(r.active_tickets ?? 0),
      avgTicketTimeSeconds: r.avg_ticket_time != null ? Number(r.avg_ticket_time) : null,
      itemsBumped: Number(r.items_bumped ?? 0),
      itemsVoided: Number(r.items_voided ?? 0),
    }));

    const busiest = stations.length > 0 && stations[0]!.activeTickets > 0
      ? { stationId: stations[0]!.stationId, stationName: stations[0]!.stationName, count: stations[0]!.activeTickets }
      : null;

    return {
      locationId: input.locationId,
      businessDate: input.businessDate,
      totalActiveTickets: Number(overview.active_tickets ?? 0),
      totalCompletedTickets: Number(overview.completed_tickets ?? 0),
      avgTicketTimeSeconds: overview.avg_ticket_time != null ? Number(overview.avg_ticket_time) : null,
      totalItemsBumped: Number(itemStats.items_bumped ?? 0),
      totalItemsVoided: Number(itemStats.items_voided ?? 0),
      ticketsPastThreshold: Number(thresholdStats.past_threshold ?? 0),
      heldTicketCount: Number(overview.held_tickets ?? 0),
      rushTicketCount: Number(overview.rush_tickets ?? 0),
      itemsPerHourLastHour: Number(throughput.items_last_hour ?? 0),
      busiestStation: busiest,
      stations,
    };
  });
}
