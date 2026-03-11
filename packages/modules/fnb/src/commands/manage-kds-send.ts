import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { logger } from '@oppsera/core/observability';
import type { RequestContext } from '@oppsera/core/auth/context';

/**
 * Retry a failed/orphaned KDS send. Creates a new send tracking row linked to the original.
 */
export async function retryKdsSend(
  ctx: RequestContext,
  sendId: string,
): Promise<{ newSendId: string; newSendToken: string }> {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Fetch original send (location-scoped for multi-location isolation)
    const origRows = await tx.execute(sql`
      SELECT * FROM fnb_kds_send_tracking
      WHERE tenant_id = ${ctx.tenantId} AND location_id = ${ctx.locationId!} AND id = ${sendId}
      FOR UPDATE
    `);
    const origArr = Array.from(origRows as Iterable<Record<string, unknown>>);
    if (origArr.length === 0) throw new Error(`KDS send ${sendId} not found`);
    const orig = origArr[0]!;

    if (!['failed', 'orphaned'].includes(orig.status as string)) {
      throw new Error(`Cannot retry send in status "${orig.status}". Only failed/orphaned sends can be retried.`);
    }

    // Generate new send token (never reuse)
    const tokenRows = await tx.execute(sql`SELECT gen_ulid() AS token`);
    const newToken = Array.from(tokenRows as Iterable<Record<string, unknown>>)[0]!.token as string;

    // Mark original as resolved (retry initiated)
    await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET needs_attention = false, stuck_reason = NULL, updated_at = NOW()
      WHERE id = ${sendId} AND tenant_id = ${ctx.tenantId}
    `);

    // Create new retry send tracking row
    const newRows = await tx.execute(sql`
      INSERT INTO fnb_kds_send_tracking (
        id, tenant_id, location_id, order_id, ticket_id, ticket_number,
        course_id, course_number, station_id, station_name,
        terminal_id, terminal_name, employee_id, employee_name,
        send_token, prior_send_token, send_type, routing_reason,
        status, item_count, order_type, table_name, guest_name,
        queued_at, retry_count, business_date, created_at, updated_at
      ) VALUES (
        gen_ulid(), ${ctx.tenantId}, ${orig.location_id as string},
        ${(orig.order_id as string) ?? null}, ${orig.ticket_id as string}, ${Number(orig.ticket_number)},
        ${(orig.course_id as string) ?? null}, ${orig.course_number != null ? Number(orig.course_number) : null},
        ${orig.station_id as string}, ${orig.station_name as string},
        ${(orig.terminal_id as string) ?? null}, ${(orig.terminal_name as string) ?? null},
        ${ctx.user.id ?? null}, ${ctx.user.name ?? null},
        ${newToken}, ${orig.send_token as string},
        'retry', ${(orig.routing_reason as string) ?? null},
        'queued', ${Number(orig.item_count)}, ${(orig.order_type as string) ?? null},
        ${(orig.table_name as string) ?? null}, ${(orig.guest_name as string) ?? null},
        NOW(), ${Number(orig.retry_count ?? 0) + 1}, ${orig.business_date as string}, NOW(), NOW()
      )
      RETURNING id, send_token
    `);

    const newRow = Array.from(newRows as Iterable<Record<string, unknown>>)[0]!;
    const newSendId = newRow.id as string;

    // Create retry event on the new send
    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at,
        actor_type, actor_id, actor_name,
        previous_status, new_status, metadata, created_at
      ) VALUES (
        gen_ulid(), ${ctx.tenantId}, ${orig.location_id as string},
        ${newSendId}, ${newToken},
        ${orig.ticket_id as string}, ${orig.station_id as string},
        'retry', NOW(), 'employee', ${ctx.user.id ?? null}, ${ctx.user.name ?? null},
        NULL, 'queued', ${JSON.stringify({ retriedFromSendId: sendId, originalSendToken: orig.send_token })},
        NOW()
      )
    `);

    // Event on original send documenting the retry
    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at,
        actor_type, actor_id, actor_name,
        metadata, created_at
      ) VALUES (
        gen_ulid(), ${ctx.tenantId}, ${orig.location_id as string},
        ${sendId}, ${orig.send_token as string},
        ${orig.ticket_id as string}, ${orig.station_id as string},
        'retry', NOW(), 'employee', ${ctx.user.id ?? null}, ${ctx.user.name ?? null},
        ${JSON.stringify({ newSendId, newSendToken: newToken })},
        NOW()
      )
    `);

    // Transition new retry send to 'sent' so it appears as dispatched
    // (the ticket already exists — the retry just re-associates tracking)
    await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'sent', sent_at = NOW(), updated_at = NOW()
      WHERE id = ${newSendId} AND tenant_id = ${ctx.tenantId} AND status = 'queued'
    `);

    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at, actor_type,
        previous_status, new_status, created_at
      ) VALUES (
        gen_ulid(), ${ctx.tenantId}, ${orig.location_id as string},
        ${newSendId}, ${newToken},
        ${orig.ticket_id as string}, ${orig.station_id as string},
        'sent', NOW(), 'system', 'queued', 'sent', NOW()
      )
    `);

    return { newSendId, newSendToken: newToken };
  });

  auditLogDeferred(ctx, 'fnb.kds_send.retried', 'fnb_kds_send_tracking', sendId);

  logger.info('[kds] send retried', {
    domain: 'kds', tenantId: ctx.tenantId,
    originalSendId: sendId, newSendId: result.newSendId, newSendToken: result.newSendToken,
  });

  return result;
}

/**
 * Mark a KDS send as resolved (staff handled the issue).
 */
export async function resolveKdsSend(
  ctx: RequestContext,
  sendId: string,
  reason?: string,
): Promise<void> {
  await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(),
          needs_attention = false, stuck_reason = NULL
      WHERE tenant_id = ${ctx.tenantId} AND location_id = ${ctx.locationId!} AND id = ${sendId}
        AND status NOT IN ('resolved', 'deleted')
      RETURNING id, ticket_id, station_id, location_id, send_token, status
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) return;
    const r = arr[0]!;

    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at,
        actor_type, actor_id, actor_name,
        previous_status, new_status, metadata, created_at
      ) VALUES (
        gen_ulid(), ${ctx.tenantId}, ${r.location_id as string},
        ${sendId}, ${r.send_token as string},
        ${r.ticket_id as string}, ${r.station_id as string},
        'resolved', NOW(), 'employee', ${ctx.user.id ?? null}, ${ctx.user.name ?? null},
        ${r.status as string}, 'resolved',
        ${reason ? JSON.stringify({ reason }) : null},
        NOW()
      )
    `);
  });

  auditLogDeferred(ctx, 'fnb.kds_send.resolved', 'fnb_kds_send_tracking', sendId);
}

/**
 * Soft-delete a KDS send (hidden from active views but preserved in history).
 */
export async function softDeleteKdsSend(
  ctx: RequestContext,
  sendId: string,
  reason?: string,
): Promise<void> {
  await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'deleted', deleted_at = NOW(), updated_at = NOW(),
          deleted_by_employee_id = ${ctx.user.id ?? null},
          delete_reason = ${reason ?? null},
          needs_attention = false, stuck_reason = NULL
      WHERE tenant_id = ${ctx.tenantId} AND location_id = ${ctx.locationId!} AND id = ${sendId}
        AND deleted_at IS NULL
      RETURNING id, ticket_id, station_id, location_id, send_token, status
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) return;
    const r = arr[0]!;

    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at,
        actor_type, actor_id, actor_name,
        previous_status, new_status, metadata, created_at
      ) VALUES (
        gen_ulid(), ${ctx.tenantId}, ${r.location_id as string},
        ${sendId}, ${r.send_token as string},
        ${r.ticket_id as string}, ${r.station_id as string},
        'deleted', NOW(), 'employee', ${ctx.user.id ?? null}, ${ctx.user.name ?? null},
        ${r.status as string}, 'deleted',
        ${reason ? JSON.stringify({ reason }) : null},
        NOW()
      )
    `);
  });

  auditLogDeferred(ctx, 'fnb.kds_send.soft_deleted', 'fnb_kds_send_tracking', sendId);
}

/**
 * Bulk soft-delete KDS sends (up to 100 at a time).
 */
export async function bulkSoftDeleteKdsSends(
  ctx: RequestContext,
  sendIds: string[],
  reason?: string,
): Promise<{ deletedCount: number }> {
  if (sendIds.length === 0) return { deletedCount: 0 };

  const deletedCount = await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'deleted', deleted_at = NOW(), updated_at = NOW(),
          deleted_by_employee_id = ${ctx.user.id ?? null},
          delete_reason = ${reason ?? null},
          needs_attention = false, stuck_reason = NULL
      WHERE tenant_id = ${ctx.tenantId}
        AND location_id = ${ctx.locationId!}
        AND id = ANY(${sendIds}::text[])
        AND deleted_at IS NULL
      RETURNING id, ticket_id, station_id, location_id, send_token, status
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    // Create events for each deleted send
    for (const r of arr) {
      await tx.execute(sql`
        INSERT INTO fnb_kds_send_events (
          id, tenant_id, location_id, send_tracking_id, send_token,
          ticket_id, station_id, event_type, event_at,
          actor_type, actor_id, actor_name,
          previous_status, new_status, metadata, created_at
        ) VALUES (
          gen_ulid(), ${ctx.tenantId}, ${r.location_id as string},
          ${r.id as string}, ${r.send_token as string},
          ${r.ticket_id as string}, ${r.station_id as string},
          'deleted', NOW(), 'employee', ${ctx.user.id ?? null}, ${ctx.user.name ?? null},
          ${r.status as string}, 'deleted',
          ${reason ? JSON.stringify({ reason, bulk: true }) : JSON.stringify({ bulk: true })},
          NOW()
        )
      `);
    }

    return arr.length;
  });

  logger.info('[kds] bulk soft-delete', {
    domain: 'kds', tenantId: ctx.tenantId, count: deletedCount, sendIds,
  });

  return { deletedCount };
}

/**
 * Bulk resolve KDS sends (up to 100 at a time).
 */
export async function bulkResolveKdsSends(
  ctx: RequestContext,
  sendIds: string[],
  reason?: string,
): Promise<{ resolvedCount: number }> {
  if (sendIds.length === 0) return { resolvedCount: 0 };

  const resolvedCount = await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(),
          needs_attention = false, stuck_reason = NULL
      WHERE tenant_id = ${ctx.tenantId}
        AND location_id = ${ctx.locationId!}
        AND id = ANY(${sendIds}::text[])
        AND status NOT IN ('resolved', 'deleted')
      RETURNING id, ticket_id, station_id, location_id, send_token, status
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    for (const r of arr) {
      await tx.execute(sql`
        INSERT INTO fnb_kds_send_events (
          id, tenant_id, location_id, send_tracking_id, send_token,
          ticket_id, station_id, event_type, event_at,
          actor_type, actor_id, actor_name,
          previous_status, new_status, metadata, created_at
        ) VALUES (
          gen_ulid(), ${ctx.tenantId}, ${r.location_id as string},
          ${r.id as string}, ${r.send_token as string},
          ${r.ticket_id as string}, ${r.station_id as string},
          'resolved', NOW(), 'employee', ${ctx.user.id ?? null}, ${ctx.user.name ?? null},
          ${r.status as string}, 'resolved',
          ${reason ? JSON.stringify({ reason, bulk: true }) : JSON.stringify({ bulk: true })},
          NOW()
        )
      `);
    }

    return arr.length;
  });

  logger.info('[kds] bulk resolve', {
    domain: 'kds', tenantId: ctx.tenantId, count: resolvedCount, sendIds,
  });

  return { resolvedCount };
}

/**
 * Update the KDS operational status on a send tracking record
 * (when the kitchen ticket status changes).
 */
export async function updateKdsSendOperationalStatus(
  tenantId: string,
  ticketId: string,
  stationId: string,
  newOperationalStatus: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    // Update all active sends for this ticket/station
    await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET kds_operational_status = ${newOperationalStatus}, updated_at = NOW(),
          completed_at = CASE WHEN ${newOperationalStatus} IN ('served', 'voided') THEN NOW() ELSE completed_at END
      WHERE tenant_id = ${tenantId}
        AND ticket_id = ${ticketId}
        AND station_id = ${stationId}
        AND deleted_at IS NULL
        AND status NOT IN ('deleted', 'resolved')
    `);
  });
}
