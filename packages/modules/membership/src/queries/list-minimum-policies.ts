import { eq, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { minimumSpendRules } from '@oppsera/db';

export interface ListMinimumPoliciesInput {
  tenantId: string;
}

export interface MinimumPolicyEntry {
  id: string;
  title: string;
  amountCents: number;
  membershipPlanId: string | null;
  bucketType: string | null;
  allocationMethod: string | null;
  rolloverPolicy: string | null;
  excludeTax: boolean;
  excludeTips: boolean;
  excludeServiceCharges: boolean;
  excludeDues: boolean;
  createdAt: string;
}

export async function listMinimumPolicies(
  input: ListMinimumPoliciesInput,
): Promise<MinimumPolicyEntry[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await (tx as any)
      .select({
        id: minimumSpendRules.id,
        title: minimumSpendRules.title,
        amountCents: minimumSpendRules.amountCents,
        membershipPlanId: minimumSpendRules.membershipPlanId,
        bucketType: minimumSpendRules.bucketType,
        allocationMethod: minimumSpendRules.allocationMethod,
        rolloverPolicy: minimumSpendRules.rolloverPolicy,
        excludeTax: minimumSpendRules.excludeTax,
        excludeTips: minimumSpendRules.excludeTips,
        excludeServiceCharges: minimumSpendRules.excludeServiceCharges,
        excludeDues: minimumSpendRules.excludeDues,
        createdAt: minimumSpendRules.createdAt,
      })
      .from(minimumSpendRules)
      .where(eq(minimumSpendRules.tenantId, input.tenantId))
      .orderBy(desc(minimumSpendRules.createdAt));

    return (rows as any[]).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      amountCents: Number(r.amountCents),
      membershipPlanId: r.membershipPlanId ? String(r.membershipPlanId) : null,
      bucketType: r.bucketType ? String(r.bucketType) : null,
      allocationMethod: r.allocationMethod ? String(r.allocationMethod) : null,
      rolloverPolicy: r.rolloverPolicy ? String(r.rolloverPolicy) : null,
      excludeTax: Boolean(r.excludeTax),
      excludeTips: Boolean(r.excludeTips),
      excludeServiceCharges: Boolean(r.excludeServiceCharges),
      excludeDues: Boolean(r.excludeDues),
      createdAt: r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt),
    }));
  });
}
