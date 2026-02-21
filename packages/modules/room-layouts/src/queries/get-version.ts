import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { floorPlanVersions } from '../schema';

export interface VersionDetail {
  id: string;
  roomId: string;
  versionNumber: number;
  status: string;
  snapshotJson: Record<string, unknown>;
  objectCount: number;
  totalCapacity: number;
  publishedAt: string | null;
  publishedBy: string | null;
  publishNote: string | null;
  createdAt: string;
  createdBy: string | null;
}

export async function getVersion(
  tenantId: string,
  roomId: string,
  versionId: string,
): Promise<VersionDetail> {
  return withTenant(tenantId, async (tx) => {
    const [version] = await tx
      .select()
      .from(floorPlanVersions)
      .where(
        and(
          eq(floorPlanVersions.id, versionId),
          eq(floorPlanVersions.roomId, roomId),
          eq(floorPlanVersions.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!version) throw new NotFoundError('Version', versionId);

    return {
      id: version.id,
      roomId: version.roomId,
      versionNumber: version.versionNumber,
      status: version.status,
      snapshotJson: version.snapshotJson as Record<string, unknown>,
      objectCount: version.objectCount,
      totalCapacity: version.totalCapacity,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      publishedBy: version.publishedBy,
      publishNote: version.publishNote,
      createdAt: version.createdAt.toISOString(),
      createdBy: version.createdBy,
    };
  });
}
