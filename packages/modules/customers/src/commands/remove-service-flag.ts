import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerServiceFlags, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveServiceFlagInput } from '../validation';

export async function removeServiceFlag(ctx: RequestContext, input: RemoveServiceFlagInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find the flag
    const [flag] = await (tx as any).select().from(customerServiceFlags)
      .where(and(eq(customerServiceFlags.id, input.flagId), eq(customerServiceFlags.tenantId, ctx.tenantId)))
      .limit(1);
    if (!flag) throw new NotFoundError('Service flag', input.flagId);

    // Delete the flag
    await (tx as any).delete(customerServiceFlags)
      .where(eq(customerServiceFlags.id, input.flagId));

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: flag.customerId,
      activityType: 'system',
      title: `Service flag removed: ${flag.flagType}`,
      metadata: { flagId: flag.id, flagType: flag.flagType, severity: flag.severity },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_service_flag.removed.v1', {
      customerId: flag.customerId,
      flagId: flag.id,
      flagType: flag.flagType,
    });

    return { result: flag, events: [event] };
  });

  await auditLog(ctx, 'customer.service_flag_removed', 'customer', result.customerId);
  return result;
}
