import { eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsLoyaltyPrograms } from '@oppsera/db';

export interface LoyaltyProgramItem {
  id: string;
  name: string;
  pointsPerDollar: number;
  pointsPerNight: number;
  redemptionValueCents: number;
  tiersJson: unknown;
  isActive: boolean;
  createdAt: string;
}

export async function listLoyaltyPrograms(
  tenantId: string,
): Promise<LoyaltyProgramItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsLoyaltyPrograms)
      .where(eq(pmsLoyaltyPrograms.tenantId, tenantId))
      .orderBy(pmsLoyaltyPrograms.createdAt);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      pointsPerDollar: r.pointsPerDollar,
      pointsPerNight: r.pointsPerNight,
      redemptionValueCents: r.redemptionValueCents,
      tiersJson: r.tiersJson,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
