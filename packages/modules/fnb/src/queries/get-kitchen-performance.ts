import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetKitchenPerformanceInput } from '../validation';

export interface KitchenPerformanceRow {
  id: string;
  locationId: string;
  stationId: string;
  businessDate: string;
  ticketsProcessed: number;
  avgTicketTimeSeconds: number | null;
  itemsBumped: number;
  itemsVoided: number;
  ticketsPastThreshold: number;
  peakHour: number | null;
}

export interface KitchenPerformanceResult {
  items: KitchenPerformanceRow[];
}

export async function getKitchenPerformance(
  input: GetKitchenPerformanceInput,
): Promise<KitchenPerformanceResult> {
  const { tenantId, locationId, startDate, endDate, stationId } = input;

  return withTenant(tenantId, async (tx) => {
    const stationFilter = stationId
      ? sql` AND station_id = ${stationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        id, location_id, station_id, business_date,
        tickets_processed, avg_ticket_time_seconds,
        items_bumped, items_voided, tickets_past_threshold, peak_hour
      FROM rm_fnb_kitchen_performance
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
        ${stationFilter}
      ORDER BY business_date DESC, tickets_processed DESC
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      locationId: String(r.location_id),
      stationId: String(r.station_id),
      businessDate: String(r.business_date),
      ticketsProcessed: Number(r.tickets_processed),
      avgTicketTimeSeconds: r.avg_ticket_time_seconds != null ? Number(r.avg_ticket_time_seconds) : null,
      itemsBumped: Number(r.items_bumped),
      itemsVoided: Number(r.items_voided),
      ticketsPastThreshold: Number(r.tickets_past_threshold),
      peakHour: r.peak_hour != null ? Number(r.peak_hour) : null,
    }));

    return { items };
  });
}
