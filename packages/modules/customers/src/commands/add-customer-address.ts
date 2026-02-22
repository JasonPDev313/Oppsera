import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerAddresses } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddCustomerAddressInput } from '../validation';

export async function addCustomerAddress(ctx: RequestContext, input: AddCustomerAddressInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    if (input.isPrimary) {
      await (tx as any).update(customerAddresses).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(customerAddresses.tenantId, ctx.tenantId),
          eq(customerAddresses.customerId, input.customerId),
          eq(customerAddresses.isPrimary, true),
        ));
    }

    const [created] = await (tx as any).insert(customerAddresses).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      type: input.type ?? 'mailing',
      label: input.label ?? null,
      line1: input.line1,
      line2: input.line2 ?? null,
      line3: input.line3 ?? null,
      city: input.city,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      county: input.county ?? null,
      country: input.country ?? 'US',
      isPrimary: input.isPrimary ?? false,
      seasonalStartMonth: input.seasonalStartMonth ?? null,
      seasonalEndMonth: input.seasonalEndMonth ?? null,
    }).returning();

    const event = buildEventFromContext(ctx, 'customer.address.added.v1', {
      customerId: input.customerId,
      addressId: created!.id,
      type: input.type ?? 'mailing',
      isPrimary: input.isPrimary ?? false,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.address_added', 'customer', input.customerId);
  return result;
}
