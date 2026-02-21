import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { floorPlanRooms, floorPlanVersions } from '../schema';

export interface RoomEditorData {
  id: string;
  name: string;
  slug: string;
  locationId: string;
  widthFt: number;
  heightFt: number;
  gridSizeFt: number;
  scalePxPerFt: number;
  unit: string;
  defaultMode: string | null;
  currentVersionId: string | null;
  draftVersionId: string | null;
  versionNumber: number;
  snapshotJson: Record<string, unknown>;
}

export async function getRoomForEditor(tenantId: string, roomId: string): Promise<RoomEditorData> {
  return withTenant(tenantId, async (tx) => {
    const [room] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, roomId), eq(floorPlanRooms.tenantId, tenantId)))
      .limit(1);
    if (!room) throw new NotFoundError('Room', roomId);

    // Prefer draft, fall back to current published
    const versionId = room.draftVersionId ?? room.currentVersionId;
    let snapshotJson: Record<string, unknown> = {
      formatVersion: 1,
      objects: [],
      layers: [{ id: 'default', name: 'Main', visible: true, locked: false, sortOrder: 0 }],
      metadata: { lastEditedAt: new Date().toISOString(), lastEditedBy: '', objectCount: 0, totalCapacity: 0 },
    };
    let versionNumber = 0;

    if (versionId) {
      const [version] = await tx
        .select()
        .from(floorPlanVersions)
        .where(eq(floorPlanVersions.id, versionId))
        .limit(1);
      if (version) {
        snapshotJson = version.snapshotJson as Record<string, unknown>;
        versionNumber = version.versionNumber;
      }
    }

    return {
      id: room.id,
      name: room.name,
      slug: room.slug,
      locationId: room.locationId,
      widthFt: Number(room.widthFt),
      heightFt: Number(room.heightFt),
      gridSizeFt: Number(room.gridSizeFt),
      scalePxPerFt: room.scalePxPerFt,
      unit: room.unit,
      defaultMode: room.defaultMode,
      currentVersionId: room.currentVersionId,
      draftVersionId: room.draftVersionId,
      versionNumber,
      snapshotJson,
    };
  });
}
