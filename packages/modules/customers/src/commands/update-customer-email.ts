import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers, customerEmails, customerActivityLog } from '@oppsera/db';
import { eq, and, ne } from 'drizzle-orm';
import type { UpdateCustomerEmailInput } from '../validation';

export async function updateCustomerEmail(ctx: RequestContext, input: UpdateCustomerEmailInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify email record exists
    const [emailRow] = await (tx as any).select().from(customerEmails)
      .where(and(eq(customerEmails.id, input.emailId), eq(customerEmails.tenantId, ctx.tenantId)))
      .limit(1);
    if (!emailRow) throw new NotFoundError('CustomerEmail', input.emailId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.email !== undefined) {
      const emailNormalized = input.email.toLowerCase().trim();
      // Check uniqueness against other emails in the tenant
      const [dup] = await (tx as any).select({ id: customerEmails.id }).from(customerEmails)
        .where(and(
          eq(customerEmails.tenantId, ctx.tenantId),
          eq(customerEmails.emailNormalized, emailNormalized),
          ne(customerEmails.id, input.emailId),
        ))
        .limit(1);
      if (dup) throw new ConflictError('Email already exists for another customer');
      updates.email = input.email.trim();
      updates.emailNormalized = emailNormalized;
    }
    if (input.type !== undefined) updates.type = input.type;
    if (input.canReceiveStatements !== undefined) updates.canReceiveStatements = input.canReceiveStatements;
    if (input.canReceiveMarketing !== undefined) updates.canReceiveMarketing = input.canReceiveMarketing;

    if (input.isPrimary === true) {
      // Unset existing primary emails for this customer
      await (tx as any).update(customerEmails).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(customerEmails.tenantId, ctx.tenantId),
          eq(customerEmails.customerId, emailRow.customerId),
          eq(customerEmails.isPrimary, true),
          ne(customerEmails.id, input.emailId),
        ));
      updates.isPrimary = true;
      // Update customer primary email field
      const newEmail = input.email?.trim() ?? emailRow.email;
      await (tx as any).update(customers).set({ email: newEmail, updatedAt: new Date() })
        .where(eq(customers.id, emailRow.customerId));
    } else if (input.isPrimary === false) {
      updates.isPrimary = false;
    }

    const [updated] = await (tx as any).update(customerEmails).set(updates)
      .where(eq(customerEmails.id, input.emailId)).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: emailRow.customerId,
      activityType: 'system',
      title: `Email updated: ${updated!.email}`,
      metadata: { emailId: input.emailId },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.email.updated.v1', {
      customerId: emailRow.customerId,
      emailId: input.emailId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.email_updated', 'customer_email', input.emailId);
  return result;
}
