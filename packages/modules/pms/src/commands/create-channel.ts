import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { pmsChannels, pmsProperties } from '@oppsera/db';
import type { CreateChannelInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createChannel(ctx: RequestContext, input: CreateChannelInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'pms.createChannel');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Validate property exists and belongs to tenant
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(
        and(
          eq(pmsProperties.id, input.propertyId),
          eq(pmsProperties.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!property) {
      throw new NotFoundError('Property', input.propertyId);
    }

    // Check uniqueness of channel code per property
    const [existing] = await tx
      .select()
      .from(pmsChannels)
      .where(
        and(
          eq(pmsChannels.tenantId, ctx.tenantId),
          eq(pmsChannels.propertyId, input.propertyId),
          eq(pmsChannels.channelCode, input.channelCode),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(`Channel "${input.channelCode}" already exists for this property`);
    }

    const [created] = await tx
      .insert(pmsChannels)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        channelCode: input.channelCode,
        displayName: input.displayName,
        apiCredentialsJson: (input.apiCredentialsJson ?? {}) as Record<string, unknown>,
        mappingJson: (input.mappingJson ?? {}) as Record<string, unknown>,
        isActive: input.isActive ?? true,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'channel', created!.id, 'created');

    const event = buildEventFromContext(ctx, PMS_EVENTS.CHANNEL_CREATED, {
      channelId: created!.id,
      propertyId: input.propertyId,
      channelCode: input.channelCode,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'pms.createChannel', created);
    }

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.channel.created', 'pms_channel', result.id);

  return result;
}
