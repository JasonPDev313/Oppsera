import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaServiceResourceRequirements, spaServices, spaResources } from '@oppsera/db';

interface AddResourceRequirementInput {
  serviceId: string;
  resourceId?: string;
  resourceType?: string;
  quantity?: number;
  isMandatory?: boolean;
}

interface RemoveResourceRequirementInput {
  requirementId: string;
}

/**
 * Adds a resource requirement to a service.
 * Either a specific resource (resourceId) or a resource type (resourceType) must be provided.
 */
export async function addResourceRequirement(ctx: RequestContext, input: AddResourceRequirementInput) {
  if (!input.resourceId && !input.resourceType) {
    throw new AppError('VALIDATION_ERROR', 'Either resourceId or resourceType is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate service exists
    const [service] = await tx
      .select({ id: spaServices.id })
      .from(spaServices)
      .where(
        and(
          eq(spaServices.id, input.serviceId),
          eq(spaServices.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!service) {
      throw new AppError('NOT_FOUND', `Service not found: ${input.serviceId}`, 404);
    }

    // Validate specific resource exists if provided
    if (input.resourceId) {
      const [resource] = await tx
        .select({ id: spaResources.id })
        .from(spaResources)
        .where(
          and(
            eq(spaResources.id, input.resourceId),
            eq(spaResources.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!resource) {
        throw new AppError('NOT_FOUND', `Resource not found: ${input.resourceId}`, 404);
      }
    }

    const [created] = await tx
      .insert(spaServiceResourceRequirements)
      .values({
        tenantId: ctx.tenantId,
        serviceId: input.serviceId,
        resourceId: input.resourceId ?? null,
        resourceType: input.resourceType ?? null,
        quantity: input.quantity ?? 1,
        isMandatory: input.isMandatory ?? true,
      })
      .returning();

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'spa.service_resource_requirement.added', 'spa_service_resource_requirement', result.id);

  return result;
}

/**
 * Removes a resource requirement from a service.
 */
export async function removeResourceRequirement(ctx: RequestContext, input: RemoveResourceRequirementInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaServiceResourceRequirements)
      .where(
        and(
          eq(spaServiceResourceRequirements.id, input.requirementId),
          eq(spaServiceResourceRequirements.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Resource requirement not found: ${input.requirementId}`, 404);
    }

    await tx
      .delete(spaServiceResourceRequirements)
      .where(eq(spaServiceResourceRequirements.id, input.requirementId));

    return { result: existing, events: [] };
  });

  await auditLog(ctx, 'spa.service_resource_requirement.removed', 'spa_service_resource_requirement', result.id);

  return result;
}
