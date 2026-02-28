import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { projects } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { z } from 'zod';
import type { createProjectSchema } from '../validation';

type CreateProjectInput = z.input<typeof createProjectSchema>;

export async function createProject(ctx: RequestContext, input: CreateProjectInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'createProject',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Generate project number: PJ-YYYYMMDD-XXXXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = generateUlid().slice(-6).toUpperCase();
    const projectNumber = `PJ-${dateStr}-${suffix}`;

    const [created] = await tx
      .insert(projects)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId ?? ctx.locationId ?? null,
        projectNumber,
        name: input.name,
        description: input.description ?? null,
        projectType: input.projectType ?? null,
        customerId: input.customerId ?? null,
        managerUserId: input.managerUserId ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        budgetAmount: input.budgetAmount ?? null,
        budgetLaborHours: input.budgetLaborHours ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? {},
        createdBy: ctx.user.id,
        clientRequestId: input.clientRequestId ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'project_costing.project.created.v1', {
      projectId: created!.id,
      projectNumber,
      name: input.name,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'createProject',
        created!,
      );
    }

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'project_costing.project.created', 'project', result.id);
  return result;
}
