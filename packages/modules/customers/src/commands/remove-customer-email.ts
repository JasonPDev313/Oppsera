import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerEmails, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveCustomerEmailInput } from '../validation';

export async function removeCustomerEmail(ctx: RequestContext, input: RemoveCustomerEmailInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify email record exists
    const [emailRow] = await (tx as any).select().from(customerEmails)
      .where(and(eq(customerEmails.id, input.emailId), eq(customerEmails.tenantId, ctx.tenantId)))
      .limit(1);
    if (!emailRow) throw new NotFoundError('CustomerEmail', input.emailId);

    await (tx as any).delete(customerEmails).where(eq(customerEmails.id, input.emailId));

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: emailRow.customerId,
      activityType: 'system',
      title: `Email removed: ${emailRow.email}`,
      metadata: { emailId: input.emailId, email: emailRow.email, type: emailRow.type },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.email.removed.v1', {
      customerId: emailRow.customerId,
      emailId: input.emailId,
      email: emailRow.email,
    });

    return { result: { id: input.emailId, deleted: true }, events: [event] };
  });

  await auditLog(ctx, 'customer.email_removed', 'customer_email', input.emailId);
  return result;
}
