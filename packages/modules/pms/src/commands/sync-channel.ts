import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsChannels, pmsChannelSyncLog } from '@oppsera/db';
import type { SyncChannelInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function syncChannel(
  ctx: RequestContext,
  channelId: string,
  input: SyncChannelInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate channel exists
    const [channel] = await tx
      .select()
      .from(pmsChannels)
      .where(
        and(
          eq(pmsChannels.id, channelId),
          eq(pmsChannels.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!channel) {
      throw new NotFoundError('Channel', channelId);
    }

    // Update channel status to syncing
    await tx
      .update(pmsChannels)
      .set({ syncStatus: 'syncing', updatedAt: new Date() })
      .where(eq(pmsChannels.id, channelId));

    // Create sync log entry
    const [syncLog] = await tx
      .insert(pmsChannelSyncLog)
      .values({
        tenantId: ctx.tenantId,
        channelId,
        direction: 'outbound',
        entityType: input.entityType,
        status: 'success',
        recordsSynced: 0,
      })
      .returning();

    // TODO: Actual OTA API calls go here — this is a stub
    // Real implementation would call channel-specific adapters

    // Update channel status back to idle
    await tx
      .update(pmsChannels)
      .set({ syncStatus: 'idle', lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmsChannels.id, channelId));

    await pmsAuditLogEntry(tx, ctx, channel.propertyId, 'channel_sync', syncLog!.id, 'sync_completed');

    const event = buildEventFromContext(ctx, PMS_EVENTS.CHANNEL_SYNC_COMPLETED, {
      channelId,
      entityType: input.entityType,
      recordsSynced: 0,
    });

    return { result: syncLog!, events: [event] };
  });

  await auditLog(ctx, 'pms.channel.sync_completed', 'pms_channel_sync_log', result.id);

  return result;
}
