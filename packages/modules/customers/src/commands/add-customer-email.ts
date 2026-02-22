import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers, customerEmails, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddCustomerEmailInput } from '../validation';

export async function addCustomerEmail(ctx: RequestContext, input: AddCustomerEmailInput) {
  const emailNormalized = input.email.toLowerCase().trim();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Check email uniqueness within tenant
    const [existing] = await (tx as any).select({ id: customerEmails.id }).from(customerEmails)
      .where(and(
        eq(customerEmails.tenantId, ctx.tenantId),
        eq(customerEmails.emailNormalized, emailNormalized),
      ))
      .limit(1);
    if (existing) throw new ConflictError('Email already exists for another customer');

    // If isPrimary, unset existing primary emails for this customer
    if (input.isPrimary) {
      await (tx as any).update(customerEmails).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(customerEmails.tenantId, ctx.tenantId),
          eq(customerEmails.customerId, input.customerId),
          eq(customerEmails.isPrimary, true),
        ));
    }

    const [created] = await (tx as any).insert(customerEmails).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      email: input.email.trim(),
      emailNormalized,
      type: input.type ?? 'personal',
      isPrimary: input.isPrimary ?? false,
      canReceiveStatements: input.canReceiveStatements ?? true,
      canReceiveMarketing: input.canReceiveMarketing ?? false,
    }).returning();

    // If isPrimary, update the customer's primary email field
    if (input.isPrimary) {
      await (tx as any).update(customers).set({ email: input.email.trim(), updatedAt: new Date() })
        .where(eq(customers.id, input.customerId));
    }

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Email added: ${input.email.trim()}`,
      metadata: { emailId: created!.id, type: input.type ?? 'personal', email: input.email.trim(), isPrimary: input.isPrimary ?? false },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.email.added.v1', {
      customerId: input.customerId,
      emailId: created!.id,
      email: input.email.trim(),
      type: input.type ?? 'personal',
      isPrimary: input.isPrimary ?? false,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.email_added', 'customer', input.customerId);
  return result;
}
