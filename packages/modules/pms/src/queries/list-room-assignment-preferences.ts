import { and, eq, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsRoomAssignmentPreferences } from '@oppsera/db';

export interface RoomAssignmentPreferenceItem {
  id: string;
  propertyId: string;
  name: string;
  weight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listRoomAssignmentPreferences(
  tenantId: string,
  propertyId: string,
): Promise<RoomAssignmentPreferenceItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsRoomAssignmentPreferences)
      .where(
        and(
          eq(pmsRoomAssignmentPreferences.tenantId, tenantId),
          eq(pmsRoomAssignmentPreferences.propertyId, propertyId),
        ),
      )
      .orderBy(asc(pmsRoomAssignmentPreferences.name));

    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      name: r.name,
      weight: r.weight,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}
