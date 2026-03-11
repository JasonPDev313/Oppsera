import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetExpoViewInput } from '../validation';

export interface ExpoCourseGroup {
  courseName: string;
  itemCount: number;
  readyCount: number;
  allReady: boolean;
}

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
  specialInstructions: string | null;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
  readyAt: string | null;
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
  businessDate: string | null;
  items: ExpoTicketItem[];
  allItemsReady: boolean;
  readyCount: number;
  totalCount: number;
  /** Alert level based on elapsed time: 'normal' | 'warning' | 'critical' */
  alertLevel: 'normal' | 'warning' | 'critical';
  /** Items grouped by course — only populated when items have courseName */
  courseGroups: ExpoCourseGroup[];
}

function buildExpoCourseGroups(items: ExpoTicketItem[]): ExpoCourseGroup[] {
  const byCourseName = new Map<string, ExpoTicketItem[]>();
  for (const item of items) {
    if (!item.courseName) continue;
    const arr = byCourseName.get(item.courseName) ?? [];
    arr.push(item);
    byCourseName.set(item.courseName, arr);
  }
  const groups: ExpoCourseGroup[] = [];
  for (const [courseName, courseItems] of byCourseName) {
    const readyCount = courseItems.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'served').length;
    groups.push({
      courseName,
      itemCount: courseItems.length,
      readyCount,
      allReady: readyCount === courseItems.length,
    });
  }
  return groups;
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
    // Get all active tickets — no business_date filter so stale tickets
    // from previous days remain visible until bumped or voided.
    const ticketRows = await tx.execute(
      sql`SELECT id, ticket_number, tab_id, course_number, status,
                 priority_level, is_held, order_type, channel,
                 table_number, server_name, customer_name,
                 sent_at, estimated_pickup_at, business_date,
                 GREATEST(0, EXTRACT(EPOCH FROM (NOW() - sent_at))::integer) AS elapsed_seconds
          FROM fnb_kitchen_tickets
          WHERE tenant_id = ${input.tenantId}
            AND location_id = ${input.locationId}
            AND status IN ('pending', 'in_progress', 'ready')
          ORDER BY priority_level DESC NULLS LAST, sent_at ASC
          LIMIT ${input.limit ?? 200}`,
    );
    const tickets = Array.from(ticketRows as Iterable<Record<string, unknown>>);

    // Batch-fetch ALL items for ALL tickets in a single query (fixes N+1).
    // Same pattern used in get-kds-view.ts.
    const ticketIds = tickets.map((t) => t.id as string);
    const itemsByTicket = new Map<string, ExpoTicketItem[]>();

    if (ticketIds.length > 0) {
      const allItemRows = await tx.execute(
        sql`SELECT kti.id, kti.ticket_id, kti.item_name, kti.kitchen_label, kti.item_color,
                   kti.modifier_summary, kti.special_instructions, kti.seat_number,
                   kti.course_name, kti.quantity, kti.item_status,
                   kti.priority_level, kti.estimated_prep_seconds,
                   kti.station_id,
                   kti.is_rush, kti.is_allergy, kti.is_vip, kti.ready_at,
                   ks.display_name AS station_name
            FROM fnb_kitchen_ticket_items kti
            LEFT JOIN fnb_kitchen_stations ks ON ks.id = kti.station_id
            WHERE kti.ticket_id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})
              AND kti.item_status != 'voided'
            ORDER BY kti.priority_level DESC NULLS LAST, kti.seat_number NULLS LAST, kti.id ASC`,
      );
      for (const r of Array.from(allItemRows as Iterable<Record<string, unknown>>)) {
        const tId = r.ticket_id as string;
        const item: ExpoTicketItem = {
          itemId: r.id as string,
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
          estimatedPrepSeconds: r.estimated_prep_seconds != null ? Math.max(0, Number(r.estimated_prep_seconds)) : null,
          stationId: (r.station_id as string) ?? null,
          stationName: (r.station_name as string) ?? null,
          isRush: (r.is_rush as boolean) ?? false,
          isAllergy: (r.is_allergy as boolean) ?? false,
          isVip: (r.is_vip as boolean) ?? false,
          readyAt: r.ready_at instanceof Date ? r.ready_at.toISOString() : (r.ready_at as string) ?? null,
        };
        const arr = itemsByTicket.get(tId) ?? [];
        arr.push(item);
        itemsByTicket.set(tId, arr);
      }
    }

    // Expo uses default thresholds (8 min warning, 12 min critical)
    // TODO: Make configurable via fnb_kds_location_settings when needed
    const EXPO_WARN_SECONDS = 480;
    const EXPO_CRIT_SECONDS = 720;

    const expoCards: ExpoTicketCard[] = [];
    let ticketsAllReady = 0;

    for (const t of tickets) {
      const items = itemsByTicket.get(t.id as string) ?? [];
      // Skip tickets where all items were voided (no non-voided items remain)
      if (items.length === 0) continue;
      const readyCount = items.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'served').length;
      const totalCount = items.length;
      const allItemsReady = totalCount > 0 && readyCount === totalCount;

      if (allItemsReady) ticketsAllReady++;

      expoCards.push({
        ticketId: t.id as string,
        ticketNumber: Number(t.ticket_number),
        tabId: t.tab_id as string,
        courseNumber: t.course_number != null ? Number(t.course_number) : null,
        status: t.status as string,
        priorityLevel: Number(t.priority_level ?? 0),
        isHeld: Boolean(t.is_held),
        orderType: (t.order_type as string) ?? null,
        channel: (t.channel as string) ?? null,
        tableNumber: t.table_number != null ? Number(t.table_number) : null,
        serverName: (t.server_name as string) ?? null,
        customerName: (t.customer_name as string) ?? null,
        sentAt: t.sent_at as string,
        estimatedPickupAt: (t.estimated_pickup_at as string) ?? null,
        elapsedSeconds: Number(t.elapsed_seconds),
        businessDate: (t.business_date as string) ?? null,
        items,
        allItemsReady,
        readyCount,
        totalCount,
        alertLevel: Number(t.elapsed_seconds) >= EXPO_CRIT_SECONDS ? 'critical' :
          Number(t.elapsed_seconds) >= EXPO_WARN_SECONDS ? 'warning' : 'normal',
        courseGroups: buildExpoCourseGroups(items),
      });
    }

    return {
      tickets: expoCards,
      totalActiveTickets: expoCards.length,
      ticketsAllReady,
    };
  });
}
