import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetStationMetricsInput } from '../validation';

export interface StationMetrics {
  stationId: string;
  businessDate: string;
  ticketsProcessed: number;
  avgTicketTimeSeconds: number | null;
  itemsBumped: number;
  itemsVoided: number;
  ticketsPastThreshold: number;
  peakHour: number | null;
}

export async function getStationMetrics(
  input: GetStationMetricsInput,
): Promise<StationMetrics> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT station_id, business_date, tickets_processed,
                 avg_ticket_time_seconds, items_bumped, items_voided,
                 tickets_past_threshold, peak_hour
          FROM fnb_station_metrics_snapshot
          WHERE station_id = ${input.stationId}
            AND business_date = ${input.businessDate}
            AND tenant_id = ${input.tenantId}
          LIMIT 1`,
    );

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) {
      return {
        stationId: input.stationId,
        businessDate: input.businessDate,
        ticketsProcessed: 0,
        avgTicketTimeSeconds: null,
        itemsBumped: 0,
        itemsVoided: 0,
        ticketsPastThreshold: 0,
        peakHour: null,
      };
    }

    const r = arr[0]!;
    return {
      stationId: r.station_id as string,
      businessDate: r.business_date as string,
      ticketsProcessed: Number(r.tickets_processed),
      avgTicketTimeSeconds: r.avg_ticket_time_seconds != null ? Number(r.avg_ticket_time_seconds) : null,
      itemsBumped: Number(r.items_bumped),
      itemsVoided: Number(r.items_voided),
      ticketsPastThreshold: Number(r.tickets_past_threshold),
      peakHour: r.peak_hour != null ? Number(r.peak_hour) : null,
    };
  });
}
