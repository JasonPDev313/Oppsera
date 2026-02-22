import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerCommunications, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { SendCustomerMessageInput } from '../validation';

export async function sendCustomerMessage(ctx: RequestContext, input: SendCustomerMessageInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Insert communication
    const [created] = await (tx as any).insert(customerCommunications).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      channel: input.channel,
      direction: input.direction ?? 'outbound',
      subject: input.subject ?? null,
      body: input.body,
      status: 'sent',
      metaJson: input.metaJson ?? null,
      sentAt: new Date(),
      createdBy: ctx.user.id,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'communication',
      title: `Message sent: ${input.channel} ${input.direction ?? 'outbound'}`,
      details: input.subject ?? null,
      metadata: {
        communicationId: created!.id,
        channel: input.channel,
        direction: input.direction ?? 'outbound',
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.message.sent.v1', {
      customerId: input.customerId,
      communicationId: created!.id,
      channel: input.channel,
      direction: input.direction ?? 'outbound',
      subject: input.subject ?? null,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.message_sent', 'customer', input.customerId);
  return result;
}
