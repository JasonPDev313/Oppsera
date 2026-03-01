import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaResources } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import type { CreateResourceInput } from '../validation';

export async function createResource(ctx: RequestContext, input: CreateResourceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'createResource',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Validate unique name + resourceType within tenant + location
    const nameConditions = [
      eq(spaResources.tenantId, ctx.tenantId),
      eq(spaResources.name, input.name),
      eq(spaResources.resourceType, input.resourceType),
    ];
    if (input.locationId) {
      nameConditions.push(eq(spaResources.locationId, input.locationId));
    }

    const [existingName] = await tx
      .select({ id: spaResources.id })
      .from(spaResources)
      .where(and(...nameConditions))
      .limit(1);

    if (existingName) {
      throw new AppError(
        'CONFLICT',
        `A ${input.resourceType} resource named "${input.name}" already exists at this location`,
        409,
      );
    }

    const [created] = await tx
      .insert(spaResources)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        resourceType: input.resourceType,
        description: input.description ?? null,
        capacity: input.capacity ?? 1,
        locationId: input.locationId ?? null,
        bufferMinutes: input.bufferMinutes ?? 0,
        cleanupMinutes: input.cleanupMinutes ?? 0,
        amenities: input.amenities ?? null,
        photoUrl: input.photoUrl ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, SPA_EVENTS.RESOURCE_CREATED, {
      resourceId: created!.id,
      name: input.name,
      resourceType: input.resourceType,
      locationId: input.locationId ?? null,
      capacity: input.capacity ?? 1,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'createResource',
        created!,
      );
    }

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'spa.resource.created', 'spa_resource', result.id);
  return result;
}
