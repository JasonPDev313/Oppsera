import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerEmergencyContacts } from '@oppsera/db';
import { eq, and, ne } from 'drizzle-orm';
import type { UpdateEmergencyContactInput } from '../validation';

export async function updateEmergencyContact(ctx: RequestContext, input: UpdateEmergencyContactInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [row] = await (tx as any).select().from(customerEmergencyContacts)
      .where(and(eq(customerEmergencyContacts.id, input.contactId), eq(customerEmergencyContacts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('EmergencyContact', input.contactId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updates.name = input.name;
    if (input.relationship !== undefined) updates.relationship = input.relationship;
    if (input.phoneE164 !== undefined) updates.phoneE164 = input.phoneE164;
    if (input.phoneDisplay !== undefined) updates.phoneDisplay = input.phoneDisplay;
    if (input.email !== undefined) updates.email = input.email;
    if (input.notes !== undefined) updates.notes = input.notes;

    if (input.isPrimary === true) {
      await (tx as any).update(customerEmergencyContacts).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(customerEmergencyContacts.tenantId, ctx.tenantId),
          eq(customerEmergencyContacts.customerId, row.customerId),
          eq(customerEmergencyContacts.isPrimary, true),
          ne(customerEmergencyContacts.id, input.contactId),
        ));
      updates.isPrimary = true;
    } else if (input.isPrimary === false) {
      updates.isPrimary = false;
    }

    const [updated] = await (tx as any).update(customerEmergencyContacts).set(updates)
      .where(eq(customerEmergencyContacts.id, input.contactId)).returning();

    const event = buildEventFromContext(ctx, 'customer.emergency_contact.updated.v1', {
      customerId: row.customerId,
      contactId: input.contactId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.emergency_contact_updated', 'customer_emergency_contact', input.contactId);
  return result;
}
