import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsChannels } from '@oppsera/db';

export interface ChannelListItem {
  id: string;
  propertyId: string;
  channelCode: string;
  displayName: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListChannelsResult {
  items: ChannelListItem[];
}

export async function listChannels(
  tenantId: string,
  propertyId: string,
): Promise<ListChannelsResult> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsChannels)
      .where(and(
        eq(pmsChannels.tenantId, tenantId),
        eq(pmsChannels.propertyId, propertyId),
      ))
      .orderBy(desc(pmsChannels.createdAt));

    return {
      items: rows.map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        channelCode: r.channelCode,
        displayName: r.displayName,
        isActive: r.isActive,
        lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
        syncStatus: r.syncStatus,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });
}
