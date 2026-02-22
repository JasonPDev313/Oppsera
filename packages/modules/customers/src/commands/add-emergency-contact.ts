import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerEmergencyContacts } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddEmergencyContactInput } from '../validation';

export async function addEmergencyContact(ctx: RequestContext, input: AddEmergencyContactInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    if (input.isPrimary) {
      await (tx as any).update(customerEmergencyContacts).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(customerEmergencyContacts.tenantId, ctx.tenantId),
          eq(customerEmergencyContacts.customerId, input.customerId),
          eq(customerEmergencyContacts.isPrimary, true),
        ));
    }

    const [created] = await (tx as any).insert(customerEmergencyContacts).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      name: input.name,
      relationship: input.relationship ?? null,
      phoneE164: input.phoneE164,
      phoneDisplay: input.phoneDisplay ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      isPrimary: input.isPrimary ?? false,
    }).returning();

    const event = buildEventFromContext(ctx, 'customer.emergency_contact.added.v1', {
      customerId: input.customerId,
      contactId: created!.id,
      name: input.name,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.emergency_contact_added', 'customer', input.customerId);
  return result;
}
