import { eq, and, inArray, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTicketItems, fnbKitchenTickets, fnbKitchenStations } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { RecallTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError, TicketStatusConflictError, TicketVersionConflictError, StationInactiveError } from '../errors';
import { isLocationAllowedForTicket } from '../helpers/kds-location-guard';

/**
 * Recall all ready/served items on a ticket back to cooking (expo → prep stations).
 * Single transaction: resets each qualifying item to 'cooking' and reverts ticket status.
 */
export async function recallTicket(
  ctx: RequestContext,
  input: RecallTicketInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'recallTicket',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Fetch ticket
    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, input.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!ticket) throw new TicketNotFoundError(input.ticketId);

    // Location guard
    if (ctx.locationId) {
      const allowed = await isLocationAllowedForTicket(tx, ctx.tenantId, ctx.locationId, ticket.locationId);
      if (!allowed) throw new TicketNotFoundError(input.ticketId);
    }

    if (ticket.status === 'voided') {
      throw new TicketStatusConflictError(input.ticketId, 'voided', 'recall');
    }

    // Fix #6: Block recall on 'pending' tickets — nothing has been sent yet
    if (ticket.status === 'pending') {
      throw new TicketStatusConflictError(input.ticketId, 'pending', 'recall');
    }

    // Fetch all items that can be recalled (ready or served)
    const recallableItems = await tx
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.ticketId, input.ticketId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
        inArray(fnbKitchenTicketItems.itemStatus, ['ready', 'served']),
      ));

    if (recallableItems.length === 0) {
      // Nothing to recall — return ticket as-is
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recallTicket', { ticketId: input.ticketId, recalledCount: 0 });
      return { result: { ticketId: input.ticketId, recalledCount: 0 }, events: [] };
    }

    // Fix #2: Filter out items with null stationId — can't route them back
    const routableItems = recallableItems.filter((i) => i.stationId != null);
    const skippedNullStation = recallableItems.length - routableItems.length;
    if (skippedNullStation > 0) {
      logger.warn('[kds] recallTicket: skipped items with null stationId', {
        domain: 'kds', tenantId: ctx.tenantId, ticketId: input.ticketId,
        skippedCount: skippedNullStation,
      });
    }

    if (routableItems.length === 0) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recallTicket', { ticketId: input.ticketId, recalledCount: 0 });
      return { result: { ticketId: input.ticketId, recalledCount: 0 }, events: [] };
    }

    // Fix #5: Guard against inactive/deleted stations
    const distinctStationIds = [...new Set(routableItems.map((i) => i.stationId!))];
    const activeStations = await tx
      .select({ id: fnbKitchenStations.id, isActive: fnbKitchenStations.isActive, displayName: fnbKitchenStations.displayName })
      .from(fnbKitchenStations)
      .where(and(
        eq(fnbKitchenStations.tenantId, ctx.tenantId),
        inArray(fnbKitchenStations.id, distinctStationIds),
      ));

    const activeStationMap = new Map(activeStations.map((s) => [s.id, s]));
    const inactiveStationIds = distinctStationIds.filter((id) => {
      const s = activeStationMap.get(id);
      return !s || !s.isActive;
    });

    if (inactiveStationIds.length > 0) {
      throw new StationInactiveError(inactiveStationIds[0]!);
    }

    // Reset all recallable items to cooking
    const now = new Date();
    const itemIds = routableItems.map((i) => i.id);
    await tx
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
        inArray(fnbKitchenTicketItems.id, itemIds),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ));

    const events = [];
    const locationId = ticket.locationId ?? ctx.locationId;

    // Revert ticket status to in_progress if it was ready/served
    if (ticket.status === 'served' || ticket.status === 'ready') {
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
          eq(fnbKitchenTickets.id, input.ticketId),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
          eq(fnbKitchenTickets.version, ticket.version),
        ))
        .returning();
      if (!reverted) throw new TicketVersionConflictError(input.ticketId);

      // Fix #3: Emit TICKET_STATUS_CHANGED when reverting ticket status
      events.push(buildEventFromContext(ctx, FNB_EVENTS.TICKET_STATUS_CHANGED, {
        ticketId: input.ticketId,
        locationId,
        oldStatus,
        newStatus: 'in_progress',
      }));
    }

    // Emit one ITEM_RECALLED event per recalled item (so station KDS views refresh)
    for (const item of routableItems) {
      events.push(buildEventFromContext(ctx, FNB_EVENTS.ITEM_RECALLED, {
        ticketItemId: item.id,
        ticketId: input.ticketId,
        stationId: item.stationId!, // guaranteed non-null by filter above
        locationId,
      }));
    }

    // Fix #7: Emit aggregate TICKET_RECALLED event
    events.push(buildEventFromContext(ctx, FNB_EVENTS.TICKET_RECALLED, {
      ticketId: input.ticketId,
      locationId,
      recalledCount: routableItems.length,
      stationIds: distinctStationIds,
    }));

    // Fix #1: Write recall rows to fnb_kds_send_tracking (one per station)
    for (const stationId of distinctStationIds) {
      const stationItems = routableItems.filter((i) => i.stationId === stationId);
      const stationName = activeStationMap.get(stationId)?.displayName ?? stationId;
      const sendToken = `recall-ticket-${input.ticketId}-${stationId}-${Date.now()}`;

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
          ${input.ticketId}, ${ticket.ticketNumber},
          ${stationId}, ${stationName},
          ${ctx.user.id}, ${ctx.user.email ?? 'System'},
          ${sendToken}, ${'recall'}, ${'recall_ticket'},
          ${'sent'}, ${stationItems.length},
          ${ticket.businessDate},
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
          ${input.ticketId}, ${stationId},
          ${'recalled'}, NOW(), ${'user'}, ${'sent'}, NOW()
        )
      `);
    }

    const resultPayload = { ticketId: input.ticketId, recalledCount: routableItems.length };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recallTicket', resultPayload);

    return { result: resultPayload, events };
  });

  logger.info('[kds] ticket items recalled to cooking', {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketId: input.ticketId, recalledCount: result.recalledCount, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.ticket_recalled', 'fnb_kitchen_tickets', input.ticketId);
  return result;
}
