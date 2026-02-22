import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerPhones } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddCustomerPhoneInput } from '../validation';

export async function addCustomerPhone(ctx: RequestContext, input: AddCustomerPhoneInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    if (input.isPrimary) {
      await (tx as any).update(customerPhones).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(customerPhones.tenantId, ctx.tenantId),
          eq(customerPhones.customerId, input.customerId),
          eq(customerPhones.isPrimary, true),
        ));
    }

    const [created] = await (tx as any).insert(customerPhones).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      phoneE164: input.phoneE164.trim(),
      phoneDisplay: input.phoneDisplay ?? null,
      type: input.type ?? 'mobile',
      isPrimary: input.isPrimary ?? false,
      canReceiveSms: input.canReceiveSms ?? false,
    }).returning();

    if (input.isPrimary) {
      await (tx as any).update(customers).set({ phone: input.phoneE164.trim(), updatedAt: new Date() })
        .where(eq(customers.id, input.customerId));
    }

    const event = buildEventFromContext(ctx, 'customer.phone.added.v1', {
      customerId: input.customerId,
      phoneId: created!.id,
      phoneE164: input.phoneE164.trim(),
      type: input.type ?? 'mobile',
      isPrimary: input.isPrimary ?? false,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.phone_added', 'customer', input.customerId);
  return result;
}
