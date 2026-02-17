import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers, customerExternalIds, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddExternalIdInput } from '../validation';

export async function addExternalId(ctx: RequestContext, input: AddExternalIdInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Check uniqueness on (tenantId, provider, externalId)
    const [existing] = await (tx as any).select({ id: customerExternalIds.id }).from(customerExternalIds)
      .where(and(
        eq(customerExternalIds.tenantId, ctx.tenantId),
        eq(customerExternalIds.provider, input.provider),
        eq(customerExternalIds.externalId, input.externalId),
      ))
      .limit(1);
    if (existing) throw new ConflictError('External ID already exists for this provider');

    const [created] = await (tx as any).insert(customerExternalIds).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      provider: input.provider,
      externalId: input.externalId,
      metadata: input.metadata ?? null,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `External ID added: ${input.provider}`,
      metadata: { externalIdRecordId: created!.id, provider: input.provider, externalId: input.externalId },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_external_id.added.v1', {
      customerId: input.customerId,
      externalIdRecordId: created!.id,
      provider: input.provider,
      externalId: input.externalId,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.external_id_added', 'customer', input.customerId);
  return result;
}
