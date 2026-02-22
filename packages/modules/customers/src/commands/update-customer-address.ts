import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerAddresses } from '@oppsera/db';
import { eq, and, ne } from 'drizzle-orm';
import type { UpdateCustomerAddressInput } from '../validation';

export async function updateCustomerAddress(ctx: RequestContext, input: UpdateCustomerAddressInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [addrRow] = await (tx as any).select().from(customerAddresses)
      .where(and(eq(customerAddresses.id, input.addressId), eq(customerAddresses.tenantId, ctx.tenantId)))
      .limit(1);
    if (!addrRow) throw new NotFoundError('CustomerAddress', input.addressId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.type !== undefined) updates.type = input.type;
    if (input.label !== undefined) updates.label = input.label;
    if (input.line1 !== undefined) updates.line1 = input.line1;
    if (input.line2 !== undefined) updates.line2 = input.line2;
    if (input.line3 !== undefined) updates.line3 = input.line3;
    if (input.city !== undefined) updates.city = input.city;
    if (input.state !== undefined) updates.state = input.state;
    if (input.postalCode !== undefined) updates.postalCode = input.postalCode;
    if (input.county !== undefined) updates.county = input.county;
    if (input.country !== undefined) updates.country = input.country;
    if (input.seasonalStartMonth !== undefined) updates.seasonalStartMonth = input.seasonalStartMonth;
    if (input.seasonalEndMonth !== undefined) updates.seasonalEndMonth = input.seasonalEndMonth;

    if (input.isPrimary === true) {
      await (tx as any).update(customerAddresses).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(customerAddresses.tenantId, ctx.tenantId),
          eq(customerAddresses.customerId, addrRow.customerId),
          eq(customerAddresses.isPrimary, true),
          ne(customerAddresses.id, input.addressId),
        ));
      updates.isPrimary = true;
    } else if (input.isPrimary === false) {
      updates.isPrimary = false;
    }

    const [updated] = await (tx as any).update(customerAddresses).set(updates)
      .where(eq(customerAddresses.id, input.addressId)).returning();

    const event = buildEventFromContext(ctx, 'customer.address.updated.v1', {
      customerId: addrRow.customerId,
      addressId: input.addressId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.address_updated', 'customer_address', input.addressId);
  return result;
}
