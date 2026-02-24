import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsChannels } from '@oppsera/db';
import type { UpdateChannelInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateChannel(
  ctx: RequestContext,
  id: string,
  input: UpdateChannelInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing channel
    const [existing] = await tx
      .select()
      .from(pmsChannels)
      .where(
        and(
          eq(pmsChannels.id, id),
          eq(pmsChannels.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Channel', id);
    }

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.apiCredentialsJson !== undefined) updates.apiCredentialsJson = input.apiCredentialsJson;
    if (input.mappingJson !== undefined) updates.mappingJson = input.mappingJson;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await tx
      .update(pmsChannels)
      .set(updates)
      .where(
        and(
          eq(pmsChannels.id, id),
          eq(pmsChannels.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.displayName !== undefined && existing.displayName !== updated!.displayName) {
      diff.displayName = { before: existing.displayName, after: updated!.displayName };
    }
    if (input.apiCredentialsJson !== undefined) {
      diff.apiCredentialsJson = { before: existing.apiCredentialsJson, after: updated!.apiCredentialsJson };
    }
    if (input.mappingJson !== undefined) {
      diff.mappingJson = { before: existing.mappingJson, after: updated!.mappingJson };
    }
    if (input.isActive !== undefined && existing.isActive !== updated!.isActive) {
      diff.isActive = { before: existing.isActive, after: updated!.isActive };
    }

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'channel', id, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.CHANNEL_UPDATED, {
      channelId: id,
      propertyId: existing.propertyId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.channel.updated', 'pms_channel', result.id);

  return result;
}
