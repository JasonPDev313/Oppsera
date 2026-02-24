import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsChannelSyncLog } from '@oppsera/db';

export interface ChannelSyncLogItem {
  id: string;
  channelId: string;
  direction: string;
  entityType: string;
  status: string;
  recordsSynced: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export async function listChannelSyncLog(
  tenantId: string,
  channelId: string,
  limit: number = 50,
): Promise<ChannelSyncLogItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsChannelSyncLog)
      .where(and(
        eq(pmsChannelSyncLog.tenantId, tenantId),
        eq(pmsChannelSyncLog.channelId, channelId),
      ))
      .orderBy(desc(pmsChannelSyncLog.startedAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      channelId: r.channelId,
      direction: r.direction,
      entityType: r.entityType,
      status: r.status,
      recordsSynced: r.recordsSynced,
      errorMessage: r.errorMessage,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));
  });
}
