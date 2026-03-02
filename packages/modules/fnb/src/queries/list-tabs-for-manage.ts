import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ManageTabsQuery } from '../validation';

export interface ManageTabListItem {
  id: string;
  tabNumber: number;
  guestName: string | null;
  status: string;
  serviceMode: string;
  tableId: string | null;
  tableLabel: string | null;
  serverUserId: string | null;
  serverName: string | null;
  partySize: number | null;
  courseCount: number;
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
  version: number;
  orderTotal: number | null;
  amountPaid: number | null;
  balance: number | null;
  openDurationMinutes: number;
  groupKey: string | null;
  groupLabel: string | null;
}

export interface ManageTabListResult {
  items: ManageTabListItem[];
  cursor: string | null;
  hasMore: boolean;
}

const NEEDS_ATTENTION_STATUSES = ['check_requested', 'paying', 'abandoned'];
const OPEN_ONLY_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested', 'split', 'paying'];

function computeAgeBucket(minutes: number): { key: string; label: string } {
  if (minutes < 30) return { key: 'age_0_30', label: 'Under 30 min' };
  if (minutes < 60) return { key: 'age_30_60', label: '30–60 min' };
  if (minutes < 120) return { key: 'age_60_120', label: '1–2 hours' };
  if (minutes < 240) return { key: 'age_120_240', label: '2–4 hours' };
  return { key: 'age_240_plus', label: 'Over 4 hours' };
}

export async function listTabsForManage(
  input: ManageTabsQuery,
): Promise<ManageTabListResult> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [];

    if (input.locationId) {
      conditions.push(sql`t.location_id = ${input.locationId}`);
    }

    if (input.businessDate) {
      conditions.push(sql`t.business_date = ${input.businessDate}`);
    }

    if (input.serverUserId) {
      conditions.push(sql`t.server_user_id = ${input.serverUserId}`);
    }

    // viewMode presets override explicit statuses
    if (input.viewMode === 'open_only') {
      conditions.push(sql`t.status = ANY(${OPEN_ONLY_STATUSES})`);
    } else if (input.viewMode === 'needs_attention') {
      conditions.push(sql`t.status = ANY(${NEEDS_ATTENTION_STATUSES})`);
    } else if (input.statuses && input.statuses.length > 0) {
      conditions.push(sql`t.status = ANY(${input.statuses})`);
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(sql`(
        t.tab_number::text ILIKE ${pattern}
        OR t.guest_name ILIKE ${pattern}
        OR ft.display_label ILIKE ${pattern}
      )`);
    }

    if (input.cursor) {
      conditions.push(sql`t.id < ${input.cursor}`);
    }

    const whereClause = conditions.length > 0
      ? sql`AND ${sql.join(conditions, sql` AND `)}`
      : sql``;

    // Build grouping prefix for ORDER BY
    let groupOrderPrefix: ReturnType<typeof sql> | null = null;
    switch (input.groupBy) {
      case 'server':
        groupOrderPrefix = sql`COALESCE(u.display_name, 'Unassigned'),`;
        break;
      case 'table':
        groupOrderPrefix = sql`COALESCE(ft.display_label, 'No Table'),`;
        break;
      case 'status':
        groupOrderPrefix = sql`t.status,`;
        break;
      case 'age':
        groupOrderPrefix = sql`CASE
          WHEN EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 < 30 THEN 1
          WHEN EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 < 60 THEN 2
          WHEN EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 < 120 THEN 3
          WHEN EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 < 240 THEN 4
          ELSE 5
        END,`;
        break;
    }

    let sortClause: ReturnType<typeof sql>;
    switch (input.sortBy) {
      case 'newest':
        sortClause = sql`t.opened_at DESC, t.id DESC`;
        break;
      case 'highest_balance':
        sortClause = sql`COALESCE(order_agg.order_total - tender_agg.amount_paid, 0) DESC, t.id DESC`;
        break;
      case 'recently_updated':
        sortClause = sql`t.updated_at DESC, t.id DESC`;
        break;
      case 'oldest':
      default:
        sortClause = sql`t.opened_at ASC, t.id ASC`;
        break;
    }

    const orderBy = groupOrderPrefix
      ? sql`${groupOrderPrefix} ${sortClause}`
      : sortClause;

    const limit = input.limit ?? 100;

    const amountJoins = input.includeAmounts
      ? sql`
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(o.total_cents), 0) AS order_total
          FROM orders o
          WHERE o.tenant_id = t.tenant_id
            AND o.tab_id = t.id
            AND o.status NOT IN ('voided', 'cancelled')
        ) order_agg ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(td.amount), 0) AS amount_paid
          FROM tenders td
          WHERE td.tenant_id = t.tenant_id
            AND td.order_id IN (
              SELECT o2.id FROM orders o2
              WHERE o2.tenant_id = t.tenant_id AND o2.tab_id = t.id
            )
            AND td.status != 'reversed'
        ) tender_agg ON true`
      : sql``;

    const amountCols = input.includeAmounts
      ? sql`, order_agg.order_total, tender_agg.amount_paid`
      : sql``;

    const rows = await (tx as any).execute(sql`
      SELECT
        t.id,
        t.tab_number,
        t.guest_name,
        t.status,
        t.service_mode,
        t.table_id,
        ft.display_label AS table_label,
        t.server_user_id,
        u.display_name AS server_name,
        t.party_size,
        t.course_count,
        t.opened_at,
        t.updated_at,
        t.closed_at,
        t.version,
        EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 AS open_duration_minutes
        ${amountCols}
      FROM fnb_tabs t
      LEFT JOIN fnb_tables ft ON ft.id = t.table_id AND ft.tenant_id = t.tenant_id
      LEFT JOIN users u ON u.id = t.server_user_id
      ${amountJoins}
      WHERE t.tenant_id = (select current_setting('app.current_tenant_id', true))
        ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = (hasMore ? allRows.slice(0, limit) : allRows).map((r) => {
      const durationMins = Math.round(Number(r.open_duration_minutes ?? 0));

      // Compute groupKey/groupLabel based on groupBy
      let groupKey: string | null = null;
      let groupLabel: string | null = null;
      switch (input.groupBy) {
        case 'server':
          groupKey = (r.server_user_id as string) ?? 'unassigned';
          groupLabel = (r.server_name as string) ?? 'Unassigned';
          break;
        case 'table':
          groupKey = (r.table_id as string) ?? 'no_table';
          groupLabel = (r.table_label as string) ?? 'No Table';
          break;
        case 'status':
          groupKey = r.status as string;
          groupLabel = (r.status as string).replace(/_/g, ' ');
          break;
        case 'age': {
          const bucket = computeAgeBucket(durationMins);
          groupKey = bucket.key;
          groupLabel = bucket.label;
          break;
        }
      }

      return {
        id: r.id as string,
        tabNumber: Number(r.tab_number),
        guestName: (r.guest_name as string) ?? null,
        status: r.status as string,
        serviceMode: r.service_mode as string,
        tableId: (r.table_id as string) ?? null,
        tableLabel: (r.table_label as string) ?? null,
        serverUserId: (r.server_user_id as string) ?? null,
        serverName: (r.server_name as string) ?? null,
        partySize: r.party_size != null ? Number(r.party_size) : null,
        courseCount: Number(r.course_count ?? 0),
        openedAt: String(r.opened_at),
        updatedAt: String(r.updated_at),
        closedAt: r.closed_at ? String(r.closed_at) : null,
        version: Number(r.version),
        orderTotal: r.order_total != null ? Number(r.order_total) : null,
        amountPaid: r.amount_paid != null ? Number(r.amount_paid) : null,
        balance: r.order_total != null
          ? Number(r.order_total) - Number(r.amount_paid ?? 0)
          : null,
        openDurationMinutes: durationMins,
        groupKey,
        groupLabel,
      };
    });

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
