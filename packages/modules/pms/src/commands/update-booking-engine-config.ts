import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsBookingEngineConfig, pmsProperties } from '@oppsera/db';
import type { UpdateBookingEngineConfigInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateBookingEngineConfig(
  ctx: RequestContext,
  input: UpdateBookingEngineConfigInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
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

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.widgetThemeJson !== undefined) updates.widgetThemeJson = input.widgetThemeJson;
    if (input.allowedRatePlanIds !== undefined) updates.allowedRatePlanIds = input.allowedRatePlanIds;
    if (input.minLeadTimeHours !== undefined) updates.minLeadTimeHours = input.minLeadTimeHours;
    if (input.maxAdvanceDays !== undefined) updates.maxAdvanceDays = input.maxAdvanceDays;
    if (input.termsUrl !== undefined) updates.termsUrl = input.termsUrl;
    if (input.privacyUrl !== undefined) updates.privacyUrl = input.privacyUrl;
    if (input.confirmationTemplateId !== undefined) updates.confirmationTemplateId = input.confirmationTemplateId;

    // Try update first (upsert pattern)
    const [existing] = await tx
      .select()
      .from(pmsBookingEngineConfig)
      .where(
        and(
          eq(pmsBookingEngineConfig.tenantId, ctx.tenantId),
          eq(pmsBookingEngineConfig.propertyId, input.propertyId),
        ),
      )
      .limit(1);

    let config;
    if (existing) {
      const [updated] = await tx
        .update(pmsBookingEngineConfig)
        .set(updates)
        .where(eq(pmsBookingEngineConfig.id, existing.id))
        .returning();
      config = updated!;
    } else {
      const [created] = await tx
        .insert(pmsBookingEngineConfig)
        .values({
          tenantId: ctx.tenantId,
          propertyId: input.propertyId,
          isActive: input.isActive ?? false,
          widgetThemeJson: (input.widgetThemeJson ?? {}) as Record<string, unknown>,
          allowedRatePlanIds: input.allowedRatePlanIds ?? [],
          minLeadTimeHours: input.minLeadTimeHours ?? 0,
          maxAdvanceDays: input.maxAdvanceDays ?? 365,
          termsUrl: input.termsUrl ?? null,
          privacyUrl: input.privacyUrl ?? null,
          confirmationTemplateId: input.confirmationTemplateId ?? null,
        })
        .returning();
      config = created!;
    }

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'booking_engine_config', config.id, 'updated');

    const event = buildEventFromContext(ctx, PMS_EVENTS.BOOKING_ENGINE_CONFIG_UPDATED, {
      propertyId: input.propertyId,
      isActive: config.isActive,
    });

    return { result: config, events: [event] };
  });

  await auditLog(ctx, 'pms.booking_engine.config_updated', 'pms_booking_engine_config', result.id);

  return result;
}
