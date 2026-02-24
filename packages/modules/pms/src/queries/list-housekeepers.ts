/**
 * List housekeepers for a property.
 */
import { and, eq, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsHousekeepers } from '@oppsera/db';

export interface HousekeeperItem {
  id: string;
  propertyId: string;
  name: string;
  phone: string | null;
  userId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listHousekeepers(
  tenantId: string,
  propertyId: string,
): Promise<HousekeeperItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsHousekeepers)
      .where(
        and(
          eq(pmsHousekeepers.tenantId, tenantId),
          eq(pmsHousekeepers.propertyId, propertyId),
        ),
      )
      .orderBy(desc(pmsHousekeepers.createdAt));

    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      name: r.name,
      phone: r.phone,
      userId: r.userId,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}
