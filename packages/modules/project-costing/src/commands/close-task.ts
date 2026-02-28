import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { projectTasks } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function closeTask(ctx: RequestContext, taskId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.tenantId, ctx.tenantId), eq(projectTasks.id, taskId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Task not found', 404);
    }

    if (existing.status === 'closed') {
      throw new AppError('VALIDATION_ERROR', 'Task is already closed', 400);
    }

    const [updated] = await tx
      .update(projectTasks)
      .set({
        status: 'closed',
        updatedAt: new Date(),
      })
      .where(eq(projectTasks.id, taskId))
      .returning();

    const event = buildEventFromContext(ctx, 'project_costing.task.closed.v1', {
      taskId,
      projectId: existing.projectId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'project_costing.task.closed', 'project_task', taskId);
  return result;
}
