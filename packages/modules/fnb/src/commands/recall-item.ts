import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTicketItems, fnbKitchenTickets, fnbKitchenStations } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { RecallItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import {
  TicketItemNotFoundError, TicketItemStatusConflictError,
  TicketStatusConflictError, TicketVersionConflictError,
  StationMismatchError, StationInactiveError,
} from '../errors';
import { isLocationAllowedForTicket } from '../helpers/kds-location-guard';

export async function recallItem(
  ctx: RequestContext,
  input: RecallItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'recallItem',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    const [item] = await tx
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!item) throw new TicketItemNotFoundError(input.ticketItemId);

    // Fix #4: Station ownership — item must belong to the caller's station
    if (item.stationId !== input.stationId) {
      throw new StationMismatchError(input.ticketItemId, input.stationId, item.stationId);
    }

    // Defense-in-depth: verify item's ticket belongs to caller's location (venue→site aware)
    if (ctx.locationId) {
      const [parentTicket] = await tx
        .select({ locationId: fnbKitchenTickets.locationId })
        .from(fnbKitchenTickets)
        .where(and(
          eq(fnbKitchenTickets.id, item.ticketId),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
        ))
        .limit(1);
      if (parentTicket) {
        const allowed = await isLocationAllowedForTicket(tx, ctx.tenantId, ctx.locationId, parentTicket.locationId);
        if (!allowed) throw new TicketItemNotFoundError(input.ticketItemId);
      }
    }

    // Guard: only ready/served items can be recalled
    if (item.itemStatus !== 'ready' && item.itemStatus !== 'served') {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'recall');
    }

    // Guard: cannot recall items on a voided ticket (checked BEFORE mutation)
    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, item.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);

    if (ticket && ticket.status === 'voided') {
      throw new TicketStatusConflictError(item.ticketId, 'voided', 'recall item');
    }

    // Fix #5: Guard against inactive/deleted station
    const [station] = await tx
      .select({ id: fnbKitchenStations.id, isActive: fnbKitchenStations.isActive, displayName: fnbKitchenStations.displayName })
      .from(fnbKitchenStations)
      .where(and(
        eq(fnbKitchenStations.id, input.stationId),
        eq(fnbKitchenStations.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!station || !station.isActive) {
      throw new StationInactiveError(input.stationId);
    }

    // Un-bump: set back to cooking, clear bump attribution and timestamps
    const now = new Date();
    const [updated] = await tx
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'cooking',
        readyAt: null,
        servedAt: null,
        startedAt: null,
        bumpedBy: null,
        updatedAt: now,
      })
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
        eq(fnbKitchenTicketItems.itemStatus, item.itemStatus),
      ))
      .returning();
    if (!updated) {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'recall (concurrent)');
    }

    const events = [];
    const locationId = ticket?.locationId ?? ctx.locationId;

    // Revert ticket status if it was served/ready (an item was pulled back)
    if (ticket && (ticket.status === 'served' || ticket.status === 'ready')) {
      const oldStatus = ticket.status;
      const [reverted] = await tx
        .update(fnbKitchenTickets)
        .set({
          status: 'in_progress',
          servedAt: null,
          readyAt: null,
          version: ticket.version + 1,
          updatedAt: now,
        })
        .where(and(
          eq(fnbKitchenTickets.id, item.ticketId),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
          eq(fnbKitchenTickets.version, ticket.version),
        ))
        .returning();
      if (!reverted) throw new TicketVersionConflictError(item.ticketId);

      // Fix #3: Emit TICKET_STATUS_CHANGED when reverting ticket status
      events.push(buildEventFromContext(ctx, FNB_EVENTS.TICKET_STATUS_CHANGED, {
        ticketId: item.ticketId,
        locationId,
        oldStatus,
        newStatus: 'in_progress',
      }));
    }

    // Item recalled event
    events.push(buildEventFromContext(ctx, FNB_EVENTS.ITEM_RECALLED, {
      ticketItemId: input.ticketItemId,
      ticketId: item.ticketId,
      stationId: input.stationId,
      locationId,
    }));

    // Fix #1: Write recall row to fnb_kds_send_tracking
    const sendToken = `recall-item-${input.ticketItemId}-${Date.now()}`;
    await tx.execute(sql`
      INSERT INTO fnb_kds_send_tracking (
        id, tenant_id, location_id, ticket_id, ticket_number,
        station_id, station_name,
        employee_id, employee_name,
        send_token, send_type, routing_reason,
        status, item_count,
        business_date, queued_at, sent_at, created_at, updated_at
      ) VALUES (
        gen_ulid(), ${ctx.tenantId}, ${locationId},
        ${item.ticketId}, ${ticket?.ticketNumber ?? 0},
        ${input.stationId}, ${station.displayName},
        ${ctx.user.id}, ${ctx.user.email ?? 'System'},
        ${sendToken}, ${'recall'}, ${'recall_item'},
        ${'sent'}, ${1},
        ${ticket?.businessDate ?? new Date().toISOString().slice(0, 10)},
        NOW(), NOW(), NOW(), NOW()
      )
    `);

    // Send tracking event
    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at, actor_type,
        new_status, created_at
      ) VALUES (
        gen_ulid(), ${ctx.tenantId}, ${locationId},
        (SELECT id FROM fnb_kds_send_tracking WHERE tenant_id = ${ctx.tenantId} AND send_token = ${sendToken} LIMIT 1),
        ${sendToken},
        ${item.ticketId}, ${input.stationId},
        ${'recalled'}, NOW(), ${'user'}, ${'sent'}, NOW()
      )
    `);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recallItem', updated);

    return { result: updated!, events };
  });

  logger.info('[kds] item recalled to cooking', {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketItemId: input.ticketItemId, stationId: input.stationId, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.item_recalled', 'fnb_kitchen_ticket_items', input.ticketItemId);
  return result;
}
