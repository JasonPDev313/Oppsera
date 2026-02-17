import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipPlans, customerMemberships } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetMembershipPlanInput {
  tenantId: string;
  planId: string;
}

export interface MembershipPlanDetail {
  plan: typeof membershipPlans.$inferSelect;
  enrollmentCount: number;
}

export async function getMembershipPlan(
  input: GetMembershipPlanInput,
): Promise<MembershipPlanDetail> {
  return withTenant(input.tenantId, async (tx) => {
    const [plan] = await tx
      .select()
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.id, input.planId),
          eq(membershipPlans.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!plan) {
      throw new NotFoundError('MembershipPlan', input.planId);
    }

    const [countResult] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(customerMemberships)
      .where(
        and(
          eq(customerMemberships.tenantId, input.tenantId),
          eq(customerMemberships.planId, input.planId),
        ),
      );

    return {
      plan,
      enrollmentCount: countResult?.count ?? 0,
    };
  });
}
