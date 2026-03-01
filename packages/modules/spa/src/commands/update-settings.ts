import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaSettings } from '@oppsera/db';
import type { z } from 'zod';
import { updateSpaSettingsSchema } from '../validation';

type UpdateSettingsInput = z.input<typeof updateSpaSettingsSchema>;

/**
 * Build an object of only the explicitly provided fields (not undefined)
 * to pass to Drizzle's `.set()` / `.values()`.
 */
function buildUpdateFields(validated: UpdateSettingsInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (validated.timezone !== undefined) fields.timezone = validated.timezone;
  if (validated.dayCloseTime !== undefined) fields.dayCloseTime = validated.dayCloseTime;
  if (validated.defaultCurrency !== undefined) fields.defaultCurrency = validated.defaultCurrency;
  if (validated.taxInclusive !== undefined) fields.taxInclusive = validated.taxInclusive;
  if (validated.defaultBufferMinutes !== undefined) fields.defaultBufferMinutes = validated.defaultBufferMinutes;
  if (validated.defaultCleanupMinutes !== undefined) fields.defaultCleanupMinutes = validated.defaultCleanupMinutes;
  if (validated.defaultSetupMinutes !== undefined) fields.defaultSetupMinutes = validated.defaultSetupMinutes;
  if (validated.onlineBookingEnabled !== undefined) fields.onlineBookingEnabled = validated.onlineBookingEnabled;
  if (validated.waitlistEnabled !== undefined) fields.waitlistEnabled = validated.waitlistEnabled;
  if (validated.autoAssignProvider !== undefined) fields.autoAssignProvider = validated.autoAssignProvider;
  if (validated.rebookingWindowDays !== undefined) fields.rebookingWindowDays = validated.rebookingWindowDays;
  if (validated.notificationPreferences !== undefined) fields.notificationPreferences = validated.notificationPreferences;
  if (validated.depositRules !== undefined) fields.depositRules = validated.depositRules;
  if (validated.cancellationDefaults !== undefined) fields.cancellationDefaults = validated.cancellationDefaults;
  if (validated.enterpriseMode !== undefined) fields.enterpriseMode = validated.enterpriseMode;

  return fields;
}

/**
 * Upsert spa settings for a tenant+location pair.
 * Creates settings row if none exists, updates if one already exists.
 */
export async function updateSpaSettings(ctx: RequestContext, input: UpdateSettingsInput) {
  const validated = updateSpaSettingsSchema.parse(input);
  const locationId = validated.locationId ?? ctx.locationId;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Build conditions — always filter by tenant, optionally by location
    const conditions = [eq(spaSettings.tenantId, ctx.tenantId)];
    if (locationId) {
      conditions.push(eq(spaSettings.locationId, locationId));
    }

    const [existing] = await tx
      .select()
      .from(spaSettings)
      .where(and(...conditions))
      .limit(1);

    const updateFields = buildUpdateFields(validated);

    let settings;
    if (existing) {
      // Update existing settings
      [settings] = await tx
        .update(spaSettings)
        .set({
          ...updateFields,
          updatedAt: new Date(),
        })
        .where(eq(spaSettings.id, existing.id))
        .returning();
    } else {
      // Insert new settings row
      [settings] = await tx
        .insert(spaSettings)
        .values({
          tenantId: ctx.tenantId,
          locationId: locationId ?? null,
          ...updateFields,
        })
        .returning();
    }

    return { result: settings!, events: [] };
  });

  await auditLog(ctx, 'spa.settings.updated', 'spa_settings', result.id);
  return result;
}
