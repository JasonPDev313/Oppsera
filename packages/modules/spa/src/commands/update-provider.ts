import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaProviders } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import type { UpdateProviderInput } from '../validation';

export async function updateProvider(ctx: RequestContext, input: UpdateProviderInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing provider
    const [existing] = await tx
      .select()
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.id, input.id),
          eq(spaProviders.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Provider not found: ${input.id}`, 404);
    }

    // If displayName changed, validate uniqueness
    if (input.displayName !== undefined && input.displayName !== existing.displayName) {
      const [nameConflict] = await tx
        .select({ id: spaProviders.id })
        .from(spaProviders)
        .where(
          and(
            eq(spaProviders.tenantId, ctx.tenantId),
            eq(spaProviders.displayName, input.displayName),
          ),
        )
        .limit(1);

      if (nameConflict && nameConflict.id !== input.id) {
        throw new AppError(
          'VALIDATION_ERROR',
          `A provider with display name "${input.displayName}" already exists`,
          400,
        );
      }
    }

    // Build update fields — only set explicitly provided values
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) updateFields.displayName = input.displayName;
    if (input.bio !== undefined) updateFields.bio = input.bio;
    if (input.photoUrl !== undefined) updateFields.photoUrl = input.photoUrl;
    if (input.specialties !== undefined) updateFields.specialties = input.specialties;
    if (input.certifications !== undefined) updateFields.certifications = input.certifications;
    if (input.hireDate !== undefined) updateFields.hireDate = input.hireDate;
    if (input.employmentType !== undefined) updateFields.employmentType = input.employmentType;
    if (input.isBookableOnline !== undefined) updateFields.isBookableOnline = input.isBookableOnline;
    if (input.acceptNewClients !== undefined) updateFields.acceptNewClients = input.acceptNewClients;
    if (input.maxDailyAppointments !== undefined) updateFields.maxDailyAppointments = input.maxDailyAppointments;
    if (input.breakDurationMinutes !== undefined) updateFields.breakDurationMinutes = input.breakDurationMinutes;
    if (input.color !== undefined) updateFields.color = input.color;
    if (input.sortOrder !== undefined) updateFields.sortOrder = input.sortOrder;

    const [updated] = await tx
      .update(spaProviders)
      .set(updateFields)
      .where(eq(spaProviders.id, input.id))
      .returning();

    const event = buildEventFromContext(ctx, SPA_EVENTS.PROVIDER_UPDATED, {
      providerId: updated!.id,
      displayName: updated!.displayName,
      changedFields: Object.keys(updateFields).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.provider.updated', 'spa_provider', result.id);
  return result;
}
