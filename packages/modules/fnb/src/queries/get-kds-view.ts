import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetKdsViewInput } from '../validation';
import { StationNotFoundError } from '../errors';

export interface KdsTicketItem {
  itemId: string;
  orderLineId: string;
  itemName: string;
  kitchenLabel: string | null;
  itemColor: string | null;
  modifierSummary: string | null;
  specialInstructions: string | null;
  seatNumber: number | null;
  courseName: string | null;
  quantity: number;
  itemStatus: string;
  priorityLevel: number;
  estimatedPrepSeconds: number | null;
  routingRuleId: string | null;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
  startedAt: string | null;
  readyAt: string | null;
  bumpedBy: string | null;
  elapsedSeconds: number;
}

export interface KdsTicketCard {
  ticketId: string;
  ticketNumber: number;
  tabId: string;
  courseNumber: number | null;
  status: string;
  priorityLevel: number;
  isHeld: boolean;
  orderType: string | null;
  channel: string | null;
  tableNumber: number | null;
  serverName: string | null;
  customerName: string | null;
  sentAt: string;
  estimatedPickupAt: string | null;
  elapsedSeconds: number;
  items: KdsTicketItem[];
  otherStations: { stationId: string; stationName: string }[];
  /** Order source from orders table — pos, online, kiosk, delivery */
  orderSource: string | null;
  /** Terminal/POS station ID from orders table */
  terminalId: string | null;
  /** ISO datetime when order was placed */
  orderTimestamp: string | null;
}

export interface KdsCompletedTicket {
  ticketId: string;
  ticketNumber: number;
  tableNumber: number | null;
  serverName: string | null;
  itemCount: number;
  completedAt: string;
  completedSecondsAgo: number;
}

export interface KdsView {
  stationId: string;
  stationName: string;
  stationType: string;
  stationColor: string | null;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  tickets: KdsTicketCard[];
  activeTicketCount: number;
  recentlyCompleted: KdsCompletedTicket[];
}

export async function getKdsView(
  input: GetKdsViewInput,
): Promise<KdsView> {
  return withTenant(input.tenantId, async (tx) => {
    // Get station info
    const stationRows = await tx.execute(
      sql`SELECT id, name, display_name, station_type, color,
                 warning_threshold_seconds, critical_threshold_seconds
          FROM fnb_kitchen_stations
          WHERE id = ${input.stationId} AND tenant_id = ${input.tenantId}
          LIMIT 1`,
    );
    const stationArr = Array.from(stationRows as Iterable<Record<string, unknown>>);
    const station = stationArr[0];
    if (!station) throw new StationNotFoundError(input.stationId);

    // Get active tickets that have items at this station
    // LEFT JOIN orders to pull source, terminal_id, created_at for the KDS card meta row
    const ticketRows = await tx.execute(
      sql`SELECT DISTINCT kt.id, kt.ticket_number, kt.tab_id, kt.course_number,
                 kt.status, kt.priority_level, kt.is_held, kt.order_type,
                 kt.channel, kt.table_number, kt.server_name, kt.customer_name,
                 kt.sent_at, kt.estimated_pickup_at,
                 EXTRACT(EPOCH FROM (NOW() - kt.sent_at))::integer AS elapsed_seconds,
                 o.source AS order_source, o.terminal_id, o.created_at AS order_timestamp
          FROM fnb_kitchen_tickets kt
          INNER JOIN fnb_kitchen_ticket_items kti
            ON kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}
          LEFT JOIN orders o
            ON o.id = kt.order_id AND o.tenant_id = kt.tenant_id
          WHERE kt.tenant_id = ${input.tenantId}
            AND kt.location_id = ${input.locationId}
            AND kt.business_date = ${input.businessDate}
            AND kt.status IN ('pending', 'in_progress')
            AND kti.item_status NOT IN ('served', 'voided')
          ORDER BY kt.priority_level DESC NULLS LAST, kt.sent_at ASC`,
    );
    const tickets = Array.from(ticketRows as Iterable<Record<string, unknown>>);

    // Batch-fetch all items for all active tickets at this station in a single query
    // (fixes N+1: previously one SELECT per ticket)
    const ticketIds = tickets.map((t) => t.id as string);
    const itemsByTicket = new Map<string, KdsTicketItem[]>();

    if (ticketIds.length > 0) {
      const allItemRows = await tx.execute(
        sql`SELECT ticket_id, id, order_line_id, item_name, kitchen_label, item_color,
                   modifier_summary, special_instructions,
                   seat_number, course_name, quantity, item_status,
                   priority_level, estimated_prep_seconds, routing_rule_id,
                   is_rush, is_allergy, is_vip,
                   started_at, ready_at, bumped_by,
                   EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at)))::integer AS elapsed_seconds
            FROM fnb_kitchen_ticket_items
            WHERE ticket_id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})
              AND station_id = ${input.stationId}
              AND item_status NOT IN ('served', 'voided')
            ORDER BY ticket_id, priority_level DESC NULLS LAST, seat_number NULLS LAST, id ASC`,
      );
      for (const r of Array.from(allItemRows as Iterable<Record<string, unknown>>)) {
        const tid = r.ticket_id as string;
        const item: KdsTicketItem = {
          itemId: r.id as string,
          orderLineId: r.order_line_id as string,
          itemName: r.item_name as string,
          kitchenLabel: (r.kitchen_label as string) ?? null,
          itemColor: (r.item_color as string) ?? null,
          modifierSummary: (r.modifier_summary as string) ?? null,
          specialInstructions: (r.special_instructions as string) ?? null,
          seatNumber: r.seat_number != null ? Number(r.seat_number) : null,
          courseName: (r.course_name as string) ?? null,
          quantity: Number(r.quantity),
          itemStatus: r.item_status as string,
          priorityLevel: Number(r.priority_level ?? 0),
          estimatedPrepSeconds: r.estimated_prep_seconds != null ? Number(r.estimated_prep_seconds) : null,
          routingRuleId: (r.routing_rule_id as string) ?? null,
          isRush: r.is_rush as boolean,
          isAllergy: r.is_allergy as boolean,
          isVip: r.is_vip as boolean,
          startedAt: (r.started_at as string) ?? null,
          readyAt: (r.ready_at as string) ?? null,
          bumpedBy: (r.bumped_by as string) ?? null,
          elapsedSeconds: Number(r.elapsed_seconds),
        };
        if (!itemsByTicket.has(tid)) itemsByTicket.set(tid, []);
        itemsByTicket.get(tid)!.push(item);
      }
    }

    const ticketCards: KdsTicketCard[] = tickets.map((t) => ({
      ticketId: t.id as string,
      ticketNumber: Number(t.ticket_number),
      tabId: t.tab_id as string,
      courseNumber: t.course_number != null ? Number(t.course_number) : null,
      status: t.status as string,
      priorityLevel: Number(t.priority_level ?? 0),
      isHeld: (t.is_held as boolean) ?? false,
      orderType: (t.order_type as string) ?? null,
      channel: (t.channel as string) ?? null,
      tableNumber: t.table_number != null ? Number(t.table_number) : null,
      serverName: (t.server_name as string) ?? null,
      customerName: (t.customer_name as string) ?? null,
      sentAt: t.sent_at as string,
      estimatedPickupAt: (t.estimated_pickup_at as string) ?? null,
      elapsedSeconds: Number(t.elapsed_seconds),
      items: itemsByTicket.get(t.id as string) ?? [],
      otherStations: [],
      orderSource: (t.order_source as string) ?? null,
      terminalId: (t.terminal_id as string) ?? null,
      orderTimestamp: (t.order_timestamp as string) ?? null,
    }));

    // Fetch cross-station "Also At" data for all active tickets.
    // Since each ticket is single-station (consumers group items by station and
    // create separate tickets), we look up sibling tickets for the same ORDER
    // at other stations to show cross-station visibility.
    if (ticketCards.length > 0) {
      const ticketIds = ticketCards.map((tc) => tc.ticketId);
      const otherStationRows = await tx.execute(
        sql`SELECT DISTINCT kt_this.id AS ticket_id,
                   kti_other.station_id, ks.display_name AS station_name
            FROM fnb_kitchen_tickets kt_this
            INNER JOIN fnb_kitchen_tickets kt_sibling
              ON kt_sibling.order_id = kt_this.order_id
              AND kt_sibling.tenant_id = kt_this.tenant_id
              AND kt_sibling.id != kt_this.id
            INNER JOIN fnb_kitchen_ticket_items kti_other
              ON kti_other.ticket_id = kt_sibling.id
              AND kti_other.station_id != ${input.stationId}
              AND kti_other.item_status NOT IN ('served', 'voided')
            INNER JOIN fnb_kitchen_stations ks
              ON ks.id = kti_other.station_id AND ks.tenant_id = ${input.tenantId}
            WHERE kt_this.id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})`,
      );
      const otherStations = Array.from(otherStationRows as Iterable<Record<string, unknown>>);
      const stationsByTicket = new Map<string, { stationId: string; stationName: string }[]>();
      for (const row of otherStations) {
        const tid = row.ticket_id as string;
        if (!stationsByTicket.has(tid)) stationsByTicket.set(tid, []);
        const existing = stationsByTicket.get(tid)!;
        // Deduplicate by stationId
        if (!existing.some((s) => s.stationId === (row.station_id as string))) {
          existing.push({
            stationId: row.station_id as string,
            stationName: (row.station_name as string) ?? 'Unknown',
          });
        }
      }
      for (const card of ticketCards) {
        card.otherStations = stationsByTicket.get(card.ticketId) ?? [];
      }
    }

    // Fetch recently completed tickets at this station (all items bumped/served/voided)
    const completedRows = await tx.execute(
      sql`SELECT kt.id, kt.ticket_number, kt.table_number, kt.server_name,
                 COUNT(kti.id)::integer AS item_count,
                 MAX(kti.ready_at) AS completed_at,
                 EXTRACT(EPOCH FROM (NOW() - MAX(kti.ready_at)))::integer AS completed_seconds_ago
          FROM fnb_kitchen_tickets kt
          INNER JOIN fnb_kitchen_ticket_items kti
            ON kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}
          WHERE kt.tenant_id = ${input.tenantId}
            AND kt.location_id = ${input.locationId}
            AND kt.business_date = ${input.businessDate}
            AND kti.item_status IN ('bumped', 'served')
            AND NOT EXISTS (
              SELECT 1 FROM fnb_kitchen_ticket_items kti2
              WHERE kti2.ticket_id = kt.id
                AND kti2.station_id = ${input.stationId}
                AND kti2.item_status NOT IN ('bumped', 'served', 'voided')
            )
          GROUP BY kt.id
          ORDER BY MAX(kti.ready_at) DESC NULLS LAST
          LIMIT 10`,
    );
    const recentlyCompleted: KdsCompletedTicket[] = Array.from(
      completedRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      ticketId: r.id as string,
      ticketNumber: Number(r.ticket_number),
      tableNumber: r.table_number != null ? Number(r.table_number) : null,
      serverName: (r.server_name as string) ?? null,
      itemCount: Number(r.item_count),
      completedAt: (r.completed_at as string) ?? '',
      completedSecondsAgo: Number(r.completed_seconds_ago ?? 0),
    }));

    return {
      stationId: input.stationId,
      stationName: (station.display_name as string) ?? (station.name as string),
      stationType: station.station_type as string,
      stationColor: (station.color as string) ?? null,
      warningThresholdSeconds: Number(station.warning_threshold_seconds ?? 480),
      criticalThresholdSeconds: Number(station.critical_threshold_seconds ?? 720),
      tickets: ticketCards,
      activeTicketCount: ticketCards.length,
      recentlyCompleted,
    };
  });
}
