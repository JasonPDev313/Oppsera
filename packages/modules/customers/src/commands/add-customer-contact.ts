import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers, customerContacts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddCustomerContactInput } from '../validation';

export async function addCustomerContact(ctx: RequestContext, input: AddCustomerContactInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // If isPrimary=true, unset existing primary for same contactType
    if (input.isPrimary) {
      await (tx as any).update(customerContacts).set({ isPrimary: false })
        .where(and(
          eq(customerContacts.tenantId, ctx.tenantId),
          eq(customerContacts.customerId, input.customerId),
          eq(customerContacts.contactType, input.contactType),
          eq(customerContacts.isPrimary, true),
        ));
    }

    // Check uniqueness for email and phone contact types
    if (input.contactType === 'email' || input.contactType === 'phone') {
      const [existing] = await (tx as any).select({ id: customerContacts.id }).from(customerContacts)
        .where(and(
          eq(customerContacts.tenantId, ctx.tenantId),
          eq(customerContacts.contactType, input.contactType),
          eq(customerContacts.value, input.value),
        ))
        .limit(1);
      if (existing) throw new ConflictError(`Contact with this ${input.contactType} already exists`);
    }

    // Insert contact
    const [created] = await (tx as any).insert(customerContacts).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      contactType: input.contactType,
      label: input.label ?? null,
      value: input.value,
      isPrimary: input.isPrimary ?? false,
    }).returning();

    // If isPrimary and contactType is email or phone, update the customer record
    if (input.isPrimary && input.contactType === 'email') {
      await (tx as any).update(customers).set({ email: input.value, updatedAt: new Date() })
        .where(eq(customers.id, input.customerId));
    } else if (input.isPrimary && input.contactType === 'phone') {
      await (tx as any).update(customers).set({ phone: input.value, updatedAt: new Date() })
        .where(eq(customers.id, input.customerId));
    }

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Contact added: ${input.contactType}`,
      metadata: { contactId: created!.id, contactType: input.contactType, value: input.value, isPrimary: input.isPrimary },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_contact.added.v1', {
      customerId: input.customerId,
      contactId: created!.id,
      contactType: input.contactType,
      value: input.value,
      isPrimary: input.isPrimary ?? false,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.contact_added', 'customer', input.customerId);
  return result;
}
