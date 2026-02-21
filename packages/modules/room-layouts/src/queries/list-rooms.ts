import { eq, and, lt, ilike, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { floorPlanRooms, floorPlanVersions } from '../schema';

export interface ListRoomsInput {
  tenantId: string;
  locationId?: string;
  isActive?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface RoomListRow {
  id: string;
  tenantId: string;
  locationId: string;
  name: string;
  slug: string;
  description: string | null;
  widthFt: string;
  heightFt: string;
  unit: string;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  currentVersionId: string | null;
  draftVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  // Current version stats
  objectCount: number | null;
  totalCapacity: number | null;
  publishedAt: string | null;
}

export interface ListRoomsResult {
  items: RoomListRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listRooms(input: ListRoomsInput): Promise<ListRoomsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(floorPlanRooms.tenantId, input.tenantId)];

    if (input.locationId) {
      conditions.push(eq(floorPlanRooms.locationId, input.locationId));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(floorPlanRooms.isActive, input.isActive));
    }

    if (input.search) {
      conditions.push(ilike(floorPlanRooms.name, `%${input.search}%`));
    }

    if (input.cursor) {
      conditions.push(lt(floorPlanRooms.id, input.cursor));
    }

    const rows = await tx
      .select({
        id: floorPlanRooms.id,
        tenantId: floorPlanRooms.tenantId,
        locationId: floorPlanRooms.locationId,
        name: floorPlanRooms.name,
        slug: floorPlanRooms.slug,
        description: floorPlanRooms.description,
        widthFt: floorPlanRooms.widthFt,
        heightFt: floorPlanRooms.heightFt,
        unit: floorPlanRooms.unit,
        capacity: floorPlanRooms.capacity,
        sortOrder: floorPlanRooms.sortOrder,
        isActive: floorPlanRooms.isActive,
        archivedAt: floorPlanRooms.archivedAt,
        currentVersionId: floorPlanRooms.currentVersionId,
        draftVersionId: floorPlanRooms.draftVersionId,
        createdAt: floorPlanRooms.createdAt,
        updatedAt: floorPlanRooms.updatedAt,
        objectCount: floorPlanVersions.objectCount,
        totalCapacity: floorPlanVersions.totalCapacity,
        publishedAt: floorPlanVersions.publishedAt,
      })
      .from(floorPlanRooms)
      .leftJoin(floorPlanVersions, eq(floorPlanRooms.currentVersionId, floorPlanVersions.id))
      .where(and(...conditions))
      .orderBy(asc(floorPlanRooms.sortOrder), asc(floorPlanRooms.name))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items: RoomListRow[] = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      locationId: r.locationId,
      name: r.name,
      slug: r.slug,
      description: r.description,
      widthFt: r.widthFt,
      heightFt: r.heightFt,
      unit: r.unit,
      capacity: r.capacity,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      currentVersionId: r.currentVersionId,
      draftVersionId: r.draftVersionId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      objectCount: r.objectCount ?? null,
      totalCapacity: r.totalCapacity ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
