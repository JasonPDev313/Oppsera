import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetTabDetailInput } from '../validation';
import { TabNotFoundError } from '../errors';

export interface TabCourseDetail {
  id: string;
  courseNumber: number;
  courseName: string;
  courseStatus: string;
  firedAt: string | null;
  sentAt: string | null;
  servedAt: string | null;
}

export interface TabTransferRecord {
  id: string;
  transferType: string;
  fromServerUserId: string | null;
  toServerUserId: string | null;
  fromTableId: string | null;
  toTableId: string | null;
  reason: string | null;
  transferredBy: string;
  transferredAt: string;
}

export interface TabLineItem {
  id: string;
  catalogItemId: string;
  catalogItemName: string;
  seatNumber: number;
  courseNumber: number;
  qty: number;
  unitPriceCents: number;
  extendedPriceCents: number;
  modifiers: unknown[];
  specialInstructions: string | null;
  status: string;
  sentAt: string | null;
  firedAt: string | null;
}

export interface FnbTabDetail {
  id: string;
  tabNumber: number;
  tabType: string;
  status: string;
  tableId: string | null;
  tableNumber: number | null;
  displayLabel: string | null;
  roomName: string | null;
  serverUserId: string;
  serverName: string | null;
  partySize: number | null;
  guestName: string | null;
  serviceType: string;
  businessDate: string;
  currentCourseNumber: number;
  primaryOrderId: string | null;
  customerId: string | null;
  splitFromTabId: string | null;
  splitStrategy: string | null;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  version: number;
  metadata: Record<string, unknown> | null;
  courses: TabCourseDetail[];
  transfers: TabTransferRecord[];
  lines: TabLineItem[];
}

export async function getTabDetail(
  input: GetTabDetailInput,
): Promise<FnbTabDetail> {
  return withTenant(input.tenantId, async (tx) => {
    // Get tab with table and server info
    const tabRows = await tx.execute(
      sql`SELECT
            t.id, t.tab_number, t.tab_type, t.status,
            t.table_id, t.server_user_id, t.party_size, t.guest_name,
            t.service_type, t.business_date, t.current_course_number,
            t.primary_order_id, t.customer_id, t.split_from_tab_id,
            t.split_strategy, t.opened_at, t.closed_at, t.opened_by,
            t.version, t.metadata,
            ft.table_number, ft.display_label,
            fpr.name AS room_name,
            u.name AS server_name
          FROM fnb_tabs t
          LEFT JOIN fnb_tables ft ON ft.id = t.table_id
          LEFT JOIN floor_plan_rooms fpr ON fpr.id = ft.room_id
          LEFT JOIN users u ON u.id = t.server_user_id
          WHERE t.id = ${input.tabId} AND t.tenant_id = ${input.tenantId}
          LIMIT 1`,
    );

    const tabArr = Array.from(tabRows as Iterable<Record<string, unknown>>);
    if (tabArr.length === 0) throw new TabNotFoundError(input.tabId);
    const r = tabArr[0]!;

    // Fetch courses, transfers, and items in parallel — all only depend on tabId
    const [courseRows, transferRows, itemRows] = await Promise.all([
      tx.execute(
        sql`SELECT id, course_number, course_name, course_status,
                   fired_at, sent_at, served_at
            FROM fnb_tab_courses
            WHERE tab_id = ${input.tabId} AND tenant_id = ${input.tenantId}
            ORDER BY course_number ASC`,
      ),
      tx.execute(
        sql`SELECT id, transfer_type, from_server_user_id, to_server_user_id,
                   from_table_id, to_table_id, reason, transferred_by, transferred_at
            FROM fnb_tab_transfers
            WHERE tab_id = ${input.tabId} AND tenant_id = ${input.tenantId}
            ORDER BY transferred_at DESC`,
      ),
      tx.execute(
        sql`SELECT id, catalog_item_id, catalog_item_name, seat_number,
                   course_number, quantity, unit_price_cents, extended_price_cents,
                   modifiers, special_instructions, status, sent_at, fired_at
            FROM fnb_tab_items
            WHERE tab_id = ${input.tabId} AND tenant_id = ${input.tenantId}
            ORDER BY course_number ASC, sort_order ASC, created_at ASC`,
      ),
    ]);

    const courses = Array.from(courseRows as Iterable<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      courseNumber: Number(c.course_number),
      courseName: c.course_name as string,
      courseStatus: c.course_status as string,
      firedAt: (c.fired_at as string) ?? null,
      sentAt: (c.sent_at as string) ?? null,
      servedAt: (c.served_at as string) ?? null,
    }));

    const transfers = Array.from(transferRows as Iterable<Record<string, unknown>>).map((tr) => ({
      id: tr.id as string,
      transferType: tr.transfer_type as string,
      fromServerUserId: (tr.from_server_user_id as string) ?? null,
      toServerUserId: (tr.to_server_user_id as string) ?? null,
      fromTableId: (tr.from_table_id as string) ?? null,
      toTableId: (tr.to_table_id as string) ?? null,
      reason: (tr.reason as string) ?? null,
      transferredBy: tr.transferred_by as string,
      transferredAt: tr.transferred_at as string,
    }));

    const lines = Array.from(itemRows as Iterable<Record<string, unknown>>).map((li) => ({
      id: li.id as string,
      catalogItemId: li.catalog_item_id as string,
      catalogItemName: li.catalog_item_name as string,
      seatNumber: Number(li.seat_number),
      courseNumber: Number(li.course_number),
      qty: Number(li.quantity),
      unitPriceCents: Number(li.unit_price_cents),
      extendedPriceCents: Number(li.extended_price_cents),
      modifiers: (li.modifiers as unknown[]) ?? [],
      specialInstructions: (li.special_instructions as string) ?? null,
      status: li.status as string,
      sentAt: (li.sent_at as string) ?? null,
      firedAt: (li.fired_at as string) ?? null,
    }));

    return {
      id: r.id as string,
      tabNumber: Number(r.tab_number),
      tabType: r.tab_type as string,
      status: r.status as string,
      tableId: (r.table_id as string) ?? null,
      tableNumber: r.table_number != null ? Number(r.table_number) : null,
      displayLabel: (r.display_label as string) ?? null,
      roomName: (r.room_name as string) ?? null,
      serverUserId: r.server_user_id as string,
      serverName: (r.server_name as string) ?? null,
      partySize: r.party_size != null ? Number(r.party_size) : null,
      guestName: (r.guest_name as string) ?? null,
      serviceType: r.service_type as string,
      businessDate: r.business_date as string,
      currentCourseNumber: Number(r.current_course_number),
      primaryOrderId: (r.primary_order_id as string) ?? null,
      customerId: (r.customer_id as string) ?? null,
      splitFromTabId: (r.split_from_tab_id as string) ?? null,
      splitStrategy: (r.split_strategy as string) ?? null,
      openedAt: r.opened_at as string,
      closedAt: (r.closed_at as string) ?? null,
      openedBy: r.opened_by as string,
      version: Number(r.version),
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      courses,
      transfers,
      lines,
    };
  });
}
