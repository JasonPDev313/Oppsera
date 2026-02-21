import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { pmsRoomTypes } from '@oppsera/db';

export interface RoomTypeDetail {
  id: string;
  tenantId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  bedsJson: Array<{ type: string; count: number }> | null;
  amenitiesJson: string[] | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export async function getRoomType(tenantId: string, roomTypeId: string): Promise<RoomTypeDetail> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pmsRoomTypes)
      .where(and(eq(pmsRoomTypes.id, roomTypeId), eq(pmsRoomTypes.tenantId, tenantId)))
      .limit(1);

    if (!row) {
      throw new NotFoundError('Room type', roomTypeId);
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      propertyId: row.propertyId,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      maxAdults: row.maxAdults,
      maxChildren: row.maxChildren,
      maxOccupancy: row.maxOccupancy,
      bedsJson: row.bedsJson ?? null,
      amenitiesJson: row.amenitiesJson ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy ?? null,
    };
  });
}
