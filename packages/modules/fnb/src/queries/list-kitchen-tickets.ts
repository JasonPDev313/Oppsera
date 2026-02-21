import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListKitchenTicketsFilterInput } from '../validation';

export interface KitchenTicketListItem {
  id: string;
  ticketNumber: number;
  tabId: string;
  orderId: string;
  courseNumber: number | null;
  status: string;
  businessDate: string;
  sentAt: string;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  tableNumber: number | null;
  serverName: string | null;
  itemCount: number;
  version: number;
}

export async function listKitchenTickets(
  input: ListKitchenTicketsFilterInput,
): Promise<{ items: KitchenTicketListItem[]; cursor: string | null; hasMore: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`kt.tenant_id = ${input.tenantId}`,
      sql`kt.location_id = ${input.locationId}`,
      sql`kt.business_date = ${input.businessDate}`,
    ];

    if (input.status) {
      conditions.push(sql`kt.status = ${input.status}`);
    }
    if (input.tabId) {
      conditions.push(sql`kt.tab_id = ${input.tabId}`);
    }
    if (input.cursor) {
      conditions.push(sql`kt.id < ${input.cursor}`);
    }

    // If stationId filter is set, filter by tickets that have items at that station
    let stationJoin = sql``;
    if (input.stationId) {
      stationJoin = sql`INNER JOIN fnb_kitchen_ticket_items kti
        ON kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}`;
    }

    const limit = input.limit ?? 100;
    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT DISTINCT
            kt.id, kt.ticket_number, kt.tab_id, kt.order_id,
            kt.course_number, kt.status, kt.business_date,
            kt.sent_at, kt.started_at, kt.ready_at, kt.served_at,
            kt.table_number, kt.server_name, kt.version,
            (SELECT COUNT(*) FROM fnb_kitchen_ticket_items WHERE ticket_id = kt.id) AS item_count
          FROM fnb_kitchen_tickets kt
          ${stationJoin}
          WHERE ${whereClause}
          ORDER BY kt.id DESC
          LIMIT ${limit + 1}`,
    );

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = (hasMore ? allRows.slice(0, limit) : allRows).map((r) => ({
      id: r.id as string,
      ticketNumber: Number(r.ticket_number),
      tabId: r.tab_id as string,
      orderId: r.order_id as string,
      courseNumber: r.course_number != null ? Number(r.course_number) : null,
      status: r.status as string,
      businessDate: r.business_date as string,
      sentAt: r.sent_at as string,
      startedAt: (r.started_at as string) ?? null,
      readyAt: (r.ready_at as string) ?? null,
      servedAt: (r.served_at as string) ?? null,
      tableNumber: r.table_number != null ? Number(r.table_number) : null,
      serverName: (r.server_name as string) ?? null,
      itemCount: Number(r.item_count),
      version: Number(r.version),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
