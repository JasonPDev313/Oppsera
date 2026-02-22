import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers } from '@oppsera/db';
import { eq, and, ne } from 'drizzle-orm';
import type { UpdateCustomerMemberNumberInput } from '../validation';

export async function updateCustomerMemberNumber(
  ctx: RequestContext,
  input: UpdateCustomerMemberNumberInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [customer] = await (tx as any)
      .select({ id: customers.id, memberNumber: customers.memberNumber })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Check uniqueness if setting a new member number
    if (input.memberNumber) {
      const [dup] = await (tx as any)
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, ctx.tenantId),
            eq(customers.memberNumber, input.memberNumber),
            ne(customers.id, input.customerId),
          ),
        )
        .limit(1);
      if (dup) throw new ConflictError('Member number already assigned to another customer');
    }

    const [updated] = await (tx as any)
      .update(customers)
      .set({
        memberNumber: input.memberNumber ?? null,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, input.customerId))
      .returning();

    const event = buildEventFromContext(ctx, 'customer.member_number.updated.v1', {
      customerId: input.customerId,
      memberNumber: input.memberNumber ?? null,
      previousMemberNumber: customer.memberNumber ?? null,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.member_number_updated', 'customer', input.customerId);
  return result;
}
