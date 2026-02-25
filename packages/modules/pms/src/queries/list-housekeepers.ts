/**
 * List housekeepers for a property, enriched with linked user data.
 */
import { and, eq, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsHousekeepers, users } from '@oppsera/db';

export interface HousekeeperItem {
  id: string;
  propertyId: string;
  name: string;
  phone: string | null;
  userId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userEmail: string;
  userDisplayName: string | null;
  userStatus: string;
}

export async function listHousekeepers(
  tenantId: string,
  propertyId: string,
): Promise<HousekeeperItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: pmsHousekeepers.id,
        propertyId: pmsHousekeepers.propertyId,
        name: pmsHousekeepers.name,
        phone: pmsHousekeepers.phone,
        userId: pmsHousekeepers.userId,
        isActive: pmsHousekeepers.isActive,
        createdAt: pmsHousekeepers.createdAt,
        updatedAt: pmsHousekeepers.updatedAt,
        userEmail: users.email,
        userDisplayName: users.displayName,
        userStatus: users.status,
      })
      .from(pmsHousekeepers)
      .leftJoin(users, eq(pmsHousekeepers.userId, users.id))
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
      userEmail: r.userEmail ?? '',
      userDisplayName: r.userDisplayName ?? null,
      userStatus: r.userStatus ?? 'active',
    }));
  });
}
