import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers, customerHouseholds, customerHouseholdMembers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddHouseholdMemberInput } from '../validation';

export async function addHouseholdMember(ctx: RequestContext, input: AddHouseholdMemberInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify household exists
    const [household] = await (tx as any).select({ id: customerHouseholds.id }).from(customerHouseholds)
      .where(and(eq(customerHouseholds.id, input.householdId), eq(customerHouseholds.tenantId, ctx.tenantId)))
      .limit(1);
    if (!household) throw new NotFoundError('Household', input.householdId);

    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Check uniqueness: customer not already a member
    const [existing] = await (tx as any).select({ id: customerHouseholdMembers.id }).from(customerHouseholdMembers)
      .where(and(
        eq(customerHouseholdMembers.tenantId, ctx.tenantId),
        eq(customerHouseholdMembers.householdId, input.householdId),
        eq(customerHouseholdMembers.customerId, input.customerId),
      ))
      .limit(1);
    if (existing) throw new ConflictError('Customer is already a member of this household');

    const [created] = await (tx as any).insert(customerHouseholdMembers).values({
      tenantId: ctx.tenantId,
      householdId: input.householdId,
      customerId: input.customerId,
      role: input.role,
    }).returning();

    const event = buildEventFromContext(ctx, 'customer_household_member.added.v1', {
      householdId: input.householdId,
      customerId: input.customerId,
      role: input.role,
      membershipId: created!.id,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.household_member_added', 'customer', input.customerId);
  return result;
}
