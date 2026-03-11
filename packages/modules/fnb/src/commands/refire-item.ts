import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { RefireItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError, TicketItemStatusConflictError, TicketVersionConflictError } from '../errors';

/**
 * Re-fire (remake) an item: voids the original and creates a new ticket item
 * at the same station marked as rush with a REMAKE: prefix in specialInstructions.
 */
export async function refireItem(
  ctx: RequestContext,
  input: RefireItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'refireItem',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as Record<string, unknown>, events: [] };
    }

    // Fetch original item
    const [item] = await tx
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!item) throw new TicketItemNotFoundError(input.ticketItemId);

    // Defense-in-depth: verify item's ticket belongs to caller's location
    if (ctx.locationId) {
      const [parentTicket] = await tx
        .select({ locationId: fnbKitchenTickets.locationId })
        .from(fnbKitchenTickets)
        .where(and(
          eq(fnbKitchenTickets.id, item.ticketId),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
        ))
        .limit(1);
      if (parentTicket && parentTicket.locationId !== ctx.locationId) {
        throw new TicketItemNotFoundError(input.ticketItemId);
      }
    }

    // Only ready/served/cooking items can be re-fired (pending hasn't started, voided is terminal)
    if (item.itemStatus === 'pending' || item.itemStatus === 'voided') {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'refire');
    }

    const now = new Date();

    // Void the original item — verify update succeeded to catch concurrent voids
    const [voided] = await tx
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'voided',
        voidedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .returning();
    if (!voided) throw new TicketItemNotFoundError(input.ticketItemId);

    // Create new item as a remake at the same station
    const newItemId = generateUlid();
    const [newItem] = await tx
      .insert(fnbKitchenTicketItems)
      .values({
        id: newItemId,
        tenantId: ctx.tenantId,
        ticketId: item.ticketId,
        orderLineId: item.orderLineId,
        stationId: item.stationId,
        itemName: item.itemName,
        kitchenLabel: item.kitchenLabel,
        modifierSummary: item.modifierSummary,
        specialInstructions: input.reason
          ? `REMAKE: ${input.reason}${item.specialInstructions ? ` | ${item.specialInstructions}` : ''}`
          : `REMAKE${item.specialInstructions ? ` | ${item.specialInstructions}` : ''}`,
        quantity: item.quantity,
        seatNumber: item.seatNumber,
        courseName: item.courseName,
        itemStatus: 'pending',
        isRush: true, // Remakes are always rush
        isAllergy: item.isAllergy,
        isVip: item.isVip,
        priorityLevel: Math.max(Number(item.priorityLevel ?? 0), 1), // Boost priority
        estimatedPrepSeconds: item.estimatedPrepSeconds,
        routingRuleId: item.routingRuleId,
        itemColor: item.itemColor,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Revert ticket to in_progress if it was ready/served (new item needs prep)
    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, item.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);

    if (ticket && (ticket.status === 'ready' || ticket.status === 'served')) {
      const [reverted] = await tx
        .update(fnbKitchenTickets)
        .set({
          status: 'in_progress',
          readyAt: null,
          servedAt: null,
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
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.ITEM_REFIRED, {
      originalItemId: input.ticketItemId,
      newItemId,
      ticketId: item.ticketId,
      stationId: item.stationId,
      locationId: ticket?.locationId ?? ctx.locationId,
      reason: input.reason ?? null,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'refireItem', newItem);

    return { result: newItem!, events: [event] };
  });

  logger.info('[kds] item re-fired (remake)', {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketItemId: input.ticketItemId, stationId: input.stationId, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.item_refired', 'fnb_kitchen_ticket_items', input.ticketItemId);
  return result;
}
