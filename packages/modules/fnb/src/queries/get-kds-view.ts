import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetKdsViewInput } from '../validation';

export interface KdsTicketItem {
  itemId: string;
  orderLineId: string;
  itemName: string;
  modifierSummary: string | null;
  specialInstructions: string | null;
  seatNumber: number | null;
  courseName: string | null;
  quantity: number;
  itemStatus: string;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
  startedAt: string | null;
  readyAt: string | null;
  elapsedSeconds: number;
}

export interface KdsTicketCard {
  ticketId: string;
  ticketNumber: number;
  tabId: string;
  courseNumber: number | null;
  status: string;
  tableNumber: number | null;
  serverName: string | null;
  sentAt: string;
  elapsedSeconds: number;
  items: KdsTicketItem[];
}

export interface KdsView {
  stationId: string;
  stationName: string;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  tickets: KdsTicketCard[];
  activeTicketCount: number;
}

export async function getKdsView(
  input: GetKdsViewInput,
): Promise<KdsView> {
  return withTenant(input.tenantId, async (tx) => {
    // Get station info
    const stationRows = await tx.execute(
      sql`SELECT id, name, display_name, warning_threshold_seconds, critical_threshold_seconds
          FROM fnb_kitchen_stations
          WHERE id = ${input.stationId} AND tenant_id = ${input.tenantId}
          LIMIT 1`,
    );
    const stationArr = Array.from(stationRows as Iterable<Record<string, unknown>>);
    const station = stationArr[0];

    // Get active tickets that have items at this station
    const ticketRows = await tx.execute(
      sql`SELECT DISTINCT kt.id, kt.ticket_number, kt.tab_id, kt.course_number,
                 kt.status, kt.table_number, kt.server_name, kt.sent_at,
                 EXTRACT(EPOCH FROM (NOW() - kt.sent_at))::integer AS elapsed_seconds
          FROM fnb_kitchen_tickets kt
          INNER JOIN fnb_kitchen_ticket_items kti
            ON kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}
          WHERE kt.tenant_id = ${input.tenantId}
            AND kt.location_id = ${input.locationId}
            AND kt.business_date = ${input.businessDate}
            AND kt.status IN ('pending', 'in_progress')
            AND kti.item_status NOT IN ('served', 'voided')
          ORDER BY kt.sent_at ASC`,
    );
    const tickets = Array.from(ticketRows as Iterable<Record<string, unknown>>);

    // Get items for all active tickets at this station
    const ticketCards: KdsTicketCard[] = [];
    for (const t of tickets) {
      const itemRows = await tx.execute(
        sql`SELECT id, order_line_id, item_name, modifier_summary, special_instructions,
                   seat_number, course_name, quantity, item_status,
                   is_rush, is_allergy, is_vip, started_at, ready_at,
                   EXTRACT(EPOCH FROM (NOW() - created_at))::integer AS elapsed_seconds
            FROM fnb_kitchen_ticket_items
            WHERE ticket_id = ${t.id as string}
              AND station_id = ${input.stationId}
              AND item_status NOT IN ('served', 'voided')
            ORDER BY seat_number NULLS LAST, id ASC`,
      );
      const items = Array.from(itemRows as Iterable<Record<string, unknown>>).map((r) => ({
        itemId: r.id as string,
        orderLineId: r.order_line_id as string,
        itemName: r.item_name as string,
        modifierSummary: (r.modifier_summary as string) ?? null,
        specialInstructions: (r.special_instructions as string) ?? null,
        seatNumber: r.seat_number != null ? Number(r.seat_number) : null,
        courseName: (r.course_name as string) ?? null,
        quantity: Number(r.quantity),
        itemStatus: r.item_status as string,
        isRush: r.is_rush as boolean,
        isAllergy: r.is_allergy as boolean,
        isVip: r.is_vip as boolean,
        startedAt: (r.started_at as string) ?? null,
        readyAt: (r.ready_at as string) ?? null,
        elapsedSeconds: Number(r.elapsed_seconds),
      }));

      ticketCards.push({
        ticketId: t.id as string,
        ticketNumber: Number(t.ticket_number),
        tabId: t.tab_id as string,
        courseNumber: t.course_number != null ? Number(t.course_number) : null,
        status: t.status as string,
        tableNumber: t.table_number != null ? Number(t.table_number) : null,
        serverName: (t.server_name as string) ?? null,
        sentAt: t.sent_at as string,
        elapsedSeconds: Number(t.elapsed_seconds),
        items,
      });
    }

    return {
      stationId: input.stationId,
      stationName: station ? (station.display_name as string) : input.stationId,
      warningThresholdSeconds: station ? Number(station.warning_threshold_seconds) : 480,
      criticalThresholdSeconds: station ? Number(station.critical_threshold_seconds) : 720,
      tickets: ticketCards,
      activeTicketCount: ticketCards.length,
    };
  });
}
