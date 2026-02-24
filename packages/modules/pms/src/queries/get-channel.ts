import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsChannels } from '@oppsera/db';

export interface ChannelDetail {
  id: string;
  propertyId: string;
  channelCode: string;
  displayName: string;
  apiCredentialsJson: Record<string, unknown>;
  mappingJson: Record<string, unknown>;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
}

export async function getChannel(
  tenantId: string,
  id: string,
): Promise<ChannelDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pmsChannels)
      .where(and(eq(pmsChannels.id, id), eq(pmsChannels.tenantId, tenantId)))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      propertyId: row.propertyId,
      channelCode: row.channelCode,
      displayName: row.displayName,
      apiCredentialsJson: (row.apiCredentialsJson ?? {}) as Record<string, unknown>,
      mappingJson: (row.mappingJson ?? {}) as Record<string, unknown>,
      isActive: row.isActive,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      syncStatus: row.syncStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
