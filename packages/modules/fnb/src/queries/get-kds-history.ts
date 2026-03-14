import { sql, eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbKitchenStations } from '@oppsera/db';
import type { GetKdsViewInput } from '../validation';
import { StationNotFoundError, ExpoStationError } from '../errors';
import type { KdsTicketItem, KdsTicketCard } from './get-kds-view';
import { buildCourseGroups, clampNonNeg, safeNum } from './get-kds-view';

export interface KdsHistoryView {
  stationId: string;
  stationName: string;
  stationType: string;
  tickets: KdsTicketCard[];
  totalCount: number;
}

/**
 * Fetch completed tickets (bumped/served) at a station with full item details.
 * Used by the KDS History view so staff can see and recall mistakenly bumped orders.
 *
 * Returns tickets where ALL items at this station are ready/served/voided
 * (i.e., nothing left pending/in_progress/cooking at this station).
 */
export async function getKdsHistory(
  input: GetKdsViewInput,
): Promise<KdsHistoryView> {
  if (!input.locationId) {
    throw new StationNotFoundError(input.stationId);
  }
  const resolvedLocationId = input.locationId;

  return withTenant(input.tenantId, async (tx) => {
    // Validate station exists and is not expo
    const stationArr = await tx
      .select({
        id: fnbKitchenStations.id,
        name: fnbKitchenStations.name,
        displayName: fnbKitchenStations.displayName,
        stationType: fnbKitchenStations.stationType,
      })
      .from(fnbKitchenStations)
      .where(
        and(
          eq(fnbKitchenStations.id, input.stationId),
          eq(fnbKitchenStations.tenantId, input.tenantId),
          eq(fnbKitchenStations.locationId, resolvedLocationId),
        ),
      )
      .limit(1);
    const station = stationArr[0];
    if (!station) throw new StationNotFoundError(input.stationId);
    if (station.stationType === 'expo') throw new ExpoStationError(input.stationId);

    // CTE: first identify completed ticket IDs with their completion timestamp.
    // A ticket is "completed at this station" when ALL items at this station are
    // ready/served/voided AND at least one item is ready/served (not all voided).
    // This avoids DISTINCT + window function ambiguity from the item-level JOIN.
    const ticketRows = await tx.execute(
      sql`WITH completed_ids AS (
            SELECT kt.id,
                   COALESCE(MAX(kti.served_at), MAX(kti.ready_at)) AS completed_at
            FROM fnb_kitchen_tickets kt
            INNER JOIN fnb_kitchen_ticket_items kti
              ON kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}
            WHERE kt.tenant_id = ${input.tenantId}
              AND kt.location_id = ${resolvedLocationId}
              AND kt.business_date = ${input.businessDate}
              AND NOT EXISTS (
                SELECT 1 FROM fnb_kitchen_ticket_items kti2
                WHERE kti2.ticket_id = kt.id
                  AND kti2.station_id = ${input.stationId}
                  AND kti2.item_status NOT IN ('ready', 'served', 'voided')
              )
              AND EXISTS (
                SELECT 1 FROM fnb_kitchen_ticket_items kti3
                WHERE kti3.ticket_id = kt.id
                  AND kti3.station_id = ${input.stationId}
                  AND kti3.item_status IN ('ready', 'served')
              )
            GROUP BY kt.id
            ORDER BY COALESCE(MAX(kti.served_at), MAX(kti.ready_at)) DESC NULLS LAST
            LIMIT 50
          )
          SELECT kt.id, kt.ticket_number, kt.tab_id, kt.course_number,
                 kt.status, kt.priority_level, kt.is_held, kt.order_type,
                 kt.channel, kt.table_number, kt.server_name, kt.customer_name,
                 kt.sent_at, kt.estimated_pickup_at, kt.business_date,
                 EXTRACT(EPOCH FROM (NOW() - kt.sent_at))::integer AS elapsed_seconds,
                 ci.completed_at,
                 o.source AS order_source, o.terminal_id, o.created_at AS order_timestamp,
                 t.title AS terminal_name,
                 COALESCE(tc.course_name, cd.course_name) AS course_name
          FROM completed_ids ci
          INNER JOIN fnb_kitchen_tickets kt ON kt.id = ci.id
          LEFT JOIN orders o
            ON o.id = kt.order_id AND o.tenant_id = kt.tenant_id
          LEFT JOIN terminals t
            ON t.id = o.terminal_id AND t.tenant_id = kt.tenant_id
          LEFT JOIN fnb_tab_courses tc
            ON tc.tab_id = kt.tab_id AND tc.course_number = kt.course_number AND tc.tenant_id = kt.tenant_id
          LEFT JOIN fnb_course_definitions cd
            ON cd.tenant_id = kt.tenant_id AND cd.location_id = kt.location_id
            AND cd.course_number = kt.course_number AND cd.is_active = true
          ORDER BY ci.completed_at DESC NULLS LAST`,
    );
    const tickets = Array.from(ticketRows as Iterable<Record<string, unknown>>);

    // Batch-fetch all items for completed tickets at this station
    const ticketIds = tickets.map((t) => t.id as string);
    const itemsByTicket = new Map<string, KdsTicketItem[]>();

    if (ticketIds.length > 0) {
      const allItemRows = await tx.execute(
        sql`SELECT ticket_id, id, order_line_id, item_name, kitchen_label, item_color,
                   modifier_summary, special_instructions,
                   seat_number, course_name, quantity, item_status, station_id,
                   priority_level, estimated_prep_seconds, routing_rule_id,
                   is_rush, is_allergy, is_vip,
                   started_at, ready_at, bumped_by,
                   EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at)))::integer AS elapsed_seconds
            FROM fnb_kitchen_ticket_items
            WHERE ticket_id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})
              AND station_id = ${input.stationId}
            ORDER BY ticket_id, priority_level DESC NULLS LAST, seat_number NULLS LAST, id ASC`,
      );
      for (const r of Array.from(allItemRows as Iterable<Record<string, unknown>>)) {
        const tid = r.ticket_id as string;
        const item: KdsTicketItem = {
          itemId: r.id as string,
          orderLineId: r.order_line_id as string,
          itemName: (r.item_name as string) ?? 'Unknown Item',
          kitchenLabel: (r.kitchen_label as string) ?? null,
          itemColor: (r.item_color as string) ?? null,
          modifierSummary: (r.modifier_summary as string) ?? null,
          specialInstructions: (r.special_instructions as string) ?? null,
          seatNumber: r.seat_number != null ? safeNum(r.seat_number) : null,
          courseName: (r.course_name as string) ?? null,
          quantity: safeNum(r.quantity, 1),
          itemStatus: (r.item_status as string) ?? 'pending',
          priorityLevel: safeNum(r.priority_level),
          estimatedPrepSeconds: r.estimated_prep_seconds != null ? safeNum(r.estimated_prep_seconds) : null,
          routingRuleId: (r.routing_rule_id as string) ?? null,
          stationId: (r.station_id as string) ?? null,
          isRush: !!r.is_rush,
          isAllergy: !!r.is_allergy,
          isVip: !!r.is_vip,
          startedAt: (r.started_at as string) ?? null,
          readyAt: (r.ready_at as string) ?? null,
          bumpedBy: (r.bumped_by as string) ?? null,
          elapsedSeconds: clampNonNeg(safeNum(r.elapsed_seconds)),
        };
        if (!itemsByTicket.has(tid)) itemsByTicket.set(tid, []);
        itemsByTicket.get(tid)!.push(item);
      }
    }

    const ticketCards: KdsTicketCard[] = tickets.map((t) => {
      const items = itemsByTicket.get(t.id as string) ?? [];
      const elapsed = clampNonNeg(safeNum(t.elapsed_seconds));
      return {
        ticketId: t.id as string,
        ticketNumber: safeNum(t.ticket_number),
        tabId: (t.tab_id as string) ?? '',
        courseNumber: t.course_number != null ? safeNum(t.course_number) : null,
        courseName: (t.course_name as string) ?? null,
        status: (t.status as string) ?? 'pending',
        priorityLevel: safeNum(t.priority_level),
        isHeld: !!t.is_held,
        orderType: (t.order_type as string) ?? null,
        channel: (t.channel as string) ?? null,
        tableNumber: t.table_number != null ? safeNum(t.table_number) : null,
        serverName: (t.server_name as string) ?? null,
        customerName: (t.customer_name as string) ?? null,
        sentAt: (t.sent_at as string) ?? new Date().toISOString(),
        estimatedPickupAt: (t.estimated_pickup_at as string) ?? null,
        elapsedSeconds: elapsed,
        items,
        otherStations: [],
        orderSource: (t.order_source as string) ?? null,
        terminalId: (t.terminal_id as string) ?? null,
        terminalName: (t.terminal_name as string) ?? null,
        orderTimestamp: (t.order_timestamp as string) ?? null,
        businessDate: (t.business_date as string) ?? null,
        stationItemCount: items.filter((i) => i.itemStatus !== 'voided').length,
        stationReadyCount: items.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'served').length,
        alertLevel: 'normal', // History tickets don't need alert levels
        courseGroups: buildCourseGroups(items),
        totalOrderItems: items.filter((i) => i.itemStatus !== 'voided').length,
        totalOrderReadyItems: items.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'served').length,
      };
    });

    return {
      stationId: input.stationId,
      stationName: station.displayName ?? station.name ?? 'Station',
      stationType: station.stationType,
      tickets: ticketCards,
      totalCount: ticketCards.length,
    };
  });
}
