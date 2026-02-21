import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { floorPlanVersions } from '../schema';

export interface VersionHistoryInput {
  tenantId: string;
  roomId: string;
  cursor?: string;
  limit?: number;
}

export interface VersionHistoryRow {
  id: string;
  versionNumber: number;
  status: string;
  objectCount: number;
  totalCapacity: number;
  publishedAt: string | null;
  publishedBy: string | null;
  publishNote: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface VersionHistoryResult {
  items: VersionHistoryRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getVersionHistory(input: VersionHistoryInput): Promise<VersionHistoryResult> {
  const limit = Math.min(input.limit ?? 20, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(floorPlanVersions.roomId, input.roomId),
      eq(floorPlanVersions.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      conditions.push(lt(floorPlanVersions.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(floorPlanVersions)
      .where(and(...conditions))
      .orderBy(desc(floorPlanVersions.versionNumber))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items: VersionHistoryRow[] = (hasMore ? rows.slice(0, limit) : rows).map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      objectCount: v.objectCount,
      totalCapacity: v.totalCapacity,
      publishedAt: v.publishedAt?.toISOString() ?? null,
      publishedBy: v.publishedBy,
      publishNote: v.publishNote,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
