import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { AddCustomerNoteInput } from '../validation';

export async function addCustomerNote(ctx: RequestContext, input: AddCustomerNoteInput) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const [entry] = await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'note',
      title: input.title,
      details: input.details ?? null,
      createdBy: ctx.user.id,
    }).returning();

    return entry!;
  });

  await auditLog(ctx, 'customer.note_added', 'customer', input.customerId);
  return result;
}
