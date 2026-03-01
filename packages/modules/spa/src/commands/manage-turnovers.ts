import { eq, and } from 'drizzle-orm';
import { spaRoomTurnoverTasks, spaResources } from '@oppsera/db';
import {
  publishWithOutbox,
  checkIdempotency,
  saveIdempotencyKey,
  buildEventFromContext,
  type RequestContext,
} from '@oppsera/core';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const checklistItemSchema = z.object({
  item: z.string().min(1),
  completed: z.boolean(),
});

const taskTypeSchema = z.enum(['cleanup', 'setup', 'inspection', 'restock']);

export const createTurnoverTaskSchema = z.object({
  clientRequestId: z.string().optional(),
  resourceId: z.string().min(1),
  appointmentId: z.string().optional(),
  taskType: taskTypeSchema,
  assignedTo: z.string().optional(),
  dueAt: z.string().min(1), // ISO 8601 timestamp
  notes: z.string().optional(),
  checklist: z.array(checklistItemSchema).optional(),
});

export const updateTurnoverTaskSchema = z.object({
  clientRequestId: z.string().optional(),
  taskId: z.string().min(1),
  assignedTo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  checklist: z.array(checklistItemSchema).optional(),
});

export const startTurnoverTaskSchema = z.object({
  clientRequestId: z.string().optional(),
  taskId: z.string().min(1),
});

export const completeTurnoverTaskSchema = z.object({
  clientRequestId: z.string().optional(),
  taskId: z.string().min(1),
  checklist: z.array(checklistItemSchema).optional(),
  notes: z.string().optional(),
});

export const skipTurnoverTaskSchema = z.object({
  clientRequestId: z.string().optional(),
  taskId: z.string().min(1),
  reason: z.string().min(1),
});

export const autoCreateTurnoverTasksSchema = z.object({
  clientRequestId: z.string().optional(),
  appointmentId: z.string().min(1),
  resourceId: z.string().min(1),
  previousEndTime: z.string().min(1), // ISO 8601 timestamp
  nextStartTime: z.string().optional(), // ISO 8601 timestamp
  cleanupMinutes: z.number().int().min(0),
  setupMinutes: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateTurnoverTaskInput = z.input<typeof createTurnoverTaskSchema>;
export type UpdateTurnoverTaskInput = z.input<typeof updateTurnoverTaskSchema>;
export type StartTurnoverTaskInput = z.input<typeof startTurnoverTaskSchema>;
export type CompleteTurnoverTaskInput = z.input<typeof completeTurnoverTaskSchema>;
export type SkipTurnoverTaskInput = z.input<typeof skipTurnoverTaskSchema>;
export type AutoCreateTurnoverTasksInput = z.input<typeof autoCreateTurnoverTasksSchema>;

// ---------------------------------------------------------------------------
// Event type constants (inline if not yet exported from events/types.ts)
// ---------------------------------------------------------------------------

const SPA_TURNOVER_TASK_CREATED = 'spa.turnover_task.created.v1';
const SPA_TURNOVER_TASK_COMPLETED = 'spa.turnover_task.completed.v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchTaskForMutation(
  tx: Parameters<Parameters<typeof publishWithOutbox>[1]>[0],
  tenantId: string,
  taskId: string,
  allowedStatuses?: string[],
) {
  const rows = await tx
    .select()
    .from(spaRoomTurnoverTasks)
    .where(
      and(
        eq(spaRoomTurnoverTasks.tenantId, tenantId),
        eq(spaRoomTurnoverTasks.id, taskId),
      ),
    )
    .limit(1);

  const task = rows[0];
  if (!task) {
    throw Object.assign(new Error(`Turnover task not found: ${taskId}`), {
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  }

  if (allowedStatuses && !allowedStatuses.includes(task.status)) {
    throw Object.assign(
      new Error(
        `Turnover task ${taskId} is in status '${task.status}', expected one of: ${allowedStatuses.join(', ')}`,
      ),
      { code: 'INVALID_STATUS', statusCode: 409 },
    );
  }

  return task;
}

async function validateResourceExists(
  tx: Parameters<Parameters<typeof publishWithOutbox>[1]>[0],
  tenantId: string,
  resourceId: string,
) {
  const rows = await tx
    .select({ id: spaResources.id })
    .from(spaResources)
    .where(
      and(
        eq(spaResources.tenantId, tenantId),
        eq(spaResources.id, resourceId),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw Object.assign(new Error(`Resource not found: ${resourceId}`), {
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Create a manual turnover task for a resource.
 */
export async function createTurnoverTask(
  ctx: RequestContext,
  input: CreateTurnoverTaskInput,
) {
  const validated = createTurnoverTaskSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check inside the transaction
    if (validated.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'createTurnoverTask',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Validate resource exists
    await validateResourceExists(tx, ctx.tenantId, validated.resourceId);

    const now = new Date();
    const [created] = await tx
      .insert(spaRoomTurnoverTasks)
      .values({
        tenantId: ctx.tenantId,
        resourceId: validated.resourceId,
        appointmentId: validated.appointmentId ?? null,
        taskType: validated.taskType,
        assignedTo: validated.assignedTo ?? null,
        status: 'pending',
        dueAt: new Date(validated.dueAt),
        notes: validated.notes ?? null,
        checklist: validated.checklist ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, SPA_TURNOVER_TASK_CREATED, {
      taskId: created!.id,
      resourceId: created!.resourceId,
      appointmentId: created!.appointmentId,
      taskType: created!.taskType,
      assignedTo: created!.assignedTo,
      dueAt: created!.dueAt.toISOString(),
    });

    // Save idempotency key inside the same transaction
    if (validated.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'createTurnoverTask',
        created!,
      );
    }

    return { result: created!, events: [event] };
  });

  return result;
}

/**
 * Update task details (assignedTo, notes, checklist).
 */
export async function updateTurnoverTask(
  ctx: RequestContext,
  input: UpdateTurnoverTaskInput,
) {
  const validated = updateTurnoverTaskSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    if (validated.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'updateTurnoverTask',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Fetch task — allow updates on pending or in_progress tasks
    await fetchTaskForMutation(tx, ctx.tenantId, validated.taskId, [
      'pending',
      'in_progress',
    ]);

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (validated.assignedTo !== undefined) {
      updates.assignedTo = validated.assignedTo;
    }
    if (validated.notes !== undefined) {
      updates.notes = validated.notes;
    }
    if (validated.checklist !== undefined) {
      updates.checklist = validated.checklist;
    }

    const [updated] = await tx
      .update(spaRoomTurnoverTasks)
      .set(updates)
      .where(
        and(
          eq(spaRoomTurnoverTasks.tenantId, ctx.tenantId),
          eq(spaRoomTurnoverTasks.id, validated.taskId),
        ),
      )
      .returning();

    if (validated.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'updateTurnoverTask',
        updated!,
      );
    }

    return { result: updated!, events: [] };
  });

  return result;
}

/**
 * Move task to in_progress.
 */
export async function startTurnoverTask(
  ctx: RequestContext,
  input: StartTurnoverTaskInput,
) {
  const validated = startTurnoverTaskSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    if (validated.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'startTurnoverTask',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Only pending tasks can be started
    await fetchTaskForMutation(tx, ctx.tenantId, validated.taskId, ['pending']);

    const [updated] = await tx
      .update(spaRoomTurnoverTasks)
      .set({
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaRoomTurnoverTasks.tenantId, ctx.tenantId),
          eq(spaRoomTurnoverTasks.id, validated.taskId),
        ),
      )
      .returning();

    if (validated.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'startTurnoverTask',
        updated!,
      );
    }

    return { result: updated!, events: [] };
  });

  return result;
}

/**
 * Mark task as completed.
 */
export async function completeTurnoverTask(
  ctx: RequestContext,
  input: CompleteTurnoverTaskInput,
) {
  const validated = completeTurnoverTaskSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    if (validated.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'completeTurnoverTask',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Allow completing from pending or in_progress
    const _task = await fetchTaskForMutation(tx, ctx.tenantId, validated.taskId, [
      'pending',
      'in_progress',
    ]);

    const now = new Date();

    const updates: Record<string, unknown> = {
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    };

    // Allow updating checklist and notes at completion time
    if (validated.checklist !== undefined) {
      updates.checklist = validated.checklist;
    }
    if (validated.notes !== undefined) {
      updates.notes = validated.notes;
    }

    const [updated] = await tx
      .update(spaRoomTurnoverTasks)
      .set(updates)
      .where(
        and(
          eq(spaRoomTurnoverTasks.tenantId, ctx.tenantId),
          eq(spaRoomTurnoverTasks.id, validated.taskId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, SPA_TURNOVER_TASK_COMPLETED, {
      taskId: updated!.id,
      resourceId: updated!.resourceId,
      appointmentId: updated!.appointmentId,
      taskType: updated!.taskType,
      completedAt: now.toISOString(),
      assignedTo: updated!.assignedTo,
    });

    if (validated.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'completeTurnoverTask',
        updated!,
      );
    }

    return { result: updated!, events: [event] };
  });

  return result;
}

/**
 * Skip a task with reason.
 */
export async function skipTurnoverTask(
  ctx: RequestContext,
  input: SkipTurnoverTaskInput,
) {
  const validated = skipTurnoverTaskSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    if (validated.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'skipTurnoverTask',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Only pending or in_progress tasks can be skipped
    await fetchTaskForMutation(tx, ctx.tenantId, validated.taskId, [
      'pending',
      'in_progress',
    ]);

    const [updated] = await tx
      .update(spaRoomTurnoverTasks)
      .set({
        status: 'skipped',
        notes: validated.reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaRoomTurnoverTasks.tenantId, ctx.tenantId),
          eq(spaRoomTurnoverTasks.id, validated.taskId),
        ),
      )
      .returning();

    if (validated.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'skipTurnoverTask',
        updated!,
      );
    }

    return { result: updated!, events: [] };
  });

  return result;
}

/**
 * Automatically create cleanup + setup tasks when an appointment finishes.
 *
 * Creates up to two tasks:
 * - A "cleanup" task due immediately after the appointment ends
 * - A "setup" task due after cleanup completes (before the next appointment)
 *
 * If cleanupMinutes or setupMinutes is 0, that task is skipped.
 */
export async function autoCreateTurnoverTasks(
  ctx: RequestContext,
  input: AutoCreateTurnoverTasksInput,
) {
  const validated = autoCreateTurnoverTasksSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    if (validated.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'autoCreateTurnoverTasks',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Validate resource exists
    await validateResourceExists(tx, ctx.tenantId, validated.resourceId);

    const previousEnd = new Date(validated.previousEndTime);
    const now = new Date();
    const createdTasks: Array<typeof spaRoomTurnoverTasks.$inferSelect> = [];
    const events: Array<ReturnType<typeof buildEventFromContext>> = [];

    // Create cleanup task (due immediately after appointment ends)
    if (validated.cleanupMinutes > 0) {
      const cleanupDueAt = previousEnd;

      const [cleanupTask] = await tx
        .insert(spaRoomTurnoverTasks)
        .values({
          tenantId: ctx.tenantId,
          resourceId: validated.resourceId,
          appointmentId: validated.appointmentId,
          taskType: 'cleanup',
          status: 'pending',
          dueAt: cleanupDueAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      createdTasks.push(cleanupTask!);

      events.push(
        buildEventFromContext(ctx, SPA_TURNOVER_TASK_CREATED, {
          taskId: cleanupTask!.id,
          resourceId: cleanupTask!.resourceId,
          appointmentId: cleanupTask!.appointmentId,
          taskType: 'cleanup',
          dueAt: cleanupDueAt.toISOString(),
          autoCreated: true,
        }),
      );
    }

    // Create setup task (due after cleanup completes)
    if (validated.setupMinutes > 0) {
      // Setup starts after cleanup duration elapses
      const setupDueAt = new Date(
        previousEnd.getTime() + validated.cleanupMinutes * 60 * 1000,
      );

      const [setupTask] = await tx
        .insert(spaRoomTurnoverTasks)
        .values({
          tenantId: ctx.tenantId,
          resourceId: validated.resourceId,
          appointmentId: validated.appointmentId,
          taskType: 'setup',
          status: 'pending',
          dueAt: setupDueAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      createdTasks.push(setupTask!);

      events.push(
        buildEventFromContext(ctx, SPA_TURNOVER_TASK_CREATED, {
          taskId: setupTask!.id,
          resourceId: setupTask!.resourceId,
          appointmentId: setupTask!.appointmentId,
          taskType: 'setup',
          dueAt: setupDueAt.toISOString(),
          autoCreated: true,
        }),
      );
    }

    if (validated.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        validated.clientRequestId,
        'autoCreateTurnoverTasks',
        createdTasks,
      );
    }

    return { result: createdTasks, events };
  });

  return result;
}
