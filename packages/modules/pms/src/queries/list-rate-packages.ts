import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsRatePackages, pmsRatePlans } from '@oppsera/db';

export interface RatePackageListItem {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  includesJson: Array<{
    itemCode: string;
    description: string;
    amountCents: number;
    entryType: string;
    frequency: string;
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListRatePackagesInput {
  tenantId: string;
  propertyId: string;
  activeOnly?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ListRatePackagesResult {
  items: RatePackageListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listRatePackages(input: ListRatePackagesInput): Promise<ListRatePackagesResult> {
  const limit = Math.min(input.limit ?? 50, 100);
  const activeOnly = input.activeOnly ?? true;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(pmsRatePackages.tenantId, input.tenantId),
      eq(pmsRatePackages.propertyId, input.propertyId),
    ];

    if (activeOnly) {
      conditions.push(eq(pmsRatePackages.isActive, true));
    }

    if (input.cursor) {
      conditions.push(lt(pmsRatePackages.id, input.cursor));
    }

    const rows = await tx
      .select({
        id: pmsRatePackages.id,
        propertyId: pmsRatePackages.propertyId,
        code: pmsRatePackages.code,
        name: pmsRatePackages.name,
        description: pmsRatePackages.description,
        ratePlanId: pmsRatePackages.ratePlanId,
        ratePlanName: pmsRatePlans.name,
        includesJson: pmsRatePackages.includesJson,
        isActive: pmsRatePackages.isActive,
        createdAt: pmsRatePackages.createdAt,
        updatedAt: pmsRatePackages.updatedAt,
      })
      .from(pmsRatePackages)
      .leftJoin(pmsRatePlans, eq(pmsRatePackages.ratePlanId, pmsRatePlans.id))
      .where(and(...conditions))
      .orderBy(desc(pmsRatePackages.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        code: r.code,
        name: r.name,
        description: r.description ?? null,
        ratePlanId: r.ratePlanId ?? null,
        ratePlanName: r.ratePlanName ?? null,
        includesJson: (r.includesJson ?? []) as RatePackageListItem['includesJson'],
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
