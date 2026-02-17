import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerPrivileges, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AssignCustomerPrivilegeInput } from '../validation';

export async function assignCustomerPrivilege(ctx: RequestContext, input: AssignCustomerPrivilegeInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const [created] = await (tx as any).insert(customerPrivileges).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      privilegeType: input.privilegeType,
      value: input.value as Record<string, unknown>,
      reason: input.reason ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdBy: ctx.user.id,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'privilege_assigned',
      title: `Privilege assigned: ${input.privilegeType}`,
      metadata: { privilegeId: created!.id, type: input.privilegeType, value: input.value },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.privilege.assigned.v1', {
      customerId: input.customerId,
      privilegeType: input.privilegeType,
      value: input.value,
      expiresAt: input.expiresAt,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.privilege_assigned', 'customer', input.customerId);
  return result;
}
