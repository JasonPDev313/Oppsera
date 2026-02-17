import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers, customerIdentifiers, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddCustomerIdentifierInput } from '../validation';

export async function addCustomerIdentifier(ctx: RequestContext, input: AddCustomerIdentifierInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Check uniqueness
    const [existing] = await (tx as any).select({ id: customerIdentifiers.id }).from(customerIdentifiers)
      .where(and(
        eq(customerIdentifiers.tenantId, ctx.tenantId),
        eq(customerIdentifiers.type, input.type),
        eq(customerIdentifiers.value, input.value),
      ))
      .limit(1);
    if (existing) throw new ConflictError('Identifier already exists');

    const [created] = await (tx as any).insert(customerIdentifiers).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      type: input.type,
      value: input.value,
      isActive: true,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Identifier added: ${input.type}`,
      metadata: { type: input.type, value: input.value },
      createdBy: ctx.user.id,
    });

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'customer.identifier_added', 'customer', input.customerId);
  return result;
}
