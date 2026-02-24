import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, generateUlid } from '@oppsera/shared';
import { surchargeSettings } from '@oppsera/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type {
  SaveSurchargeSettingsInput,
  DeleteSurchargeSettingsInput,
} from '../validation/surcharge-settings';

/**
 * Save (upsert) surcharge settings at tenant/location/terminal level.
 * Uses cascading scoping: tenant-wide → location → terminal.
 */
export async function saveSurchargeSettings(
  ctx: RequestContext,
  input: SaveSurchargeSettingsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate rate sanity
    const maxRate = input.maxSurchargeRate ?? 0.04;
    if (input.surchargeRate > maxRate) {
      throw new AppError(
        'INVALID_SURCHARGE_RATE',
        'Surcharge rate cannot exceed the maximum surcharge rate',
        400,
      );
    }

    // Find existing row at the same scope
    const locationId = input.locationId ?? null;
    const terminalId = input.terminalId ?? null;

    const conditions = [
      eq(surchargeSettings.tenantId, ctx.tenantId),
      eq(surchargeSettings.providerId, input.providerId),
    ];

    if (locationId) {
      conditions.push(eq(surchargeSettings.locationId, locationId));
    } else {
      conditions.push(isNull(surchargeSettings.locationId));
    }

    if (terminalId) {
      conditions.push(eq(surchargeSettings.terminalId, terminalId));
    } else {
      conditions.push(isNull(surchargeSettings.terminalId));
    }

    const [existing] = await tx
      .select({ id: surchargeSettings.id })
      .from(surchargeSettings)
      .where(and(...conditions))
      .limit(1);

    const rateStr = input.surchargeRate.toFixed(4);
    const maxRateStr = maxRate.toFixed(4);

    if (existing) {
      // Update existing
      const [updated] = await tx
        .update(surchargeSettings)
        .set({
          isEnabled: input.isEnabled,
          surchargeRate: rateStr,
          maxSurchargeRate: maxRateStr,
          applyToCreditOnly: input.applyToCreditOnly,
          exemptDebit: input.exemptDebit,
          exemptPrepaid: input.exemptPrepaid,
          customerDisclosureText: input.customerDisclosureText,
          receiptDisclosureText: input.receiptDisclosureText,
          prohibitedStates: input.prohibitedStates,
          glAccountId: input.glAccountId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(surchargeSettings.id, existing.id))
        .returning();

      const event = buildEventFromContext(ctx, 'payments.surcharge.updated.v1', {
        surchargeSettingsId: existing.id,
        isEnabled: input.isEnabled,
        surchargeRate: rateStr,
        scope: terminalId ? 'terminal' : locationId ? 'location' : 'tenant',
      });

      return { result: updated!, events: [event] };
    }

    // Create new
    const id = generateUlid();
    const [created] = await tx
      .insert(surchargeSettings)
      .values({
        id,
        tenantId: ctx.tenantId,
        providerId: input.providerId,
        locationId,
        terminalId,
        isEnabled: input.isEnabled,
        surchargeRate: rateStr,
        maxSurchargeRate: maxRateStr,
        applyToCreditOnly: input.applyToCreditOnly,
        exemptDebit: input.exemptDebit,
        exemptPrepaid: input.exemptPrepaid,
        customerDisclosureText: input.customerDisclosureText,
        receiptDisclosureText: input.receiptDisclosureText,
        prohibitedStates: input.prohibitedStates,
        glAccountId: input.glAccountId ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'payments.surcharge.created.v1', {
      surchargeSettingsId: id,
      isEnabled: input.isEnabled,
      surchargeRate: rateStr,
      scope: terminalId ? 'terminal' : locationId ? 'location' : 'tenant',
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'payments.surcharge.saved', 'surcharge_settings', result.id);
  return result;
}

/**
 * Delete a surcharge settings row.
 */
export async function deleteSurchargeSettings(
  ctx: RequestContext,
  input: DeleteSurchargeSettingsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(surchargeSettings)
      .where(
        and(
          eq(surchargeSettings.tenantId, ctx.tenantId),
          eq(surchargeSettings.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Surcharge settings not found', 404);
    }

    await tx
      .delete(surchargeSettings)
      .where(eq(surchargeSettings.id, input.id));

    const event = buildEventFromContext(ctx, 'payments.surcharge.deleted.v1', {
      surchargeSettingsId: input.id,
      providerId: existing.providerId,
    });

    return { result: { id: input.id, deleted: true }, events: [event] };
  });

  await auditLog(ctx, 'payments.surcharge.deleted', 'surcharge_settings', input.id);
  return result;
}
