import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerServiceFlags, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddServiceFlagInput } from '../validation';

export async function addServiceFlag(ctx: RequestContext, input: AddServiceFlagInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Insert service flag
    const [created] = await (tx as any).insert(customerServiceFlags).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      flagType: input.flagType,
      severity: input.severity ?? 'info',
      notes: input.notes ?? null,
      createdBy: ctx.user.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Service flag added: ${input.flagType}`,
      metadata: { flagId: created!.id, flagType: input.flagType, severity: input.severity ?? 'info' },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_service_flag.added.v1', {
      customerId: input.customerId,
      flagId: created!.id,
      flagType: input.flagType,
      severity: input.severity ?? 'info',
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.service_flag_added', 'customer', input.customerId);
  return result;
}
