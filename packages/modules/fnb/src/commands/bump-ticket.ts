import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTickets, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BumpTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError, TicketNotReadyError, TicketStatusConflictError, TicketVersionConflictError } from '../errors';

/**
 * Determine whether this bump is from a prep station or from expo.
 * - stationId provided → look up station_type in DB
 * - No stationId → treat as expo bump (served)
 */
async function resolveIsExpoBump(
  tx: Parameters<Parameters<typeof publishWithOutbox>[1]>[0],
  tenantId: string,
  stationId: string | undefined,
): Promise<boolean> {
  if (!stationId) return true; // no station → expo route
  const rows = await tx.execute(
    sql`SELECT station_type FROM fnb_kitchen_stations
        WHERE id = ${stationId} AND tenant_id = ${tenantId} LIMIT 1`,
  );
  const station = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  // If station not found or is expo type → treat as expo bump
  return !station || (station.station_type as string) === 'expo';
}

export async function bumpTicket(
  ctx: RequestContext,
  input: BumpTicketInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bumpTicket',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, input.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!ticket) throw new TicketNotFoundError(input.ticketId);

    const isExpoBump = await resolveIsExpoBump(tx, ctx.tenantId, input.stationId);

    // Guard: cannot bump an already-served or voided ticket
    if (ticket.status === 'served' || ticket.status === 'voided') {
      throw new TicketStatusConflictError(input.ticketId, ticket.status, 'bump');
    }
    // Guard: prep station cannot bump a ticket already in 'ready' (already bumped from station)
    if (!isExpoBump && ticket.status === 'ready') {
      throw new TicketStatusConflictError(input.ticketId, ticket.status, 'bump (already sent to expo)');
    }

    // Verify all non-voided items are ready, and at least one non-voided item exists
    const allItems = await tx
      .select({ itemStatus: fnbKitchenTicketItems.itemStatus })
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.ticketId, input.ticketId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ));

    const nonVoided = allItems.filter((i) => i.itemStatus !== 'voided');
    if (nonVoided.length === 0) {
      throw new TicketNotReadyError(input.ticketId);
    }
    const notReady = nonVoided.filter((i) => i.itemStatus !== 'ready' && i.itemStatus !== 'served');
    if (notReady.length > 0) {
      throw new TicketNotReadyError(input.ticketId);
    }

    const now = new Date();

    if (isExpoBump) {
      // ── Expo bump: finalize ticket → 'served' ──
      const [updated] = await tx
        .update(fnbKitchenTickets)
        .set({
          status: 'served',
          servedAt: now,
          bumpedAt: now,
          bumpedBy: ctx.user.id,
          version: ticket.version + 1,
          updatedAt: now,
        })
        .where(and(
          eq(fnbKitchenTickets.id, input.ticketId),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
          eq(fnbKitchenTickets.version, ticket.version),
        ))
        .returning();
      if (!updated) throw new TicketVersionConflictError(input.ticketId);

      // Mark all ready items as served
      await tx
        .update(fnbKitchenTicketItems)
        .set({
          itemStatus: 'served',
          servedAt: now,
          bumpedBy: ctx.user.id,
          updatedAt: now,
        })
        .where(and(
          eq(fnbKitchenTicketItems.ticketId, input.ticketId),
          eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
          eq(fnbKitchenTicketItems.itemStatus, 'ready'),
        ));

      const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_BUMPED, {
        ticketId: input.ticketId,
        locationId: ticket.locationId,
        tabId: ticket.tabId,
      });

      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bumpTicket', updated);
      return { result: updated!, events: [event] };
    } else {
      // ── Prep station bump: move ticket → 'ready' (visible in expo) ──
      const [updated] = await tx
        .update(fnbKitchenTickets)
        .set({
          status: 'ready',
          readyAt: now,
          bumpedAt: now,
          bumpedBy: ctx.user.id,
          version: ticket.version + 1,
          updatedAt: now,
        })
        .where(and(
          eq(fnbKitchenTickets.id, input.ticketId),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
          eq(fnbKitchenTickets.version, ticket.version),
        ))
        .returning();
      if (!updated) throw new TicketVersionConflictError(input.ticketId);

      const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_BUMPED, {
        ticketId: input.ticketId,
        locationId: ticket.locationId,
        tabId: ticket.tabId,
        stationId: input.stationId,
        bumpedToStatus: 'ready',
      });

      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bumpTicket', updated);
      return { result: updated!, events: [event] };
    }
  });

  const targetStatus = result.status;
  logger.info(`[kds] ticket bumped to ${targetStatus}`, {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketId: input.ticketId, stationId: input.stationId ?? 'expo', userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.ticket_bumped', 'fnb_kitchen_tickets', input.ticketId);
  return result;
}
