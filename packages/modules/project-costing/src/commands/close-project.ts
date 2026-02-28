import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { projects } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function closeProject(ctx: RequestContext, projectId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, ctx.tenantId), eq(projects.id, projectId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    if (existing.status === 'closed') {
      throw new AppError('VALIDATION_ERROR', 'Project is already closed', 400);
    }

    if (existing.status === 'archived') {
      throw new AppError('VALIDATION_ERROR', 'Cannot close an archived project', 400);
    }

    const [updated] = await tx
      .update(projects)
      .set({
        status: 'closed',
        completionDate: new Date().toISOString().slice(0, 10),
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(eq(projects.id, projectId))
      .returning();

    const event = buildEventFromContext(ctx, 'project_costing.project.closed.v1', {
      projectId,
      completionDate: updated!.completionDate,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'project_costing.project.closed', 'project', projectId);
  return result;
}
