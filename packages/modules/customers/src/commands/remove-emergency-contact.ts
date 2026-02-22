import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerEmergencyContacts } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveEmergencyContactInput } from '../validation';

export async function removeEmergencyContact(ctx: RequestContext, input: RemoveEmergencyContactInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [row] = await (tx as any).select().from(customerEmergencyContacts)
      .where(and(eq(customerEmergencyContacts.id, input.contactId), eq(customerEmergencyContacts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('EmergencyContact', input.contactId);

    await (tx as any).delete(customerEmergencyContacts).where(eq(customerEmergencyContacts.id, input.contactId));

    const event = buildEventFromContext(ctx, 'customer.emergency_contact.removed.v1', {
      customerId: row.customerId,
      contactId: input.contactId,
    });

    return { result: { id: input.contactId, deleted: true }, events: [event] };
  });

  await auditLog(ctx, 'customer.emergency_contact_removed', 'customer_emergency_contact', input.contactId);
  return result;
}
