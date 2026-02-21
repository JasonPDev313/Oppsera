import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { floorPlanRooms, floorPlanVersions } from '../schema';

export interface RoomDetail {
  id: string;
  tenantId: string;
  locationId: string;
  name: string;
  slug: string;
  description: string | null;
  widthFt: string;
  heightFt: string;
  gridSizeFt: string;
  scalePxPerFt: number;
  unit: string;
  defaultMode: string | null;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  currentVersionId: string | null;
  draftVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  hasDraft: boolean;
  currentVersion: {
    id: string;
    versionNumber: number;
    objectCount: number;
    totalCapacity: number;
    publishedAt: string | null;
    publishedBy: string | null;
  } | null;
  recentVersions: Array<{
    id: string;
    versionNumber: number;
    status: string;
    objectCount: number;
    totalCapacity: number;
    publishedAt: string | null;
    publishedBy: string | null;
    publishNote: string | null;
    createdAt: string;
  }>;
}

export async function getRoom(tenantId: string, roomId: string): Promise<RoomDetail> {
  return withTenant(tenantId, async (tx) => {
    const [room] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, roomId), eq(floorPlanRooms.tenantId, tenantId)))
      .limit(1);
    if (!room) throw new NotFoundError('Room', roomId);

    // Fetch current published version stats
    let currentVersion: RoomDetail['currentVersion'] = null;
    if (room.currentVersionId) {
      const [cv] = await tx
        .select()
        .from(floorPlanVersions)
        .where(eq(floorPlanVersions.id, room.currentVersionId))
        .limit(1);
      if (cv) {
        currentVersion = {
          id: cv.id,
          versionNumber: cv.versionNumber,
          objectCount: cv.objectCount,
          totalCapacity: cv.totalCapacity,
          publishedAt: cv.publishedAt?.toISOString() ?? null,
          publishedBy: cv.publishedBy,
        };
      }
    }

    // Fetch recent versions (last 10)
    const versions = await tx
      .select()
      .from(floorPlanVersions)
      .where(eq(floorPlanVersions.roomId, roomId))
      .orderBy(desc(floorPlanVersions.versionNumber))
      .limit(10);

    return {
      id: room.id,
      tenantId: room.tenantId,
      locationId: room.locationId,
      name: room.name,
      slug: room.slug,
      description: room.description,
      widthFt: room.widthFt,
      heightFt: room.heightFt,
      gridSizeFt: room.gridSizeFt,
      scalePxPerFt: room.scalePxPerFt,
      unit: room.unit,
      defaultMode: room.defaultMode,
      capacity: room.capacity,
      sortOrder: room.sortOrder,
      isActive: room.isActive,
      archivedAt: room.archivedAt?.toISOString() ?? null,
      archivedBy: room.archivedBy,
      currentVersionId: room.currentVersionId,
      draftVersionId: room.draftVersionId,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      createdBy: room.createdBy,
      hasDraft: room.draftVersionId !== null,
      currentVersion,
      recentVersions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        status: v.status,
        objectCount: v.objectCount,
        totalCapacity: v.totalCapacity,
        publishedAt: v.publishedAt?.toISOString() ?? null,
        publishedBy: v.publishedBy,
        publishNote: v.publishNote,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  });
}
