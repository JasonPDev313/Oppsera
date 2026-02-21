import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsRatePlans } from '@oppsera/db';

export interface RatePlanListItem {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  defaultNightlyRateCents: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ListRatePlansInput {
  tenantId: string;
  propertyId: string;
  cursor?: string;
  limit?: number;
}

export interface ListRatePlansResult {
  items: RatePlanListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listRatePlans(input: ListRatePlansInput): Promise<ListRatePlansResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(pmsRatePlans.tenantId, input.tenantId),
      eq(pmsRatePlans.propertyId, input.propertyId),
    ];

    if (input.cursor) {
      conditions.push(lt(pmsRatePlans.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(pmsRatePlans)
      .where(and(...conditions))
      .orderBy(desc(pmsRatePlans.id))
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
        isDefault: r.isDefault,
        isActive: r.isActive,
        defaultNightlyRateCents: r.defaultNightlyRateCents ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
