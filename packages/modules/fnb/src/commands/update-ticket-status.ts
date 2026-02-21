import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateTicketStatusInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError, TicketStatusConflictError, TicketVersionConflictError } from '../errors';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'voided'],
  in_progress: ['ready', 'voided'],
  ready: ['served', 'in_progress'],
  served: [],
  voided: [],
};

export async function updateTicketStatus(
  ctx: RequestContext,
  ticketId: string,
  input: UpdateTicketStatusInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'updateTicketStatus',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [ticket] = await (tx as any)
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!ticket) throw new TicketNotFoundError(ticketId);

    const allowed = VALID_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new TicketStatusConflictError(ticketId, ticket.status, `transition to ${input.status}`);
    }

    if (input.expectedVersion !== undefined && ticket.version !== input.expectedVersion) {
      throw new TicketVersionConflictError(ticketId);
    }

    const setFields: Record<string, unknown> = {
      status: input.status,
      version: ticket.version + 1,
      updatedAt: new Date(),
    };

    if (input.status === 'in_progress') setFields.startedAt = new Date();
    if (input.status === 'ready') setFields.readyAt = new Date();
    if (input.status === 'served') setFields.servedAt = new Date();
    if (input.status === 'voided') setFields.voidedAt = new Date();

    const [updated] = await (tx as any)
      .update(fnbKitchenTickets)
      .set(setFields)
      .where(eq(fnbKitchenTickets.id, ticketId))
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_STATUS_CHANGED, {
      ticketId,
      locationId: ticket.locationId,
      oldStatus: ticket.status,
      newStatus: input.status,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateTicketStatus', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.ticket.status_changed', 'fnb_kitchen_tickets', ticketId);
  return result;
}
