import { eq, and, lt, desc, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsRoomTypes } from '@oppsera/db';

export interface RoomTypeListItem {
  id: string;
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
}

interface ListRoomTypesInput {
  tenantId: string;
  propertyId: string;
  cursor?: string;
  limit?: number;
}

export interface ListRoomTypesResult {
  items: RoomTypeListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listRoomTypes(input: ListRoomTypesInput): Promise<ListRoomTypesResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(pmsRoomTypes.tenantId, input.tenantId),
      eq(pmsRoomTypes.propertyId, input.propertyId),
    ];

    if (input.cursor) {
      conditions.push(lt(pmsRoomTypes.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(pmsRoomTypes)
      .where(and(...conditions))
      .orderBy(asc(pmsRoomTypes.sortOrder), desc(pmsRoomTypes.id))
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
        maxAdults: r.maxAdults,
        maxChildren: r.maxChildren,
        maxOccupancy: r.maxOccupancy,
        bedsJson: r.bedsJson ?? null,
        amenitiesJson: r.amenitiesJson ?? null,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
