import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetExpoViewInput } from '../validation';

export interface ExpoHistoryItem {
  itemId: string;
  itemName: string;
  kitchenLabel: string | null;
  quantity: number;
  modifierSummary: string | null;
  stationName: string | null;
}

export interface ExpoHistoryTicket {
  ticketId: string;
  ticketNumber: number;
  tabId: string;
  courseNumber: number | null;
  orderType: string | null;
  tableNumber: number | null;
  serverName: string | null;
  customerName: string | null;
  sentAt: string;
  servedAt: string | null;
  durationSeconds: number;
  items: ExpoHistoryItem[];
}

export interface ExpoHistory {
  tickets: ExpoHistoryTicket[];
  totalServed: number;
}

/**
 * Returns tickets served from expo today (by served_at timestamp),
 * ordered by most recently served first. Uses served_at date range
 * rather than business_date to handle overnight/cross-day tickets.
 */
export async function getExpoHistory(
  input: GetExpoViewInput,
): Promise<ExpoHistory> {
  return withTenant(input.tenantId, async (tx) => {
    // Get accurate total count for the day — filter by served_at date rather
    // than business_date so tickets carried over from a previous business day
    // (or created with the 4 AM rollover offset) still appear when served today.
    const [countRow] = Array.from(await tx.execute(
      sql`SELECT COUNT(*)::integer AS cnt
          FROM fnb_kitchen_tickets
          WHERE tenant_id = ${input.tenantId}
            AND location_id = ${input.locationId}
            AND status = 'served'
            AND served_at >= ${input.businessDate}::date
            AND served_at < (${input.businessDate}::date + INTERVAL '1 day')`,
    ) as Iterable<Record<string, unknown>>);
    const totalCount = Number(countRow?.cnt ?? 0);

    const ticketRows = await tx.execute(
      sql`SELECT id, ticket_number, tab_id, course_number, order_type,
                 table_number, server_name, customer_name,
                 sent_at, served_at,
                 COALESCE(
                   EXTRACT(EPOCH FROM (served_at - sent_at))::integer,
                   0
                 ) AS duration_seconds
          FROM fnb_kitchen_tickets
          WHERE tenant_id = ${input.tenantId}
            AND location_id = ${input.locationId}
            AND status = 'served'
            AND served_at >= ${input.businessDate}::date
            AND served_at < (${input.businessDate}::date + INTERVAL '1 day')
          ORDER BY served_at DESC NULLS LAST
          LIMIT 200`,
    );
    const tickets = Array.from(ticketRows as Iterable<Record<string, unknown>>);

    const ticketIds = tickets.map((t) => t.id as string);
    const itemsByTicket = new Map<string, ExpoHistoryItem[]>();

    if (ticketIds.length > 0) {
      const allItemRows = await tx.execute(
        sql`SELECT kti.id, kti.ticket_id, kti.item_name, kti.kitchen_label,
                   kti.quantity, kti.modifier_summary,
                   ks.display_name AS station_name
            FROM fnb_kitchen_ticket_items kti
            LEFT JOIN fnb_kitchen_stations ks ON ks.id = kti.station_id
            WHERE kti.ticket_id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})
              AND kti.item_status != 'voided'
            ORDER BY kti.seat_number NULLS LAST, kti.id ASC`,
      );
      for (const r of Array.from(allItemRows as Iterable<Record<string, unknown>>)) {
        const tId = r.ticket_id as string;
        const item: ExpoHistoryItem = {
          itemId: r.id as string,
          itemName: r.item_name as string,
          kitchenLabel: (r.kitchen_label as string) ?? null,
          quantity: Number(r.quantity),
          modifierSummary: (r.modifier_summary as string) ?? null,
          stationName: (r.station_name as string) ?? null,
        };
        const arr = itemsByTicket.get(tId) ?? [];
        arr.push(item);
        itemsByTicket.set(tId, arr);
      }
    }

    const historyCards: ExpoHistoryTicket[] = tickets.map((t) => ({
      ticketId: t.id as string,
      ticketNumber: Number(t.ticket_number),
      tabId: t.tab_id as string,
      courseNumber: t.course_number != null ? Number(t.course_number) : null,
      orderType: (t.order_type as string) ?? null,
      tableNumber: t.table_number != null ? Number(t.table_number) : null,
      serverName: (t.server_name as string) ?? null,
      customerName: (t.customer_name as string) ?? null,
      sentAt: t.sent_at as string,
      servedAt: (t.served_at as string) ?? null,
      durationSeconds: Number(t.duration_seconds),
      items: itemsByTicket.get(t.id as string) ?? [],
    }));

    return {
      tickets: historyCards,
      totalServed: totalCount,
    };
  });
}
