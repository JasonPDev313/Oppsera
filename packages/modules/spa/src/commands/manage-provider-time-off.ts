import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaProviders, spaProviderTimeOff } from '@oppsera/db';
import type { CreateProviderTimeOffInput } from '../validation';

/**
 * Create a time-off entry for a spa provider.
 * Validates the provider exists and that the new time-off does not overlap
 * with any existing non-rejected time-off entries.
 */
export async function createProviderTimeOff(
  ctx: RequestContext,
  input: CreateProviderTimeOffInput,
) {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);

  if (endAt <= startAt) {
    throw new AppError('VALIDATION_ERROR', 'endAt must be after startAt', 400);
  }

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

    // Check for overlapping time-off (exclude rejected entries)
    const overlapping = await tx
      .select({ id: spaProviderTimeOff.id })
      .from(spaProviderTimeOff)
      .where(
        and(
          eq(spaProviderTimeOff.tenantId, ctx.tenantId),
          eq(spaProviderTimeOff.providerId, input.providerId),
          // Not rejected
          sql`${spaProviderTimeOff.status} != 'rejected'`,
          // Overlap check: existing.start < new.end AND existing.end > new.start
          sql`${spaProviderTimeOff.startAt} < ${endAt.toISOString()}`,
          sql`${spaProviderTimeOff.endAt} > ${startAt.toISOString()}`,
        ),
      )
      .limit(1);

    if (overlapping.length > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Time-off overlaps with an existing time-off entry',
        400,
      );
    }

    const [created] = await tx
      .insert(spaProviderTimeOff)
      .values({
        tenantId: ctx.tenantId,
        providerId: input.providerId,
        startAt,
        endAt,
        reason: input.reason ?? null,
        isAllDay: input.isAllDay ?? false,
        status: 'pending',
      })
      .returning();

    // Time-off is config — no domain events
    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'spa.provider.time_off_created', 'spa_provider_time_off', result.id);
  return result;
}

/**
 * Cancel (delete) a time-off entry for a spa provider.
 * Only pending or approved entries can be canceled.
 */
export async function cancelProviderTimeOff(
  ctx: RequestContext,
  timeOffId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing time-off
    const [existing] = await tx
      .select()
      .from(spaProviderTimeOff)
      .where(
        and(
          eq(spaProviderTimeOff.id, timeOffId),
          eq(spaProviderTimeOff.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Time-off entry not found: ${timeOffId}`, 404);
    }

    if (existing.status === 'rejected') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Cannot cancel a rejected time-off entry',
        400,
      );
    }

    // Delete the time-off entry
    await tx
      .delete(spaProviderTimeOff)
      .where(eq(spaProviderTimeOff.id, timeOffId));

    // Return the deleted entry for audit
    return { result: existing, events: [] };
  });

  await auditLog(ctx, 'spa.provider.time_off_canceled', 'spa_provider_time_off', result.id);
  return result;
}
