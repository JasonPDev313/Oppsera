import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { customerMemberships, membershipPlans, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateMembershipStatusInput } from '../validation';

const VALID_TRANSITIONS: Record<string, Record<string, string>> = {
  active: { pause: 'paused', cancel: 'canceled', expire: 'expired' },
  paused: { reactivate: 'active', cancel: 'canceled' },
  canceled: { reactivate: 'active' },
};

function computeRenewalDate(startDate: string, billingInterval: string): string | null {
  if (billingInterval === 'none') return null;
  const d = new Date(startDate);
  if (billingInterval === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (billingInterval === 'annual') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0]!;
}

export async function updateMembershipStatus(ctx: RequestContext, input: UpdateMembershipStatusInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [membership] = await (tx as any).select().from(customerMemberships)
      .where(and(eq(customerMemberships.id, input.membershipId), eq(customerMemberships.tenantId, ctx.tenantId)))
      .limit(1);
    if (!membership) throw new NotFoundError('Membership', input.membershipId);

    const transitions = VALID_TRANSITIONS[membership.status];
    if (!transitions || !transitions[input.action]) {
      const validActions = transitions ? Object.keys(transitions).join(', ') : 'none';
      throw new ValidationError(`Invalid transition: cannot ${input.action} from ${membership.status}. Valid actions: ${validActions}`);
    }

    if (input.action === 'cancel' && !input.reason) {
      throw new ValidationError('Reason is required when canceling a membership');
    }

    const newStatus = transitions[input.action]!;
    const updates: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (input.action === 'cancel') {
      updates.cancelReason = input.reason;
      updates.endDate = new Date().toISOString().split('T')[0]!;
    }

    if (input.action === 'reactivate' && membership.status === 'canceled') {
      // Get the plan to compute new renewal date
      const [plan] = await (tx as any).select().from(membershipPlans)
        .where(eq(membershipPlans.id, membership.planId))
        .limit(1);
      const newStartDate = new Date().toISOString().split('T')[0]!;
      updates.startDate = newStartDate;
      updates.endDate = null;
      updates.cancelReason = null;
      if (plan) {
        updates.renewalDate = computeRenewalDate(newStartDate, plan.billingInterval);
      }
    }

    const [updated] = await (tx as any).update(customerMemberships).set(updates)
      .where(eq(customerMemberships.id, input.membershipId)).returning();

    // Activity log
    const activityType = input.action === 'cancel' ? 'membership_canceled' : 'system';
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: membership.customerId,
      activityType,
      title: `Membership ${input.action}d`,
      details: input.reason ?? null,
      metadata: { membershipId: input.membershipId, action: input.action, previousStatus: membership.status, newStatus },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'membership.updated.v1', {
      membershipId: input.membershipId,
      customerId: membership.customerId,
      action: input.action,
      previousStatus: membership.status,
      newStatus,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'membership.status_updated', 'membership', input.membershipId);
  return result;
}
