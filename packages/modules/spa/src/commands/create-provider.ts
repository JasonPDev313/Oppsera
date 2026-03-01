import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaProviders } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import type { CreateProviderInput } from '../validation';

export async function createProvider(ctx: RequestContext, input: CreateProviderInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'createProvider',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Validate unique userId within tenant
    const [existingUser] = await tx
      .select({ id: spaProviders.id })
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.tenantId, ctx.tenantId),
          eq(spaProviders.userId, input.userId),
        ),
      )
      .limit(1);

    if (existingUser) {
      throw new AppError(
        'CONFLICT',
        `A provider with userId "${input.userId}" already exists for this tenant`,
        409,
      );
    }

    // Validate unique displayName within tenant
    const [existingName] = await tx
      .select({ id: spaProviders.id })
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.tenantId, ctx.tenantId),
          eq(spaProviders.displayName, input.displayName),
        ),
      )
      .limit(1);

    if (existingName) {
      throw new AppError(
        'VALIDATION_ERROR',
        `A provider with display name "${input.displayName}" already exists`,
        400,
      );
    }

    const [created] = await tx
      .insert(spaProviders)
      .values({
        tenantId: ctx.tenantId,
        userId: input.userId,
        displayName: input.displayName,
        bio: input.bio ?? null,
        photoUrl: input.photoUrl ?? null,
        specialties: input.specialties ?? null,
        certifications: input.certifications ?? null,
        hireDate: input.hireDate ?? null,
        employmentType: input.employmentType ?? 'full_time',
        isBookableOnline: input.isBookableOnline ?? true,
        acceptNewClients: input.acceptNewClients ?? true,
        maxDailyAppointments: input.maxDailyAppointments ?? null,
        breakDurationMinutes: input.breakDurationMinutes ?? 30,
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, SPA_EVENTS.PROVIDER_CREATED, {
      providerId: created!.id,
      userId: input.userId,
      displayName: input.displayName,
      employmentType: input.employmentType ?? 'full_time',
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'createProvider',
        created!,
      );
    }

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'spa.provider.created', 'spa_provider', result.id);
  return result;
}
