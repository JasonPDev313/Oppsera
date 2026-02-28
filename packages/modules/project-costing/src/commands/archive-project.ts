import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { projects } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { archiveProjectSchema } from '../validation';

type ArchiveProjectInput = z.input<typeof archiveProjectSchema>;

export async function archiveProject(
  ctx: RequestContext,
  projectId: string,
  input: ArchiveProjectInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, ctx.tenantId), eq(projects.id, projectId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    if (existing.archivedAt) {
      throw new AppError('VALIDATION_ERROR', 'Project is already archived', 400);
    }

    const [updated] = await tx
      .update(projects)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        archivedBy: ctx.user.id,
        archivedReason: input.reason ?? null,
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(eq(projects.id, projectId))
      .returning();

    const event = buildEventFromContext(ctx, 'project_costing.project.archived.v1', {
      projectId,
      reason: input.reason,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'project_costing.project.archived', 'project', projectId);
  return result;
}

export async function unarchiveProject(ctx: RequestContext, projectId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, ctx.tenantId), eq(projects.id, projectId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    if (!existing.archivedAt) {
      throw new AppError('VALIDATION_ERROR', 'Project is not archived', 400);
    }

    const [updated] = await tx
      .update(projects)
      .set({
        status: 'active',
        archivedAt: null,
        archivedBy: null,
        archivedReason: null,
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(eq(projects.id, projectId))
      .returning();

    const event = buildEventFromContext(ctx, 'project_costing.project.unarchived.v1', {
      projectId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'project_costing.project.unarchived', 'project', projectId);
  return result;
}
