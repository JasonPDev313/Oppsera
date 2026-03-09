import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';

export interface RecordKdsSendInput {
  tenantId: string;
  locationId: string;
  orderId?: string;
  ticketId: string;
  ticketNumber: number;
  courseId?: string;
  courseNumber?: number;
  stationId: string;
  stationName: string;
  terminalId?: string;
  terminalName?: string;
  employeeId?: string;
  employeeName?: string;
  sendToken: string;
  priorSendToken?: string;
  sendType?: string;
  routingReason?: string;
  itemCount: number;
  orderType?: string;
  tableName?: string;
  guestName?: string;
  businessDate: string;
}

export interface RecordKdsSendResult {
  id: string;
  sendToken: string;
}

/**
 * Records a new KDS send tracking row when a kitchen ticket is dispatched to a station.
 * Also creates the initial 'queued' event.
 */
export async function recordKdsSend(input: RecordKdsSendInput): Promise<RecordKdsSendResult> {
  const result = await withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      INSERT INTO fnb_kds_send_tracking (
        id, tenant_id, location_id, order_id, ticket_id, ticket_number,
        course_id, course_number, station_id, station_name,
        terminal_id, terminal_name, employee_id, employee_name,
        send_token, prior_send_token, send_type, routing_reason,
        status, item_count, order_type, table_name, guest_name,
        queued_at, business_date, created_at, updated_at
      ) VALUES (
        gen_ulid(), ${input.tenantId}, ${input.locationId},
        ${input.orderId ?? null}, ${input.ticketId}, ${input.ticketNumber},
        ${input.courseId ?? null}, ${input.courseNumber ?? null},
        ${input.stationId}, ${input.stationName},
        ${input.terminalId ?? null}, ${input.terminalName ?? null},
        ${input.employeeId ?? null}, ${input.employeeName ?? null},
        ${input.sendToken}, ${input.priorSendToken ?? null},
        ${input.sendType ?? 'initial'}, ${input.routingReason ?? null},
        'queued', ${input.itemCount}, ${input.orderType ?? null},
        ${input.tableName ?? null}, ${input.guestName ?? null},
        NOW(), ${input.businessDate}, NOW(), NOW()
      )
      RETURNING id, send_token
    `);

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    const sendId = row.id as string;

    // Create initial queued event
    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at, actor_type,
        new_status, created_at
      ) VALUES (
        gen_ulid(), ${input.tenantId}, ${input.locationId},
        ${sendId}, ${input.sendToken},
        ${input.ticketId}, ${input.stationId},
        'queued', NOW(), 'system', 'queued', NOW()
      )
    `);

    return { id: sendId, sendToken: row.send_token as string };
  });

  logger.debug('[kds] send tracked', {
    domain: 'kds',
    tenantId: input.tenantId,
    ticketId: input.ticketId,
    stationId: input.stationId,
    sendToken: input.sendToken,
  });

  return result;
}

/**
 * Marks a KDS send as successfully sent (payload published).
 */
export async function markKdsSendSent(
  tenantId: string,
  sendToken: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'sent', sent_at = NOW(), updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND send_token = ${sendToken}
        AND status = 'queued'
    `);

    // Get the tracking ID for the event
    const trackingRows = await tx.execute(sql`
      SELECT id, ticket_id, station_id, location_id
      FROM fnb_kds_send_tracking
      WHERE tenant_id = ${tenantId} AND send_token = ${sendToken}
    `);
    const tracking = Array.from(trackingRows as Iterable<Record<string, unknown>>)[0];
    if (!tracking) return;

    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at, actor_type,
        previous_status, new_status, created_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${tracking.location_id as string},
        ${tracking.id as string}, ${sendToken},
        ${tracking.ticket_id as string}, ${tracking.station_id as string},
        'sent', NOW(), 'system', 'queued', 'sent', NOW()
      )
    `);
  });
}

/**
 * Marks a KDS send as failed.
 */
export async function markKdsSendFailed(
  tenantId: string,
  sendToken: string,
  errorCode: string,
  errorDetail?: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'failed', failed_at = NOW(), updated_at = NOW(),
          error_code = ${errorCode}, error_detail = ${errorDetail ?? null},
          needs_attention = true, stuck_reason = ${errorCode}
      WHERE tenant_id = ${tenantId}
        AND send_token = ${sendToken}
        AND status IN ('queued', 'sent')
    `);

    const trackingRows = await tx.execute(sql`
      SELECT id, ticket_id, station_id, location_id
      FROM fnb_kds_send_tracking
      WHERE tenant_id = ${tenantId} AND send_token = ${sendToken}
    `);
    const tracking = Array.from(trackingRows as Iterable<Record<string, unknown>>)[0];
    if (!tracking) return;

    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at, actor_type,
        new_status, metadata, created_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${tracking.location_id as string},
        ${tracking.id as string}, ${sendToken},
        ${tracking.ticket_id as string}, ${tracking.station_id as string},
        'failed', NOW(), 'system', 'failed',
        ${JSON.stringify({ errorCode, errorDetail: errorDetail ?? null })},
        NOW()
      )
    `);
  });
}
