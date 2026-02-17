import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { customers, membershipPlans, customerMemberships, billingAccounts, billingAccountMembers, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { EnrollMemberInput } from '../validation';

function computeRenewalDate(startDate: string, billingInterval: string): string | null {
  if (billingInterval === 'none') return null;
  const d = new Date(startDate);
  if (billingInterval === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (billingInterval === 'annual') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0]!;
}

export async function enrollMember(ctx: RequestContext, input: EnrollMemberInput) {
  const startDate = input.startDate ?? new Date().toISOString().split('T')[0]!;
  const today = new Date().toISOString().split('T')[0]!;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Verify plan
    const [plan] = await (tx as any).select().from(membershipPlans)
      .where(and(eq(membershipPlans.id, input.planId), eq(membershipPlans.tenantId, ctx.tenantId)))
      .limit(1);
    if (!plan) throw new NotFoundError('Membership plan', input.planId);
    if (!plan.isActive) throw new ValidationError('Membership plan is not active');

    // Verify billing account
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.billingAccountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.billingAccountId);
    if (account.status !== 'active') throw new ValidationError('Billing account is not active');

    // Verify customer is a member of the billing account
    const [bam] = await (tx as any).select({ id: billingAccountMembers.id }).from(billingAccountMembers)
      .where(and(
        eq(billingAccountMembers.tenantId, ctx.tenantId),
        eq(billingAccountMembers.billingAccountId, input.billingAccountId),
        eq(billingAccountMembers.customerId, input.customerId),
      ))
      .limit(1);
    if (!bam) throw new ValidationError('Customer is not a member of the billing account');

    const status = startDate > today ? 'pending' : 'active';
    const renewalDate = computeRenewalDate(startDate, plan.billingInterval);

    const [membership] = await (tx as any).insert(customerMemberships).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      planId: input.planId,
      billingAccountId: input.billingAccountId,
      status,
      startDate,
      renewalDate,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'membership_created',
      title: `Enrolled in ${plan.name}`,
      metadata: { membershipId: membership!.id, planId: input.planId, planName: plan.name },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'membership.created.v1', {
      membershipId: membership!.id,
      customerId: input.customerId,
      planId: input.planId,
      billingAccountId: input.billingAccountId,
      startDate,
      status,
    });

    return { result: membership!, events: [event] };
  });

  await auditLog(ctx, 'membership.created', 'membership', result.id);
  return result;
}
