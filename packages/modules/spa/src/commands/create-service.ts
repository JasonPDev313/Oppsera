import { eq, and, sql, isNull } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaServices, spaServiceCategories } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { createServiceSchema } from '../validation';
import type { CreateServiceInput } from '../validation';

export async function createService(ctx: RequestContext, input: CreateServiceInput) {
  const parsed = createServiceSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, parsed.clientRequestId, 'createService');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Validate category exists if provided
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

    // Validate unique name within tenant (among active services)
    const [existingName] = await tx
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

    if (existingName) {
      throw new AppError('VALIDATION_ERROR', `Service "${parsed.name}" already exists`, 400);
    }

    // Compute sort order: max + 1 if not provided
    let sortOrder = parsed.sortOrder;
    if (sortOrder === 0) {
      const [maxRow] = await tx
        .select({ maxSort: sql<number>`COALESCE(MAX(${spaServices.sortOrder}), 0)` })
        .from(spaServices)
        .where(eq(spaServices.tenantId, ctx.tenantId));

      sortOrder = (maxRow?.maxSort ?? 0) + 1;
    }

    const [created] = await tx
      .insert(spaServices)
      .values({
        tenantId: ctx.tenantId,
        categoryId: parsed.categoryId ?? null,
        name: parsed.name,
        displayName: parsed.displayName ?? null,
        description: parsed.description ?? null,
        category: parsed.category,
        durationMinutes: parsed.durationMinutes,
        bufferMinutes: parsed.bufferMinutes,
        cleanupMinutes: parsed.cleanupMinutes,
        setupMinutes: parsed.setupMinutes,
        price: parsed.price,
        memberPrice: parsed.memberPrice ?? null,
        peakPrice: parsed.peakPrice ?? null,
        cost: parsed.cost ?? null,
        maxCapacity: parsed.maxCapacity,
        isCouples: parsed.isCouples,
        isGroup: parsed.isGroup,
        minGroupSize: parsed.minGroupSize ?? null,
        maxGroupSize: parsed.maxGroupSize ?? null,
        requiresIntake: parsed.requiresIntake,
        requiresConsent: parsed.requiresConsent,
        contraindications: parsed.contraindications ?? null,
        preparationInstructions: parsed.preparationInstructions ?? null,
        aftercareInstructions: parsed.aftercareInstructions ?? null,
        catalogItemId: parsed.catalogItemId ?? null,
        imageUrl: parsed.imageUrl ?? null,
        sortOrder,
        createdBy: ctx.user.id,
      })
      .returning();

    // Save idempotency key inside the same transaction
    await saveIdempotencyKey(tx, ctx.tenantId, parsed.clientRequestId, 'createService', created!);

    const event = buildEventFromContext(
      ctx,
      SPA_EVENTS.SERVICE_CREATED,
      {
        serviceId: created!.id,
        name: created!.name,
        category: created!.category,
        categoryId: created!.categoryId,
        durationMinutes: created!.durationMinutes,
        price: created!.price,
      },
    );

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'spa.service.created', 'spa_service', result.id);

  return result;
}
