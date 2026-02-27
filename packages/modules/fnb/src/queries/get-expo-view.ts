import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetExpoViewInput } from '../validation';

export interface ExpoTicketItem {
  itemId: string;
  itemName: string;
  kitchenLabel: string | null;
  itemColor: string | null;
  modifierSummary: string | null;
  seatNumber: number | null;
  courseName: string | null;
  quantity: number;
  itemStatus: string;
  priorityLevel: number;
  estimatedPrepSeconds: number | null;
  stationId: string | null;
  stationName: string | null;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
}

export interface ExpoTicketCard {
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
  items: ExpoTicketItem[];
  allItemsReady: boolean;
  readyCount: number;
  totalCount: number;
}

export interface ExpoView {
  tickets: ExpoTicketCard[];
  totalActiveTickets: number;
  ticketsAllReady: number;
}

export async function getExpoView(
  input: GetExpoViewInput,
): Promise<ExpoView> {
  return withTenant(input.tenantId, async (tx) => {
    // Get all active tickets
    const ticketRows = await tx.execute(
      sql`SELECT id, ticket_number, tab_id, course_number, status,
                 priority_level, is_held, order_type, channel,
                 table_number, server_name, customer_name,
                 sent_at, estimated_pickup_at,
                 EXTRACT(EPOCH FROM (NOW() - sent_at))::integer AS elapsed_seconds
          FROM fnb_kitchen_tickets
          WHERE tenant_id = ${input.tenantId}
            AND location_id = ${input.locationId}
            AND business_date = ${input.businessDate}
            AND status IN ('pending', 'in_progress', 'ready')
          ORDER BY priority_level DESC NULLS LAST, sent_at ASC`,
    );
    const tickets = Array.from(ticketRows as Iterable<Record<string, unknown>>);

    const expoCards: ExpoTicketCard[] = [];
    let ticketsAllReady = 0;

    for (const t of tickets) {
      const itemRows = await tx.execute(
        sql`SELECT kti.id, kti.item_name, kti.kitchen_label, kti.item_color,
                   kti.modifier_summary, kti.seat_number,
                   kti.course_name, kti.quantity, kti.item_status,
                   kti.priority_level, kti.estimated_prep_seconds,
                   kti.station_id,
                   kti.is_rush, kti.is_allergy, kti.is_vip,
                   ks.display_name AS station_name
            FROM fnb_kitchen_ticket_items kti
            LEFT JOIN fnb_kitchen_stations ks ON ks.id = kti.station_id
            WHERE kti.ticket_id = ${t.id as string}
              AND kti.item_status != 'voided'
            ORDER BY kti.priority_level DESC NULLS LAST, kti.seat_number NULLS LAST, kti.id ASC`,
      );
      const items = Array.from(itemRows as Iterable<Record<string, unknown>>).map((r) => ({
        itemId: r.id as string,
        itemName: r.item_name as string,
        kitchenLabel: (r.kitchen_label as string) ?? null,
        itemColor: (r.item_color as string) ?? null,
        modifierSummary: (r.modifier_summary as string) ?? null,
        seatNumber: r.seat_number != null ? Number(r.seat_number) : null,
        courseName: (r.course_name as string) ?? null,
        quantity: Number(r.quantity),
        itemStatus: r.item_status as string,
        priorityLevel: Number(r.priority_level ?? 0),
        estimatedPrepSeconds: r.estimated_prep_seconds != null ? Number(r.estimated_prep_seconds) : null,
        stationId: (r.station_id as string) ?? null,
        stationName: (r.station_name as string) ?? null,
        isRush: r.is_rush as boolean,
        isAllergy: r.is_allergy as boolean,
        isVip: r.is_vip as boolean,
      }));

      const activeItems = items.filter((i) => i.itemStatus !== 'voided');
      const readyCount = activeItems.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'served').length;
      const totalCount = activeItems.length;
      const allItemsReady = totalCount > 0 && readyCount === totalCount;

      if (allItemsReady) ticketsAllReady++;

      expoCards.push({
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
        items,
        allItemsReady,
        readyCount,
        totalCount,
      });
    }

    return {
      tickets: expoCards,
      totalActiveTickets: expoCards.length,
      ticketsAllReady,
    };
  });
}
