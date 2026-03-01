import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaProviders, spaProviderAvailability } from '@oppsera/db';
import type { SetProviderAvailabilityInput } from '../validation';

/**
 * Sets (replaces) the weekly availability template for a provider.
 * Deletes all existing availability rows for the provider's effectiveFrom date,
 * then inserts the new set. This is a config change — no domain events.
 */
export async function setProviderAvailability(
  ctx: RequestContext,
  input: SetProviderAvailabilityInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate provider exists and belongs to tenant
    const [provider] = await tx
      .select({ id: spaProviders.id })
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.id, input.providerId),
          eq(spaProviders.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!provider) {
      throw new AppError('NOT_FOUND', `Provider not found: ${input.providerId}`, 404);
    }

    // Validate no duplicate day-of-week + time overlaps within the input slots
    for (let i = 0; i < input.slots.length; i++) {
      for (let j = i + 1; j < input.slots.length; j++) {
        const a = input.slots[i]!;
        const b = input.slots[j]!;
        if (
          a.dayOfWeek === b.dayOfWeek &&
          (a.locationId ?? null) === (b.locationId ?? null) &&
          a.startTime < b.endTime &&
          b.startTime < a.endTime
        ) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Overlapping availability slots on day ${a.dayOfWeek}: ${a.startTime}-${a.endTime} and ${b.startTime}-${b.endTime}`,
            400,
          );
        }
      }
    }

    // Delete existing availability for this provider with the same effectiveFrom
    await tx
      .delete(spaProviderAvailability)
      .where(
        and(
          eq(spaProviderAvailability.tenantId, ctx.tenantId),
          eq(spaProviderAvailability.providerId, input.providerId),
          eq(spaProviderAvailability.effectiveFrom, input.effectiveFrom),
        ),
      );

    // Insert new availability rows
    const rows = input.slots.map((slot) => ({
      tenantId: ctx.tenantId,
      providerId: input.providerId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      locationId: slot.locationId ?? null,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
      isActive: true,
    }));

    if (rows.length > 0) {
      await tx.insert(spaProviderAvailability).values(rows);
    }

    // No domain events for config changes
    return { result: { providerId: input.providerId, slotsCount: rows.length }, events: [] };
  });

  await auditLog(ctx, 'spa.provider.availability_set', 'spa_provider', input.providerId);
  return result;
}
