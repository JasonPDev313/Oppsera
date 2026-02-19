import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { dashboardDefinitions } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import type { DashboardTile } from '../compiler';

export interface SaveDashboardInput {
  id?: string;
  name: string;
  description?: string;
  tiles: DashboardTile[];
  isDefault?: boolean;
}

export async function saveDashboard(ctx: RequestContext, input: SaveDashboardInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate all tile reportId references exist
    if (input.tiles.length > 0) {
      const reportIds = [...new Set(input.tiles.map((t) => t.reportId))];
      const idList = sql.join(reportIds.map((id) => sql`${id}`), sql`, `);
      const existingReports = await (tx as any).execute(
        sql`SELECT id FROM report_definitions WHERE tenant_id = ${ctx.tenantId} AND id IN (${idList}) AND is_archived = false`
      );
      const existingIds = new Set(
        Array.from(existingReports as Iterable<{ id: string }>).map((r) => r.id)
      );
      for (const rid of reportIds) {
        if (!existingIds.has(rid)) {
          throw new ValidationError(`Report "${rid}" not found or archived`);
        }
      }
    }

    if (input.id) {
      // Update
      const [existing] = await (tx as any).select().from(dashboardDefinitions)
        .where(and(
          eq(dashboardDefinitions.id, input.id),
          eq(dashboardDefinitions.tenantId, ctx.tenantId),
        ))
        .limit(1);

      if (!existing) throw new NotFoundError('Dashboard not found');
      if (existing.isArchived) throw new ValidationError('Cannot update an archived dashboard');

      const [updated] = await (tx as any).update(dashboardDefinitions)
        .set({
          name: input.name,
          description: input.description ?? null,
          tiles: input.tiles,
          isDefault: input.isDefault ?? false,
          updatedAt: new Date(),
        })
        .where(eq(dashboardDefinitions.id, input.id))
        .returning();

      const event = buildEventFromContext(ctx, 'reporting.dashboard.saved.v1', {
        dashboardId: updated!.id,
        name: updated!.name,
        action: 'updated',
      });
      return { result: updated!, events: [event] };
    } else {
      // Create
      const [created] = await (tx as any).insert(dashboardDefinitions).values({
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        tiles: input.tiles,
        isDefault: input.isDefault ?? false,
        createdBy: ctx.user.id,
      }).returning();

      const event = buildEventFromContext(ctx, 'reporting.dashboard.saved.v1', {
        dashboardId: created!.id,
        name: created!.name,
        action: 'created',
      });
      return { result: created!, events: [event] };
    }
  });

  await auditLog(ctx, 'reporting.dashboard.saved', 'dashboard_definition', result.id);
  return result;
}
