import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerHouseholds, customerHouseholdMembers, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateHouseholdInput } from '../validation';

export async function createHousehold(ctx: RequestContext, input: CreateHouseholdInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify primary customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.primaryCustomerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.primaryCustomerId);

    // Create household
    const [created] = await (tx as any).insert(customerHouseholds).values({
      tenantId: ctx.tenantId,
      name: input.name,
      householdType: input.householdType,
      primaryCustomerId: input.primaryCustomerId,
      billingAccountId: input.billingAccountId ?? null,
      createdBy: ctx.user.id,
    }).returning();

    // Auto-insert primary customer as household member with role='primary'
    await (tx as any).insert(customerHouseholdMembers).values({
      tenantId: ctx.tenantId,
      householdId: created!.id,
      customerId: input.primaryCustomerId,
      role: 'primary',
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.primaryCustomerId,
      activityType: 'system',
      title: `Household created: ${input.name}`,
      metadata: { householdId: created!.id, householdType: input.householdType },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_household.created.v1', {
      householdId: created!.id,
      name: input.name,
      householdType: input.householdType,
      primaryCustomerId: input.primaryCustomerId,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.household_created', 'customer', input.primaryCustomerId);
  return result;
}
