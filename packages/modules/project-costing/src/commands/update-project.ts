import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { projects } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { updateProjectSchema } from '../validation';

type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export async function updateProject(
  ctx: RequestContext,
  projectId: string,
  input: UpdateProjectInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, ctx.tenantId), eq(projects.id, projectId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    if (existing.status === 'closed') {
      throw new AppError('VALIDATION_ERROR', 'Cannot update a closed project', 400);
    }

    if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
      throw new AppError('CONFLICT', 'Project has been modified by another user', 409);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.projectType !== undefined) updates.projectType = input.projectType;
    if (input.customerId !== undefined) updates.customerId = input.customerId;
    if (input.managerUserId !== undefined) updates.managerUserId = input.managerUserId;
    if (input.startDate !== undefined) updates.startDate = input.startDate;
    if (input.endDate !== undefined) updates.endDate = input.endDate;
    if (input.budgetAmount !== undefined) updates.budgetAmount = input.budgetAmount;
    if (input.budgetLaborHours !== undefined) updates.budgetLaborHours = input.budgetLaborHours;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.metadata !== undefined) updates.metadata = input.metadata;
    updates.version = existing.version + 1;

    const [updated] = await tx
      .update(projects)
      .set(updates)
      .where(eq(projects.id, projectId))
      .returning();

    const event = buildEventFromContext(ctx, 'project_costing.project.updated.v1', {
      projectId,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt' && k !== 'version'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'project_costing.project.updated', 'project', projectId);
  return result;
}
