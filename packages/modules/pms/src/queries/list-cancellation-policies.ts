/**
 * List cancellation policies for a property.
 */
import { and, eq, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsCancellationPolicies } from '@oppsera/db';

export interface CancellationPolicyItem {
  id: string;
  propertyId: string;
  name: string;
  penaltyType: string;
  percentagePct: number | null;
  fixedAmountCents: number | null;
  deadlineHours: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export async function listCancellationPolicies(
  tenantId: string,
  propertyId: string,
): Promise<CancellationPolicyItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsCancellationPolicies)
      .where(
        and(
          eq(pmsCancellationPolicies.tenantId, tenantId),
          eq(pmsCancellationPolicies.propertyId, propertyId),
        ),
      )
      .orderBy(desc(pmsCancellationPolicies.createdAt));

    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      name: r.name,
      penaltyType: r.penaltyType,
      percentagePct: r.percentagePct ? Number(r.percentagePct) : null,
      fixedAmountCents: r.fixedAmountCents,
      deadlineHours: r.deadlineHours,
      isDefault: r.isDefault,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
