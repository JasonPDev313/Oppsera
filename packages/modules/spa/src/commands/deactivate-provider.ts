import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaProviders } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';

export async function deactivateProvider(ctx: RequestContext, providerId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing provider
    const [existing] = await tx
      .select({
        id: spaProviders.id,
        isActive: spaProviders.isActive,
        displayName: spaProviders.displayName,
        userId: spaProviders.userId,
      })
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.id, providerId),
          eq(spaProviders.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Provider not found: ${providerId}`, 404);
    }

    if (!existing.isActive) {
      throw new AppError('VALIDATION_ERROR', 'Provider is already deactivated', 400);
    }

    const [updated] = await tx
      .update(spaProviders)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(spaProviders.id, providerId))
      .returning();

    const event = buildEventFromContext(ctx, SPA_EVENTS.PROVIDER_DEACTIVATED, {
      providerId: updated!.id,
      displayName: updated!.displayName,
      userId: updated!.userId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.provider.deactivated', 'spa_provider', result.id);
  return result;
}
