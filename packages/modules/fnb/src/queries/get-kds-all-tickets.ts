import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { buildCourseGroups } from './get-kds-view';
import type { KdsTicketCard, KdsTicketItem } from './get-kds-view';

export interface KdsAllTicketsInput {
  tenantId: string;
  locationId: string;
  businessDate: string;
}

export interface KdsAllTicketsView {
  tickets: KdsTicketCard[];
  activeTicketCount: number;
  stationCount: number;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
}

/**
 * Fetches all active KDS tickets across ALL prep stations for a location
 * in a single query. Replaces the client-side fan-out pattern that issued
 * one API call per station.
 */
export async function getKdsAllTickets(
  input: KdsAllTicketsInput,
): Promise<KdsAllTicketsView> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Get all active tickets for this location (across all stations).
    // No business_date filter — tickets persist until bumped or voided.
    const ticketRows = await tx.execute(
      sql`SELECT DISTINCT kt.id, kt.ticket_number, kt.tab_id, kt.course_number,
                 kt.status, kt.priority_level, kt.is_held, kt.order_type,
                 kt.channel, kt.table_number, kt.server_name, kt.customer_name,
                 kt.sent_at, kt.estimated_pickup_at, kt.business_date,
                 EXTRACT(EPOCH FROM (NOW() - kt.sent_at))::integer AS elapsed_seconds,
                 o.source AS order_source, o.terminal_id, o.created_at AS order_timestamp,
                 COALESCE(tc.course_name, cd.course_name) AS course_name
          FROM fnb_kitchen_tickets kt
          LEFT JOIN orders o
            ON o.id = kt.order_id AND o.tenant_id = kt.tenant_id
          LEFT JOIN fnb_tab_courses tc
            ON tc.tab_id = kt.tab_id AND tc.course_number = kt.course_number AND tc.tenant_id = kt.tenant_id
          LEFT JOIN fnb_course_definitions cd
            ON cd.tenant_id = kt.tenant_id AND cd.location_id = kt.location_id
            AND cd.course_number = kt.course_number AND cd.is_active = true
          WHERE kt.tenant_id = ${input.tenantId}
            AND kt.location_id = ${input.locationId}
            AND kt.status IN ('pending', 'in_progress')
          ORDER BY kt.priority_level DESC NULLS LAST, kt.sent_at ASC
          LIMIT 500`,
    );
    const tickets = Array.from(ticketRows as Iterable<Record<string, unknown>>);

    if (tickets.length === 0) {
      return { tickets: [], activeTicketCount: 0, stationCount: 0, warningThresholdSeconds: 480, criticalThresholdSeconds: 720 };
    }

    // 2. Batch-fetch all non-voided/served items for all active tickets
    const ticketIds = tickets.map((t) => t.id as string);
    const itemsByTicket = new Map<string, KdsTicketItem[]>();
    const stationIds = new Set<string>();

    const allItemRows = await tx.execute(
      sql`SELECT kti.ticket_id, kti.id, kti.order_line_id, kti.item_name,
                 kti.kitchen_label, kti.item_color,
                 kti.modifier_summary, kti.special_instructions,
                 kti.seat_number, kti.course_name, kti.quantity, kti.item_status,
                 kti.priority_level, kti.estimated_prep_seconds, kti.routing_rule_id,
                 kti.is_rush, kti.is_allergy, kti.is_vip,
                 kti.started_at, kti.ready_at, kti.bumped_by, kti.station_id,
                 EXTRACT(EPOCH FROM (NOW() - COALESCE(kti.started_at, kti.created_at)))::integer AS elapsed_seconds
          FROM fnb_kitchen_ticket_items kti
          WHERE kti.tenant_id = ${input.tenantId}
            AND kti.ticket_id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})
            AND kti.item_status NOT IN ('served', 'voided')
          ORDER BY kti.ticket_id, kti.priority_level DESC NULLS LAST, kti.seat_number NULLS LAST, kti.id ASC`,
    );

    for (const r of Array.from(allItemRows as Iterable<Record<string, unknown>>)) {
      const tid = r.ticket_id as string;
      if (r.station_id) stationIds.add(r.station_id as string);
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

    // 2b. Fetch station thresholds for the location (used for banner)
    let warningThreshold = 480;
    let criticalThreshold = 720;
    if (stationIds.size > 0) {
      const stationIdArr = Array.from(stationIds);
      const thresholdRows = await tx.execute(
        sql`SELECT warning_threshold_seconds, critical_threshold_seconds
            FROM fnb_kitchen_stations
            WHERE tenant_id = ${input.tenantId}
              AND location_id = ${input.locationId}
              AND id IN (${sql.join(stationIdArr.map((id) => sql`${id}`), sql`, `)})
              AND is_active = true`,
      );
      const thresholds = Array.from(thresholdRows as Iterable<Record<string, unknown>>);
      if (thresholds.length > 0) {
        // Use the minimum thresholds across all active stations (most conservative)
        warningThreshold = Math.min(...thresholds.map((t) => Number(t.warning_threshold_seconds ?? 480)));
        criticalThreshold = Math.min(...thresholds.map((t) => Number(t.critical_threshold_seconds ?? 720)));
      }
    }

    // 3. Build ticket cards (only include tickets that have active items)
    const ticketCards: KdsTicketCard[] = [];
    for (const t of tickets) {
      const items = itemsByTicket.get(t.id as string);
      if (!items || items.length === 0) continue;
      ticketCards.push({
        ticketId: t.id as string,
        ticketNumber: Number(t.ticket_number),
        tabId: t.tab_id as string,
        courseNumber: t.course_number != null ? Number(t.course_number) : null,
        courseName: (t.course_name as string) ?? null,
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
        items,
        otherStations: [],
        orderSource: (t.order_source as string) ?? null,
        terminalId: (t.terminal_id as string) ?? null,
        orderTimestamp: (t.order_timestamp as string) ?? null,
        businessDate: (t.business_date as string) ?? null,
        stationItemCount: items.length,
        stationReadyCount: items.filter((i) => i.itemStatus === 'ready').length,
        alertLevel: Number(t.elapsed_seconds) >= criticalThreshold ? 'critical' :
          Number(t.elapsed_seconds) >= warningThreshold ? 'warning' : 'normal',
        courseGroups: buildCourseGroups(items),
      });
    }

    return {
      tickets: ticketCards,
      activeTicketCount: ticketCards.length,
      stationCount: stationIds.size,
      warningThresholdSeconds: warningThreshold,
      criticalThresholdSeconds: criticalThreshold,
    };
  });
}
