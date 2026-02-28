import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { projectTasks } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { updateTaskSchema } from '../validation';

type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export async function updateTask(
  ctx: RequestContext,
  taskId: string,
  input: UpdateTaskInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.tenantId, ctx.tenantId), eq(projectTasks.id, taskId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Task not found', 404);
    }

    if (existing.status === 'closed') {
      throw new AppError('VALIDATION_ERROR', 'Cannot update a closed task', 400);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.budgetAmount !== undefined) updates.budgetAmount = input.budgetAmount;
    if (input.budgetHours !== undefined) updates.budgetHours = input.budgetHours;
    if (input.glExpenseAccountId !== undefined) updates.glExpenseAccountId = input.glExpenseAccountId;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

    const [updated] = await tx
      .update(projectTasks)
      .set(updates)
      .where(eq(projectTasks.id, taskId))
      .returning();

    const event = buildEventFromContext(ctx, 'project_costing.task.updated.v1', {
      taskId,
      projectId: existing.projectId,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'project_costing.task.updated', 'project_task', taskId);
  return result;
}
