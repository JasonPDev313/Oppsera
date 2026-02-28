import { eq, and, count } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { projects, projectTasks } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { createTaskSchema } from '../validation';

type CreateTaskInput = z.input<typeof createTaskSchema>;

export async function createTask(
  ctx: RequestContext,
  projectId: string,
  input: CreateTaskInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify project exists and is active
    const [project] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, ctx.tenantId), eq(projects.id, projectId)));

    if (!project) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    if (project.status === 'closed') {
      throw new AppError('VALIDATION_ERROR', 'Cannot add tasks to a closed project', 400);
    }

    // Auto-generate task number
    const countResult = await tx
      .select({ value: count() })
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId));

    const taskCount = countResult[0]?.value ?? 0;
    const taskNumber = `T${String(taskCount + 1).padStart(3, '0')}`;

    const [created] = await tx
      .insert(projectTasks)
      .values({
        tenantId: ctx.tenantId,
        projectId,
        taskNumber,
        name: input.name,
        description: input.description ?? null,
        budgetAmount: input.budgetAmount ?? null,
        budgetHours: input.budgetHours ?? null,
        glExpenseAccountId: input.glExpenseAccountId ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'project_costing.task.created.v1', {
      projectId,
      taskId: created!.id,
      taskNumber,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'project_costing.task.created', 'project_task', result.id);
  return result;
}
