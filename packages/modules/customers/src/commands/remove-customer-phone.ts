import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerPhones } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveCustomerPhoneInput } from '../validation';

export async function removeCustomerPhone(ctx: RequestContext, input: RemoveCustomerPhoneInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [phoneRow] = await (tx as any).select().from(customerPhones)
      .where(and(eq(customerPhones.id, input.phoneId), eq(customerPhones.tenantId, ctx.tenantId)))
      .limit(1);
    if (!phoneRow) throw new NotFoundError('CustomerPhone', input.phoneId);

    await (tx as any).delete(customerPhones).where(eq(customerPhones.id, input.phoneId));

    const event = buildEventFromContext(ctx, 'customer.phone.removed.v1', {
      customerId: phoneRow.customerId,
      phoneId: input.phoneId,
      phoneE164: phoneRow.phoneE164,
    });

    return { result: { id: input.phoneId, deleted: true }, events: [event] };
  });

  await auditLog(ctx, 'customer.phone_removed', 'customer_phone', input.phoneId);
  return result;
}
