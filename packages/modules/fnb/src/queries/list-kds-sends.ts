import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export type KdsSendStatus = 'queued' | 'sent' | 'delivered' | 'displayed' | 'failed' | 'orphaned' | 'resolved' | 'deleted';
export type KdsSendType = 'initial' | 'retry' | 'manual_resend' | 'fire_course' | 'recall' | 'reroute';

export interface KdsSendListItem {
  id: string;
  ticketId: string;
  ticketNumber: number;
  orderId: string | null;
  stationId: string;
  stationName: string;
  terminalName: string | null;
  employeeName: string | null;
  sendToken: string;
  sendType: string;
  status: KdsSendStatus;
  kdsOperationalStatus: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  itemCount: number;
  orderType: string | null;
  tableName: string | null;
  guestName: string | null;
  retryCount: number;
  needsAttention: boolean;
  stuckReason: string | null;
  businessDate: string;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  displayedAt: string | null;
  failedAt: string | null;
  resolvedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Seconds since sent (for age display) */
  ageSinceSentSeconds: number | null;
}

export interface KdsSendListResult {
  data: KdsSendListItem[];
  meta: { cursor: string | null; hasMore: boolean; totalCount: number };
}

export interface ListKdsSendsInput {
  tenantId: string;
  locationId: string;
  /** Tab: active | needs_attention | history | all */
  tab?: 'active' | 'needs_attention' | 'history' | 'all';
  status?: KdsSendStatus;
  stationId?: string;
  terminalId?: string;
  employeeId?: string;
  sendType?: KdsSendType;
  errorCode?: string;
  ticketNumber?: number;
  sendToken?: string;
  businessDate?: string;
  dateFrom?: string;
  dateTo?: string;
  orderType?: string;
  cursor?: string;
  limit?: number;
}

export async function listKdsSends(input: ListKdsSendsInput): Promise<KdsSendListResult> {
  const limit = Math.min(input.limit ?? 50, 200);

  return withTenant(input.tenantId, async (tx) => {
    // Build WHERE conditions dynamically
    const conditions: ReturnType<typeof sql>[] = [
      sql`s.tenant_id = ${input.tenantId}`,
      sql`s.location_id = ${input.locationId}`,
    ];

    // Tab-based filtering
    if (input.tab === 'active') {
      conditions.push(sql`s.status IN ('queued', 'sent', 'delivered', 'displayed')`);
      conditions.push(sql`s.deleted_at IS NULL`);
    } else if (input.tab === 'needs_attention') {
      conditions.push(sql`s.needs_attention = true`);
      conditions.push(sql`s.deleted_at IS NULL`);
      conditions.push(sql`s.resolved_at IS NULL`);
    } else if (input.tab === 'history') {
      conditions.push(sql`s.status IN ('resolved', 'deleted', 'failed', 'orphaned') OR s.completed_at IS NOT NULL`);
    }
    // 'all' has no extra tab filter

    if (input.status) conditions.push(sql`s.status = ${input.status}`);
    if (input.stationId) conditions.push(sql`s.station_id = ${input.stationId}`);
    if (input.terminalId) conditions.push(sql`s.terminal_id = ${input.terminalId}`);
    if (input.employeeId) conditions.push(sql`s.employee_id = ${input.employeeId}`);
    if (input.sendType) conditions.push(sql`s.send_type = ${input.sendType}`);
    if (input.errorCode) conditions.push(sql`s.error_code = ${input.errorCode}`);
    if (input.ticketNumber) conditions.push(sql`s.ticket_number = ${input.ticketNumber}`);
    if (input.sendToken) conditions.push(sql`s.send_token = ${input.sendToken}`);
    if (input.businessDate) conditions.push(sql`s.business_date = ${input.businessDate}`);
    if (input.dateFrom) conditions.push(sql`s.business_date >= ${input.dateFrom}`);
    if (input.dateTo) conditions.push(sql`s.business_date <= ${input.dateTo}`);
    if (input.orderType) conditions.push(sql`s.order_type = ${input.orderType}`);
    if (input.cursor) conditions.push(sql`s.created_at < ${input.cursor}`);

    const whereClause = sql.join(conditions, sql` AND `);

    // Count query
    const countRows = await tx.execute(sql`
      SELECT COUNT(*)::integer AS cnt
      FROM fnb_kds_send_tracking s
      WHERE ${whereClause}
    `);
    const totalCount = Number(
      Array.from(countRows as Iterable<Record<string, unknown>>)[0]?.cnt ?? 0
    );

    // Data query
    const rows = await tx.execute(sql`
      SELECT s.*,
        CASE WHEN s.sent_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (NOW() - s.sent_at))::integer
          ELSE NULL
        END AS age_since_sent_seconds
      FROM fnb_kds_send_tracking s
      WHERE ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = items.length > limit;
    if (hasMore) items.pop();

    const data: KdsSendListItem[] = items.map((r) => ({
      id: r.id as string,
      ticketId: r.ticket_id as string,
      ticketNumber: Number(r.ticket_number),
      orderId: (r.order_id as string) ?? null,
      stationId: r.station_id as string,
      stationName: r.station_name as string,
      terminalName: (r.terminal_name as string) ?? null,
      employeeName: (r.employee_name as string) ?? null,
      sendToken: r.send_token as string,
      sendType: r.send_type as string,
      status: r.status as KdsSendStatus,
      kdsOperationalStatus: (r.kds_operational_status as string) ?? null,
      errorCode: (r.error_code as string) ?? null,
      errorDetail: (r.error_detail as string) ?? null,
      itemCount: Number(r.item_count ?? 0),
      orderType: (r.order_type as string) ?? null,
      tableName: (r.table_name as string) ?? null,
      guestName: (r.guest_name as string) ?? null,
      retryCount: Number(r.retry_count ?? 0),
      needsAttention: r.needs_attention as boolean,
      stuckReason: (r.stuck_reason as string) ?? null,
      businessDate: r.business_date as string,
      queuedAt: (r.queued_at as string) ?? null,
      sentAt: (r.sent_at as string) ?? null,
      deliveredAt: (r.delivered_at as string) ?? null,
      displayedAt: (r.displayed_at as string) ?? null,
      failedAt: (r.failed_at as string) ?? null,
      resolvedAt: (r.resolved_at as string) ?? null,
      deletedAt: (r.deleted_at as string) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      ageSinceSentSeconds: r.age_since_sent_seconds != null ? Number(r.age_since_sent_seconds) : null,
    }));

    const lastItem = data[data.length - 1];
    return {
      data,
      meta: {
        cursor: hasMore && lastItem ? lastItem.createdAt : null,
        hasMore,
        totalCount,
      },
    };
  });
}
