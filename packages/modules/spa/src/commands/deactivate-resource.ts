import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaResources } from '@oppsera/db';

export async function deactivateResource(ctx: RequestContext, resourceId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing resource
    const [existing] = await tx
      .select({
        id: spaResources.id,
        name: spaResources.name,
        isActive: spaResources.isActive,
      })
      .from(spaResources)
      .where(
        and(
          eq(spaResources.id, resourceId),
          eq(spaResources.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Resource', resourceId);
    }

    if (!existing.isActive) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Resource "${existing.name}" is already inactive`,
        400,
      );
    }

    const [updated] = await tx
      .update(spaResources)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaResources.id, resourceId),
          eq(spaResources.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    // Deactivation is a config change — no domain event emitted
    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.resource.deactivated', 'spa_resource', result.id);
  return result;
}
