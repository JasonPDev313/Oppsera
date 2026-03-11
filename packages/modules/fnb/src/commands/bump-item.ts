import { eq, and, ne, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTicketItems, fnbKitchenTickets, fnbKitchenStations } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BumpItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import {
  StationNotFoundError,
  TicketNotFoundError,
  TicketStatusConflictError,
  TicketItemNotFoundError,
  TicketItemStatusConflictError,
} from '../errors';

export async function bumpItem(
  ctx: RequestContext,
  input: BumpItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bumpItem',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // ── Validate station exists ──────────────────────────────────
    const [station] = await tx
      .select({
        id: fnbKitchenStations.id,
        autoBumpOnAllReady: fnbKitchenStations.autoBumpOnAllReady,
      })
      .from(fnbKitchenStations)
      .where(and(
        eq(fnbKitchenStations.id, input.stationId),
        eq(fnbKitchenStations.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!station) throw new StationNotFoundError(input.stationId);

    // ── Load item ────────────────────────────────────────────────
    const [item] = await tx
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!item) throw new TicketItemNotFoundError(input.ticketItemId);

    // ── Load parent ticket (required — prevents orphan item bumps) ──
    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, item.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!ticket) throw new TicketNotFoundError(item.ticketId);

    // ── Location scoping ─────────────────────────────────────────
    if (ctx.locationId && ticket.locationId !== ctx.locationId) {
      throw new TicketItemNotFoundError(input.ticketItemId);
    }

    // ── Guard: ticket must be bumpable ───────────────────────────
    if (ticket.status === 'voided' || ticket.status === 'served') {
      throw new TicketStatusConflictError(ticket.id, ticket.status, 'bump item');
    }

    // ── Guard: item must not be terminal ─────────────────────────
    if (item.itemStatus === 'ready' || item.itemStatus === 'served' || item.itemStatus === 'voided') {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'bump');
    }

    const now = new Date();
    const events: ReturnType<typeof buildEventFromContext>[] = [];

    // ── Auto-progress ticket pending → in_progress on first item bump ──
    let ticketVersion = ticket.version;
    if (ticket.status === 'pending') {
      const [progressed] = await tx
        .update(fnbKitchenTickets)
        .set({
          status: 'in_progress',
          startedAt: now,
          version: ticketVersion + 1,
          updatedAt: now,
        })
        .where(and(
          eq(fnbKitchenTickets.id, ticket.id),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
          eq(fnbKitchenTickets.version, ticketVersion),
        ))
        .returning();
      if (progressed) {
        ticketVersion = progressed.version;
        events.push(buildEventFromContext(ctx, FNB_EVENTS.TICKET_STATUS_CHANGED, {
          ticketId: ticket.id,
          locationId: ticket.locationId,
          oldStatus: 'pending',
          newStatus: 'in_progress',
        }));
      }
    }

    // ── Bump item → ready ────────────────────────────────────────
    const updateData: Record<string, unknown> = {
      itemStatus: 'ready',
      readyAt: now,
      bumpedBy: ctx.user.id,
      updatedAt: now,
    };
    if (!item.startedAt) {
      updateData.startedAt = now;
    }

    // Optimistic lock: include current status in WHERE to prevent concurrent double-bump
    const [updated] = await tx
      .update(fnbKitchenTicketItems)
      .set(updateData)
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
        eq(fnbKitchenTicketItems.itemStatus, item.itemStatus),
      ))
      .returning();
    if (!updated) {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'bump (concurrent)');
    }

    events.push(buildEventFromContext(ctx, FNB_EVENTS.ITEM_BUMPED, {
      ticketItemId: input.ticketItemId,
      ticketId: item.ticketId,
      stationId: input.stationId,
      locationId: ticket.locationId,
    }));

    // ── Mode B: Auto-bump ticket when all items are ready ────────
    // Only fires when: station has autoBumpOnAllReady, ticket is non-terminal,
    // ticket is not held, and all non-voided items are ready/served.
    // Mode A (autoBumpOnAllReady=false) is unaffected — ticket stays as-is.
    const canAutoBump =
      station.autoBumpOnAllReady === true &&
      ticketVersion === (ticket.status === 'pending' ? ticket.version + 1 : ticket.version) && // version tracking
      ticket.status !== 'ready' && // already handled by bump-ticket
      ticket.status !== 'served' && // terminal
      !ticket.isHeld; // held tickets must be manually bumped

    if (canAutoBump) {
      const siblingItems = await tx
        .select({ itemStatus: fnbKitchenTicketItems.itemStatus })
        .from(fnbKitchenTicketItems)
        .where(and(
          eq(fnbKitchenTicketItems.ticketId, item.ticketId),
          eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
          ne(fnbKitchenTicketItems.itemStatus, 'voided'),
        ));

      const allReady = siblingItems.length > 0 &&
        siblingItems.every((i) => i.itemStatus === 'ready' || i.itemStatus === 'served');

      if (allReady) {
        // Check if any active expo station exists at this location
        const expoRows = await tx.execute(
          sql`SELECT 1 FROM fnb_kitchen_stations
              WHERE tenant_id = ${ctx.tenantId}
                AND location_id = ${ticket.locationId}
                AND station_type = 'expo'
                AND is_active = true
              LIMIT 1`,
        );
        const hasExpo = Array.from(expoRows as Iterable<Record<string, unknown>>).length > 0;

        // Shared fields for ticket auto-bump
        const ticketSetBase = {
          readyAt: ticket.readyAt ?? now,
          startedAt: ticket.startedAt ?? now,
          bumpedAt: now,
          bumpedBy: ctx.user.id,
          version: ticketVersion + 1,
          updatedAt: now,
        };

        if (hasExpo) {
          // Expo exists → auto-transition to 'ready' so expo can review/serve
          const [readied] = await tx
            .update(fnbKitchenTickets)
            .set({ ...ticketSetBase, status: 'ready' })
            .where(and(
              eq(fnbKitchenTickets.id, item.ticketId),
              eq(fnbKitchenTickets.tenantId, ctx.tenantId),
              eq(fnbKitchenTickets.version, ticketVersion),
            ))
            .returning();
          if (readied) {
            events.push(buildEventFromContext(ctx, FNB_EVENTS.TICKET_BUMPED, {
              ticketId: item.ticketId,
              locationId: ticket.locationId,
              tabId: ticket.tabId,
              stationId: input.stationId,
              bumpedToStatus: 'ready',
              autoBumped: true,
            }));
            logger.info('[kds] ticket auto-bumped to ready (Mode B, expo exists)', {
              domain: 'kds', tenantId: ctx.tenantId, ticketId: item.ticketId,
              stationId: input.stationId,
            });
          }
        } else {
          // No expo → auto-transition to 'served' (full Mode B bypass)
          const [served] = await tx
            .update(fnbKitchenTickets)
            .set({ ...ticketSetBase, status: 'served', servedAt: now })
            .where(and(
              eq(fnbKitchenTickets.id, item.ticketId),
              eq(fnbKitchenTickets.tenantId, ctx.tenantId),
              eq(fnbKitchenTickets.version, ticketVersion),
            ))
            .returning();
          if (served) {
            // Mark all ready items as served
            await tx
              .update(fnbKitchenTicketItems)
              .set({ itemStatus: 'served', servedAt: now, bumpedBy: ctx.user.id, updatedAt: now })
              .where(and(
                eq(fnbKitchenTicketItems.ticketId, item.ticketId),
                eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
                eq(fnbKitchenTicketItems.itemStatus, 'ready'),
              ));

            events.push(buildEventFromContext(ctx, FNB_EVENTS.TICKET_BUMPED, {
              ticketId: item.ticketId,
              locationId: ticket.locationId,
              tabId: ticket.tabId,
              stationId: input.stationId,
              bumpedToStatus: 'served',
              autoBumped: true,
            }));
            logger.info('[kds] ticket auto-bumped to served (Mode B, no expo)', {
              domain: 'kds', tenantId: ctx.tenantId, ticketId: item.ticketId,
              stationId: input.stationId,
            });
          }
        }
      }
    }

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bumpItem', updated);

    return { result: updated!, events };
  });

  logger.info('[kds] item bumped to ready', {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketItemId: input.ticketItemId, stationId: input.stationId, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.item_bumped', 'fnb_kitchen_ticket_items', input.ticketItemId);
  return result;
}
