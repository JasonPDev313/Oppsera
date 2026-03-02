import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaBookingWidgetConfig } from '@oppsera/db';
import type { z } from 'zod';
import { updateBookingWidgetConfigSchema } from '../validation';

type UpdateInput = z.input<typeof updateBookingWidgetConfigSchema>;

function buildUpdateFields(validated: UpdateInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (validated.theme !== undefined) fields.theme = validated.theme;
  if (validated.logoUrl !== undefined) fields.logoUrl = validated.logoUrl;
  if (validated.welcomeMessage !== undefined) fields.welcomeMessage = validated.welcomeMessage;
  if (validated.bookingLeadTimeHours !== undefined) fields.bookingLeadTimeHours = validated.bookingLeadTimeHours;
  if (validated.maxAdvanceBookingDays !== undefined) fields.maxAdvanceBookingDays = validated.maxAdvanceBookingDays;
  if (validated.requireDeposit !== undefined) fields.requireDeposit = validated.requireDeposit;
  if (validated.depositType !== undefined) fields.depositType = validated.depositType;
  if (validated.depositValue !== undefined) fields.depositValue = validated.depositValue;
  if (validated.cancellationWindowHours !== undefined) fields.cancellationWindowHours = validated.cancellationWindowHours;
  if (validated.cancellationFeeType !== undefined) fields.cancellationFeeType = validated.cancellationFeeType;
  if (validated.cancellationFeeValue !== undefined) fields.cancellationFeeValue = validated.cancellationFeeValue;
  if (validated.showPrices !== undefined) fields.showPrices = validated.showPrices;
  if (validated.showProviderPhotos !== undefined) fields.showProviderPhotos = validated.showProviderPhotos;
  if (validated.allowProviderSelection !== undefined) fields.allowProviderSelection = validated.allowProviderSelection;
  if (validated.allowAddonSelection !== undefined) fields.allowAddonSelection = validated.allowAddonSelection;
  if (validated.customCss !== undefined) fields.customCss = validated.customCss;
  if (validated.redirectUrl !== undefined) fields.redirectUrl = validated.redirectUrl;
  // Per-webapp customization JSONB fields
  if (validated.businessIdentity !== undefined) fields.businessIdentity = validated.businessIdentity;
  if (validated.contactLocation !== undefined) fields.contactLocation = validated.contactLocation;
  if (validated.branding !== undefined) fields.branding = validated.branding;
  if (validated.operational !== undefined) fields.operational = validated.operational;
  if (validated.legal !== undefined) fields.legal = validated.legal;
  if (validated.seo !== undefined) fields.seo = validated.seo;

  return fields;
}

/**
 * Upsert booking widget configuration for a tenant.
 * Creates row if none exists, updates if one already exists.
 */
export async function updateBookingWidgetConfig(ctx: RequestContext, input: UpdateInput) {
  const validated = updateBookingWidgetConfigSchema.parse(input);
  const locationId = validated.locationId ?? ctx.locationId;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check inside the transaction (gotcha #7)
    if (validated.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, validated.clientRequestId, 'updateBookingWidgetConfig');
      if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const conditions = [eq(spaBookingWidgetConfig.tenantId, ctx.tenantId)];
    if (locationId) {
      conditions.push(eq(spaBookingWidgetConfig.locationId, locationId));
    }

    const [existing] = await tx
      .select()
      .from(spaBookingWidgetConfig)
      .where(and(...conditions))
      .limit(1);

    const updateFields = buildUpdateFields(validated);

    let config;
    if (existing) {
      [config] = await tx
        .update(spaBookingWidgetConfig)
        .set({
          ...updateFields,
          updatedAt: new Date(),
        })
        .where(eq(spaBookingWidgetConfig.id, existing.id))
        .returning();
    } else {
      [config] = await tx
        .insert(spaBookingWidgetConfig)
        .values({
          tenantId: ctx.tenantId,
          locationId: locationId ?? null,
          ...updateFields,
        })
        .returning();
    }

    if (validated.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, validated.clientRequestId, 'updateBookingWidgetConfig', config);
    }

    return { result: config!, events: [] };
  });

  await auditLog(ctx, 'spa.booking_widget_config.updated', 'spa_booking_widget_config', result.id);
  return result;
}
