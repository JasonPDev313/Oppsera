import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListTableStatusHistoryInput } from '../validation';

export interface TableStatusHistoryItem {
  id: string;
  tableId: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  partySize: number | null;
  serverUserId: string | null;
  tabId: string | null;
  metadata: Record<string, unknown> | null;
  changedAt: string;
}

export async function listTableStatusHistory(
  input: ListTableStatusHistoryInput,
): Promise<{ items: TableStatusHistoryItem[]; cursor: string | null; hasMore: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const limit = Math.min(input.limit ?? 50, 100);

    const startFilter = input.startDate
      ? sql`AND h.changed_at >= ${input.startDate}::timestamptz`
      : sql``;

    const endFilter = input.endDate
      ? sql`AND h.changed_at <= ${input.endDate}::timestamptz`
      : sql``;

    const cursorFilter = input.cursor
      ? sql`AND h.id < ${input.cursor}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        h.id,
        h.table_id,
        h.old_status,
        h.new_status,
        h.changed_by,
        h.party_size,
        h.server_user_id,
        h.tab_id,
        h.metadata,
        h.changed_at
      FROM fnb_table_status_history h
      WHERE h.tenant_id = ${input.tenantId}
        AND h.table_id = ${input.tableId}
        ${startFilter}
        ${endFilter}
        ${cursorFilter}
      ORDER BY h.changed_at DESC, h.id DESC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tableId: String(row.table_id),
      oldStatus: row.old_status ? String(row.old_status) : null,
      newStatus: String(row.new_status),
      changedBy: row.changed_by ? String(row.changed_by) : null,
      partySize: row.party_size != null ? Number(row.party_size) : null,
      serverUserId: row.server_user_id ? String(row.server_user_id) : null,
      tabId: row.tab_id ? String(row.tab_id) : null,
      metadata: (row.metadata as Record<string, unknown>) ?? null,
      changedAt: String(row.changed_at),
    }));

    const hasMore = items.length > limit;
    const displayItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? displayItems[displayItems.length - 1]!.id : null;

    return { items: displayItems, cursor: nextCursor, hasMore };
  });
}
