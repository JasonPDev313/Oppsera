/**
 * List deposit policies for a property.
 */
import { and, eq, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsDepositPolicies } from '@oppsera/db';

export interface DepositPolicyItem {
  id: string;
  propertyId: string;
  name: string;
  depositType: string;
  percentagePct: number | null;
  fixedAmountCents: number | null;
  chargeTiming: string;
  daysBefore: number | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export async function listDepositPolicies(
  tenantId: string,
  propertyId: string,
): Promise<DepositPolicyItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsDepositPolicies)
      .where(
        and(
          eq(pmsDepositPolicies.tenantId, tenantId),
          eq(pmsDepositPolicies.propertyId, propertyId),
        ),
      )
      .orderBy(desc(pmsDepositPolicies.createdAt));

    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      name: r.name,
      depositType: r.depositType,
      percentagePct: r.percentagePct ? Number(r.percentagePct) : null,
      fixedAmountCents: r.fixedAmountCents,
      chargeTiming: r.chargeTiming,
      daysBefore: r.daysBefore,
      isDefault: r.isDefault,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
