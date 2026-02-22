import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerAddresses } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveCustomerAddressInput } from '../validation';

export async function removeCustomerAddress(ctx: RequestContext, input: RemoveCustomerAddressInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [addrRow] = await (tx as any).select().from(customerAddresses)
      .where(and(eq(customerAddresses.id, input.addressId), eq(customerAddresses.tenantId, ctx.tenantId)))
      .limit(1);
    if (!addrRow) throw new NotFoundError('CustomerAddress', input.addressId);

    await (tx as any).delete(customerAddresses).where(eq(customerAddresses.id, input.addressId));

    const event = buildEventFromContext(ctx, 'customer.address.removed.v1', {
      customerId: addrRow.customerId,
      addressId: input.addressId,
    });

    return { result: { id: input.addressId, deleted: true }, events: [event] };
  });

  await auditLog(ctx, 'customer.address_removed', 'customer_address', input.addressId);
  return result;
}
