import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface KdsSendEvent {
  id: string;
  eventType: string;
  eventAt: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  metadata: Record<string, unknown> | null;
}

export interface KdsSendDetail {
  id: string;
  ticketId: string;
  ticketNumber: number;
  orderId: string | null;
  courseId: string | null;
  courseNumber: number | null;
  stationId: string;
  stationName: string;
  terminalId: string | null;
  terminalName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  sendToken: string;
  priorSendToken: string | null;
  sendType: string;
  routingReason: string | null;
  status: string;
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
  firstInteractionAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  clearedAt: string | null;
  deletedAt: string | null;
  deletedByEmployeeId: string | null;
  deleteReason: string | null;
  lastRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Seconds since sent */
  ageSinceSentSeconds: number | null;
  /** Delivery latency in ms (sent → delivered) */
  deliveryLatencyMs: number | null;
  /** Display latency in ms (delivered → displayed) */
  displayLatencyMs: number | null;
  /** Full event timeline */
  events: KdsSendEvent[];
  /** Ticket items at this station */
  ticketItems: KdsSendTicketItem[];
}

export interface KdsSendTicketItem {
  id: string;
  itemName: string;
  kitchenLabel: string | null;
  quantity: number;
  itemStatus: string;
  seatNumber: number | null;
  courseName: string | null;
  modifierSummary: string | null;
  specialInstructions: string | null;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
}

/**
 * Get full detail for a single KDS send tracking record, including event timeline and ticket items.
 */
export async function getKdsSendDetail(
  tenantId: string,
  locationId: string,
  sendId: string,
): Promise<KdsSendDetail | null> {
  return withTenant(tenantId, async (tx) => {
    // Fetch the send record (filtered by location for multi-location isolation)
    const sendRows = await tx.execute(sql`
      SELECT s.*,
        CASE WHEN s.sent_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (NOW() - s.sent_at))::integer
          ELSE NULL
        END AS age_since_sent_seconds,
        CASE WHEN s.sent_at IS NOT NULL AND s.delivered_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (s.delivered_at - s.sent_at))::numeric * 1000
          ELSE NULL
        END AS delivery_latency_ms,
        CASE WHEN s.delivered_at IS NOT NULL AND s.displayed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (s.displayed_at - s.delivered_at))::numeric * 1000
          ELSE NULL
        END AS display_latency_ms
      FROM fnb_kds_send_tracking s
      WHERE s.tenant_id = ${tenantId}
        AND s.location_id = ${locationId}
        AND s.id = ${sendId}
    `);

    const sendArr = Array.from(sendRows as Iterable<Record<string, unknown>>);
    if (sendArr.length === 0) return null;
    const r = sendArr[0]!;

    // Fetch events timeline
    const eventRows = await tx.execute(sql`
      SELECT id, event_type, event_at, actor_type, actor_id, actor_name,
             previous_status, new_status, metadata
      FROM fnb_kds_send_events
      WHERE tenant_id = ${tenantId}
        AND send_tracking_id = ${sendId}
      ORDER BY event_at ASC
    `);

    const events: KdsSendEvent[] = Array.from(eventRows as Iterable<Record<string, unknown>>).map((e) => ({
      id: e.id as string,
      eventType: e.event_type as string,
      eventAt: e.event_at as string,
      actorType: e.actor_type as string,
      actorId: (e.actor_id as string) ?? null,
      actorName: (e.actor_name as string) ?? null,
      previousStatus: (e.previous_status as string) ?? null,
      newStatus: (e.new_status as string) ?? null,
      metadata: (e.metadata as Record<string, unknown>) ?? null,
    }));

    // Fetch ticket items at this station
    const itemRows = await tx.execute(sql`
      SELECT ti.id, ti.item_name, ti.kitchen_label, ti.quantity, ti.item_status,
             ti.seat_number, ti.course_name, ti.modifier_summary, ti.special_instructions,
             ti.is_rush, ti.is_allergy, ti.is_vip
      FROM fnb_kitchen_ticket_items ti
      WHERE ti.ticket_id = ${r.ticket_id as string}
        AND ti.station_id = ${r.station_id as string}
      ORDER BY ti.seat_number NULLS LAST, ti.course_name NULLS LAST
    `);

    const ticketItems: KdsSendTicketItem[] = Array.from(itemRows as Iterable<Record<string, unknown>>).map((i) => ({
      id: i.id as string,
      itemName: i.item_name as string,
      kitchenLabel: (i.kitchen_label as string) ?? null,
      quantity: Number(i.quantity ?? 1),
      itemStatus: i.item_status as string,
      seatNumber: i.seat_number != null ? Number(i.seat_number) : null,
      courseName: (i.course_name as string) ?? null,
      modifierSummary: (i.modifier_summary as string) ?? null,
      specialInstructions: (i.special_instructions as string) ?? null,
      isRush: i.is_rush as boolean,
      isAllergy: i.is_allergy as boolean,
      isVip: i.is_vip as boolean,
    }));

    return {
      id: r.id as string,
      ticketId: r.ticket_id as string,
      ticketNumber: Number(r.ticket_number),
      orderId: (r.order_id as string) ?? null,
      courseId: (r.course_id as string) ?? null,
      courseNumber: r.course_number != null ? Number(r.course_number) : null,
      stationId: r.station_id as string,
      stationName: r.station_name as string,
      terminalId: (r.terminal_id as string) ?? null,
      terminalName: (r.terminal_name as string) ?? null,
      employeeId: (r.employee_id as string) ?? null,
      employeeName: (r.employee_name as string) ?? null,
      sendToken: r.send_token as string,
      priorSendToken: (r.prior_send_token as string) ?? null,
      sendType: r.send_type as string,
      routingReason: (r.routing_reason as string) ?? null,
      status: r.status as string,
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
      firstInteractionAt: (r.first_interaction_at as string) ?? null,
      completedAt: (r.completed_at as string) ?? null,
      failedAt: (r.failed_at as string) ?? null,
      clearedAt: (r.cleared_at as string) ?? null,
      deletedAt: (r.deleted_at as string) ?? null,
      deletedByEmployeeId: (r.deleted_by_employee_id as string) ?? null,
      deleteReason: (r.delete_reason as string) ?? null,
      lastRetryAt: (r.last_retry_at as string) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      ageSinceSentSeconds: r.age_since_sent_seconds != null ? Number(r.age_since_sent_seconds) : null,
      deliveryLatencyMs: r.delivery_latency_ms != null ? Math.round(Number(r.delivery_latency_ms)) : null,
      displayLatencyMs: r.display_latency_ms != null ? Math.round(Number(r.display_latency_ms)) : null,
      events,
      ticketItems,
    };
  });
}
