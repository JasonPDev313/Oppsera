import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaServices } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';

interface ArchiveServiceInput {
  id: string;
  reason?: string;
}

export async function archiveService(ctx: RequestContext, input: ArchiveServiceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaServices)
      .where(
        and(
          eq(spaServices.id, input.id),
          eq(spaServices.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Service not found: ${input.id}`, 404);
    }

    // Idempotent: already archived, return as-is
    if (existing.archivedAt) {
      return { result: existing, events: [] };
    }

    const [updated] = await tx
      .update(spaServices)
      .set({
        archivedAt: new Date(),
        archivedBy: ctx.user.id,
        archivedReason: input.reason ?? null,
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(spaServices.id, input.id))
      .returning();

    const event = buildEventFromContext(
      ctx,
      SPA_EVENTS.SERVICE_ARCHIVED,
      {
        serviceId: updated!.id,
        name: updated!.name,
        category: updated!.category,
        reason: input.reason ?? null,
      },
    );

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.service.archived', 'spa_service', result.id);

  return result;
}
