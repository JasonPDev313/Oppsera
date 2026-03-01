import { eq, and, ne } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError, NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaResources } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import type { UpdateResourceInput } from '../validation';

export async function updateResource(ctx: RequestContext, input: UpdateResourceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing resource
    const [existing] = await tx
      .select()
      .from(spaResources)
      .where(
        and(
          eq(spaResources.id, input.id),
          eq(spaResources.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Resource', input.id);
    }

    // If name or resourceType is changing, validate uniqueness
    const newName = input.name ?? existing.name;
    const newType = input.resourceType ?? existing.resourceType;
    const newLocationId = input.locationId !== undefined ? input.locationId : existing.locationId;

    if (newName !== existing.name || newType !== existing.resourceType || newLocationId !== existing.locationId) {
      const nameConditions = [
        eq(spaResources.tenantId, ctx.tenantId),
        eq(spaResources.name, newName),
        eq(spaResources.resourceType, newType),
        ne(spaResources.id, input.id),
      ];
      if (newLocationId) {
        nameConditions.push(eq(spaResources.locationId, newLocationId));
      }

      const [duplicate] = await tx
        .select({ id: spaResources.id })
        .from(spaResources)
        .where(and(...nameConditions))
        .limit(1);

      if (duplicate) {
        throw new AppError(
          'CONFLICT',
          `A ${newType} resource named "${newName}" already exists at this location`,
          409,
        );
      }
    }

    // Build update payload (only set fields that were provided)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.resourceType !== undefined) updates.resourceType = input.resourceType;
    if (input.description !== undefined) updates.description = input.description ?? null;
    if (input.capacity !== undefined) updates.capacity = input.capacity;
    if (input.locationId !== undefined) updates.locationId = input.locationId ?? null;
    if (input.bufferMinutes !== undefined) updates.bufferMinutes = input.bufferMinutes;
    if (input.cleanupMinutes !== undefined) updates.cleanupMinutes = input.cleanupMinutes;
    if (input.amenities !== undefined) updates.amenities = input.amenities ?? null;
    if (input.photoUrl !== undefined) updates.photoUrl = input.photoUrl ?? null;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

    const [updated] = await tx
      .update(spaResources)
      .set(updates)
      .where(
        and(
          eq(spaResources.id, input.id),
          eq(spaResources.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, SPA_EVENTS.RESOURCE_UPDATED, {
      resourceId: updated!.id,
      name: updated!.name,
      resourceType: updated!.resourceType,
      locationId: updated!.locationId,
      capacity: updated!.capacity,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.resource.updated', 'spa_resource', result.id);
  return result;
}
