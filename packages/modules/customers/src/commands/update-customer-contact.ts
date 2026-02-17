import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerContacts } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { UpdateCustomerContactInput } from '../validation';

export async function updateCustomerContact(ctx: RequestContext, input: UpdateCustomerContactInput) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Find existing contact
    const [existing] = await (tx as any).select().from(customerContacts)
      .where(and(eq(customerContacts.id, input.contactId), eq(customerContacts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Customer contact', input.contactId);

    // If isPrimary being set to true, unset existing primary for same contactType on same customer
    if (input.isPrimary === true) {
      await (tx as any).update(customerContacts).set({ isPrimary: false })
        .where(and(
          eq(customerContacts.tenantId, ctx.tenantId),
          eq(customerContacts.customerId, existing.customerId),
          eq(customerContacts.contactType, existing.contactType),
          eq(customerContacts.isPrimary, true),
        ));
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (input.label !== undefined) updates.label = input.label;
    if (input.value !== undefined) updates.value = input.value;
    if (input.isPrimary !== undefined) updates.isPrimary = input.isPrimary;
    if (input.isVerified !== undefined) updates.isVerified = input.isVerified;

    const [updated] = await (tx as any).update(customerContacts).set(updates)
      .where(eq(customerContacts.id, input.contactId)).returning();

    // If isPrimary changed to true and contactType is email or phone, update the customer record
    if (input.isPrimary === true && existing.contactType === 'email') {
      const emailValue = input.value ?? existing.value;
      await (tx as any).update(customers).set({ email: emailValue, updatedAt: new Date() })
        .where(eq(customers.id, existing.customerId));
    } else if (input.isPrimary === true && existing.contactType === 'phone') {
      const phoneValue = input.value ?? existing.value;
      await (tx as any).update(customers).set({ phone: phoneValue, updatedAt: new Date() })
        .where(eq(customers.id, existing.customerId));
    }

    return updated!;
  });

  await auditLog(ctx, 'customer.contact_updated', 'customer_contact', input.contactId);
  return result;
}
