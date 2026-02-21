import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListTabsFilterInput } from '../validation';

export interface FnbTabListItem {
  id: string;
  tabNumber: number;
  tabType: string;
  status: string;
  tableId: string | null;
  tableNumber: number | null;
  displayLabel: string | null;
  serverUserId: string;
  serverName: string | null;
  partySize: number | null;
  guestName: string | null;
  serviceType: string;
  businessDate: string;
  currentCourseNumber: number;
  openedAt: string;
  closedAt: string | null;
  version: number;
}

export async function listTabs(
  input: ListTabsFilterInput,
): Promise<{ items: FnbTabListItem[]; cursor: string | null; hasMore: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`t.tenant_id = ${input.tenantId}`,
    ];

    if (input.locationId) {
      conditions.push(sql`t.location_id = ${input.locationId}`);
    }
    if (input.businessDate) {
      conditions.push(sql`t.business_date = ${input.businessDate}`);
    }
    if (input.serverUserId) {
      conditions.push(sql`t.server_user_id = ${input.serverUserId}`);
    }
    if (input.tableId) {
      conditions.push(sql`t.table_id = ${input.tableId}`);
    }
    if (input.status) {
      conditions.push(sql`t.status = ${input.status}`);
    }
    if (input.cursor) {
      conditions.push(sql`t.id < ${input.cursor}`);
    }

    const limit = input.limit ?? 50;
    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT
            t.id, t.tab_number, t.tab_type, t.status,
            t.table_id, t.server_user_id, t.party_size, t.guest_name,
            t.service_type, t.business_date, t.current_course_number,
            t.opened_at, t.closed_at, t.version,
            ft.table_number, ft.display_label,
            u.name AS server_name
          FROM fnb_tabs t
          LEFT JOIN fnb_tables ft ON ft.id = t.table_id
          LEFT JOIN users u ON u.id = t.server_user_id
          WHERE ${whereClause}
          ORDER BY t.id DESC
          LIMIT ${limit + 1}`,
    );

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = (hasMore ? allRows.slice(0, limit) : allRows).map((r) => ({
      id: r.id as string,
      tabNumber: Number(r.tab_number),
      tabType: r.tab_type as string,
      status: r.status as string,
      tableId: (r.table_id as string) ?? null,
      tableNumber: r.table_number != null ? Number(r.table_number) : null,
      displayLabel: (r.display_label as string) ?? null,
      serverUserId: r.server_user_id as string,
      serverName: (r.server_name as string) ?? null,
      partySize: r.party_size != null ? Number(r.party_size) : null,
      guestName: (r.guest_name as string) ?? null,
      serviceType: r.service_type as string,
      businessDate: r.business_date as string,
      currentCourseNumber: Number(r.current_course_number),
      openedAt: r.opened_at as string,
      closedAt: (r.closed_at as string) ?? null,
      version: Number(r.version),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
