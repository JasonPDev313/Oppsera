/**
 * Log a manual communication (phone call, internal note, etc.) for a guest.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsMessageLog, pmsGuests } from '@oppsera/db';
import type { LogCommunicationInput } from '../validation';
import { PMS_EVENTS } from '../events/types';

export async function logCommunication(ctx: RequestContext, input: LogCommunicationInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify guest exists
    const [guest] = await tx
      .select({ id: pmsGuests.id })
      .from(pmsGuests)
      .where(and(eq(pmsGuests.id, input.guestId), eq(pmsGuests.tenantId, ctx.tenantId)))
      .limit(1);
    if (!guest) throw new NotFoundError('Guest', input.guestId);

    const id = generateUlid();
    await tx.insert(pmsMessageLog).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      reservationId: input.reservationId ?? null,
      guestId: input.guestId,
      channel: input.channel,
      direction: input.direction,
      messageType: input.messageType,
      subject: input.subject ?? null,
      body: input.body,
      recipient: input.recipient ?? null,
      status: 'sent',
      sentAt: new Date(),
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.COMMUNICATION_LOGGED, {
      messageLogId: id,
      guestId: input.guestId,
      reservationId: input.reservationId ?? null,
      channel: input.channel,
      direction: input.direction,
      messageType: input.messageType,
    });

    return { result: { id }, events: [event] };
  });

  await auditLog(ctx, 'pms.communication.logged', 'pms_message_log', result.id);
  return result;
}
