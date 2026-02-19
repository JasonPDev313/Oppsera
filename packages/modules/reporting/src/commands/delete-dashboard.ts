import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { dashboardDefinitions } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export async function deleteDashboard(ctx: RequestContext, dashboardId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(dashboardDefinitions)
      .where(and(
        eq(dashboardDefinitions.id, dashboardId),
        eq(dashboardDefinitions.tenantId, ctx.tenantId),
      ))
      .limit(1);

    if (!existing) throw new NotFoundError('Dashboard not found');
    if (existing.isArchived) throw new ValidationError('Dashboard is already archived');

    const [updated] = await (tx as any).update(dashboardDefinitions)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(dashboardDefinitions.id, dashboardId))
      .returning();

    const event = buildEventFromContext(ctx, 'reporting.dashboard.archived.v1', {
      dashboardId: updated!.id,
      name: updated!.name,
    });
    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'reporting.dashboard.archived', 'dashboard_definition', result.id);
  return result;
}
