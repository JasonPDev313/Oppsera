import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerPhones } from '@oppsera/db';
import { eq, and, ne } from 'drizzle-orm';
import type { UpdateCustomerPhoneInput } from '../validation';

export async function updateCustomerPhone(ctx: RequestContext, input: UpdateCustomerPhoneInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [phoneRow] = await (tx as any).select().from(customerPhones)
      .where(and(eq(customerPhones.id, input.phoneId), eq(customerPhones.tenantId, ctx.tenantId)))
      .limit(1);
    if (!phoneRow) throw new NotFoundError('CustomerPhone', input.phoneId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.phoneE164 !== undefined) updates.phoneE164 = input.phoneE164.trim();
    if (input.phoneDisplay !== undefined) updates.phoneDisplay = input.phoneDisplay;
    if (input.type !== undefined) updates.type = input.type;
    if (input.canReceiveSms !== undefined) updates.canReceiveSms = input.canReceiveSms;

    if (input.isPrimary === true) {
      await (tx as any).update(customerPhones).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(customerPhones.tenantId, ctx.tenantId),
          eq(customerPhones.customerId, phoneRow.customerId),
          eq(customerPhones.isPrimary, true),
          ne(customerPhones.id, input.phoneId),
        ));
      updates.isPrimary = true;
      const newPhone = (input.phoneE164?.trim() ?? phoneRow.phoneE164);
      await (tx as any).update(customers).set({ phone: newPhone, updatedAt: new Date() })
        .where(eq(customers.id, phoneRow.customerId));
    } else if (input.isPrimary === false) {
      updates.isPrimary = false;
    }

    const [updated] = await (tx as any).update(customerPhones).set(updates)
      .where(eq(customerPhones.id, input.phoneId)).returning();

    const event = buildEventFromContext(ctx, 'customer.phone.updated.v1', {
      customerId: phoneRow.customerId,
      phoneId: input.phoneId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.phone_updated', 'customer_phone', input.phoneId);
  return result;
}
