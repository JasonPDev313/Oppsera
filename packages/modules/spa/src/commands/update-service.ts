import { eq, and, isNull } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaServices, spaServiceCategories } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { updateServiceSchema } from '../validation';
import type { UpdateServiceInput } from '../validation';

export async function updateService(ctx: RequestContext, input: UpdateServiceInput) {
  const parsed = updateServiceSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate service exists
    const [existing] = await tx
      .select()
      .from(spaServices)
      .where(
        and(
          eq(spaServices.id, parsed.id),
          eq(spaServices.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Service not found: ${parsed.id}`, 404);
    }

    if (existing.archivedAt) {
      throw new AppError('VALIDATION_ERROR', 'Cannot update an archived service', 400);
    }

    // Validate category if changed
    if (parsed.categoryId !== undefined && parsed.categoryId !== existing.categoryId) {
      if (parsed.categoryId) {
        const [cat] = await tx
          .select({ id: spaServiceCategories.id })
          .from(spaServiceCategories)
          .where(
            and(
              eq(spaServiceCategories.id, parsed.categoryId),
              eq(spaServiceCategories.tenantId, ctx.tenantId),
            ),
          )
          .limit(1);

        if (!cat) {
          throw new AppError('NOT_FOUND', `Service category not found: ${parsed.categoryId}`, 404);
        }
      }
    }

    // Validate name uniqueness if name changed
    if (parsed.name !== undefined && parsed.name !== existing.name) {
      const [duplicate] = await tx
        .select({ id: spaServices.id })
        .from(spaServices)
        .where(
          and(
            eq(spaServices.tenantId, ctx.tenantId),
            eq(spaServices.name, parsed.name),
            isNull(spaServices.archivedAt),
          ),
        )
        .limit(1);

      if (duplicate && duplicate.id !== parsed.id) {
        throw new AppError('VALIDATION_ERROR', `Service "${parsed.name}" already exists`, 400);
      }
    }

    // Build update set — only include fields that were provided
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.categoryId !== undefined) updateSet.categoryId = parsed.categoryId ?? null;
    if (parsed.name !== undefined) updateSet.name = parsed.name;
    if (parsed.displayName !== undefined) updateSet.displayName = parsed.displayName ?? null;
    if (parsed.description !== undefined) updateSet.description = parsed.description ?? null;
    if (parsed.category !== undefined) updateSet.category = parsed.category;
    if (parsed.durationMinutes !== undefined) updateSet.durationMinutes = parsed.durationMinutes;
    if (parsed.bufferMinutes !== undefined) updateSet.bufferMinutes = parsed.bufferMinutes;
    if (parsed.cleanupMinutes !== undefined) updateSet.cleanupMinutes = parsed.cleanupMinutes;
    if (parsed.setupMinutes !== undefined) updateSet.setupMinutes = parsed.setupMinutes;
    if (parsed.price !== undefined) updateSet.price = parsed.price;
    if (parsed.memberPrice !== undefined) updateSet.memberPrice = parsed.memberPrice ?? null;
    if (parsed.peakPrice !== undefined) updateSet.peakPrice = parsed.peakPrice ?? null;
    if (parsed.cost !== undefined) updateSet.cost = parsed.cost ?? null;
    if (parsed.maxCapacity !== undefined) updateSet.maxCapacity = parsed.maxCapacity;
    if (parsed.isCouples !== undefined) updateSet.isCouples = parsed.isCouples;
    if (parsed.isGroup !== undefined) updateSet.isGroup = parsed.isGroup;
    if (parsed.minGroupSize !== undefined) updateSet.minGroupSize = parsed.minGroupSize ?? null;
    if (parsed.maxGroupSize !== undefined) updateSet.maxGroupSize = parsed.maxGroupSize ?? null;
    if (parsed.requiresIntake !== undefined) updateSet.requiresIntake = parsed.requiresIntake;
    if (parsed.requiresConsent !== undefined) updateSet.requiresConsent = parsed.requiresConsent;
    if (parsed.contraindications !== undefined) updateSet.contraindications = parsed.contraindications ?? null;
    if (parsed.preparationInstructions !== undefined) updateSet.preparationInstructions = parsed.preparationInstructions ?? null;
    if (parsed.aftercareInstructions !== undefined) updateSet.aftercareInstructions = parsed.aftercareInstructions ?? null;
    if (parsed.catalogItemId !== undefined) updateSet.catalogItemId = parsed.catalogItemId ?? null;
    if (parsed.imageUrl !== undefined) updateSet.imageUrl = parsed.imageUrl ?? null;
    if (parsed.sortOrder !== undefined) updateSet.sortOrder = parsed.sortOrder;

    const [updated] = await tx
      .update(spaServices)
      .set(updateSet)
      .where(eq(spaServices.id, parsed.id))
      .returning();

    const event = buildEventFromContext(
      ctx,
      SPA_EVENTS.SERVICE_UPDATED,
      {
        serviceId: updated!.id,
        name: updated!.name,
        category: updated!.category,
        categoryId: updated!.categoryId,
        durationMinutes: updated!.durationMinutes,
        price: updated!.price,
      },
    );

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.service.updated', 'spa_service', result.id);

  return result;
}
