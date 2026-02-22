import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerActivityLog, withTenant } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RecordCustomerAuditEntryInput } from '../validation';

export async function recordCustomerAuditEntry(ctx: RequestContext, input: RecordCustomerAuditEntryInput) {
  return withTenant(ctx.tenantId, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const [entry] = await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: input.actionType,
      title: input.actionType,
      details: input.reason ?? null,
      metadata: {
        beforeJson: input.beforeJson ?? null,
        afterJson: input.afterJson ?? null,
        actorUserId: ctx.user.id,
      },
      createdBy: ctx.user.id,
    }).returning();

    return entry!;
  });
}
