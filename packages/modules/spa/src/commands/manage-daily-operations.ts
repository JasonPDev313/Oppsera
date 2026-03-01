import { eq, and } from 'drizzle-orm';
import { spaDailyOperations } from '@oppsera/db';
import { publishWithOutbox, buildEventFromContext, type RequestContext } from '@oppsera/core';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const openDailyOperationsSchema = z.object({
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  openingChecklist: z.array(
    z.object({ item: z.string().min(1) })
  ).min(1),
});

const updateChecklistItemSchema = z.object({
  dailyOpsId: z.string().min(1),
  checklistType: z.enum(['opening', 'closing']),
  itemIndex: z.number().int().min(0),
  completed: z.boolean(),
});

const addIncidentSchema = z.object({
  dailyOpsId: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
});

const closeDailyOperationsSchema = z.object({
  dailyOpsId: z.string().min(1),
  closingChecklist: z.array(
    z.object({ item: z.string().min(1) })
  ).optional(),
  notes: z.string().optional(),
});

const addDailyNotesSchema = z.object({
  dailyOpsId: z.string().min(1),
  notes: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenDailyOperationsInput = z.input<typeof openDailyOperationsSchema>;
export type UpdateChecklistItemInput = z.input<typeof updateChecklistItemSchema>;
export type AddIncidentInput = z.input<typeof addIncidentSchema>;
export type CloseDailyOperationsInput = z.input<typeof closeDailyOperationsSchema>;
export type AddDailyNotesInput = z.input<typeof addDailyNotesSchema>;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Open the spa for the day. Creates or upserts a daily operations record
 * with the opening checklist. Uses ON CONFLICT on the unique index
 * (tenant_id, location_id, business_date) for idempotency.
 */
export async function openDailyOperations(
  ctx: RequestContext,
  input: OpenDailyOperationsInput,
) {
  const validated = openDailyOperationsSchema.parse(input);

  const checklist = validated.openingChecklist.map((c) => ({
    item: c.item,
    completed: false,
    completedBy: undefined as string | undefined,
  }));

  const result = await publishWithOutbox(ctx, async (tx) => {
    const now = new Date();

    const [row] = await tx
      .insert(spaDailyOperations)
      .values({
        tenantId: ctx.tenantId,
        locationId: validated.locationId,
        businessDate: validated.businessDate,
        openingChecklist: checklist,
        openedBy: ctx.user.id,
        openedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          spaDailyOperations.tenantId,
          spaDailyOperations.locationId,
          spaDailyOperations.businessDate,
        ],
        set: {
          openingChecklist: checklist,
          openedBy: ctx.user.id,
          openedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    const event = buildEventFromContext(ctx, 'spa.daily_operations.opened.v1', {
      dailyOpsId: row!.id,
      locationId: validated.locationId,
      businessDate: validated.businessDate,
    });

    return { result: row!, events: [event] };
  });

  return result;
}

/**
 * Toggle a checklist item (opening or closing) at the given index.
 * Sets completedBy to the current user when marking as completed.
 */
export async function updateChecklistItem(
  ctx: RequestContext,
  input: UpdateChecklistItemInput,
) {
  const validated = updateChecklistItemSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaDailyOperations)
      .where(
        and(
          eq(spaDailyOperations.id, validated.dailyOpsId),
          eq(spaDailyOperations.tenantId, ctx.tenantId),
        ),
      );

    if (!existing) {
      throw new Error(`Daily operations record not found: ${validated.dailyOpsId}`);
    }

    const column =
      validated.checklistType === 'opening' ? 'openingChecklist' : 'closingChecklist';

    const checklist = (existing[column] ?? []) as Array<{
      item: string;
      completed: boolean;
      completedBy?: string;
    }>;

    if (validated.itemIndex >= checklist.length) {
      throw new Error(
        `Checklist item index ${validated.itemIndex} out of range (length: ${checklist.length})`,
      );
    }

    checklist[validated.itemIndex] = {
      ...checklist[validated.itemIndex]!,
      completed: validated.completed,
      completedBy: validated.completed ? ctx.user.id : undefined,
    };

    const [updated] = await tx
      .update(spaDailyOperations)
      .set({
        [column]: checklist,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaDailyOperations.id, validated.dailyOpsId),
          eq(spaDailyOperations.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'spa.daily_operations.checklist_updated.v1', {
      dailyOpsId: validated.dailyOpsId,
      checklistType: validated.checklistType,
      itemIndex: validated.itemIndex,
      completed: validated.completed,
    });

    return { result: updated!, events: [event] };
  });

  return result;
}

/**
 * Add an incident to the day's record. Appends to the incidents JSONB array
 * with reportedBy from the current user and the current timestamp.
 */
export async function addIncident(
  ctx: RequestContext,
  input: AddIncidentInput,
) {
  const validated = addIncidentSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaDailyOperations)
      .where(
        and(
          eq(spaDailyOperations.id, validated.dailyOpsId),
          eq(spaDailyOperations.tenantId, ctx.tenantId),
        ),
      );

    if (!existing) {
      throw new Error(`Daily operations record not found: ${validated.dailyOpsId}`);
    }

    const incidents = (existing.incidents ?? []) as Array<{
      description: string;
      severity: string;
      reportedBy: string;
      reportedAt: string;
    }>;

    incidents.push({
      description: validated.description,
      severity: validated.severity,
      reportedBy: ctx.user.id,
      reportedAt: new Date().toISOString(),
    });

    const [updated] = await tx
      .update(spaDailyOperations)
      .set({
        incidents,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaDailyOperations.id, validated.dailyOpsId),
          eq(spaDailyOperations.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'spa.daily_operations.incident_added.v1', {
      dailyOpsId: validated.dailyOpsId,
      severity: validated.severity,
      description: validated.description,
    });

    return { result: updated!, events: [event] };
  });

  return result;
}

/**
 * Close the spa for the day. Sets closedBy and closedAt. Optionally sets a
 * closing checklist and notes. Validates that the record is not already closed.
 */
export async function closeDailyOperations(
  ctx: RequestContext,
  input: CloseDailyOperationsInput,
) {
  const validated = closeDailyOperationsSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaDailyOperations)
      .where(
        and(
          eq(spaDailyOperations.id, validated.dailyOpsId),
          eq(spaDailyOperations.tenantId, ctx.tenantId),
        ),
      );

    if (!existing) {
      throw new Error(`Daily operations record not found: ${validated.dailyOpsId}`);
    }

    if (existing.closedAt) {
      throw new Error('Daily operations already closed');
    }

    const now = new Date();

    const closingChecklist = validated.closingChecklist
      ? validated.closingChecklist.map((c) => ({
          item: c.item,
          completed: false,
          completedBy: undefined as string | undefined,
        }))
      : existing.closingChecklist;

    const [updated] = await tx
      .update(spaDailyOperations)
      .set({
        closedBy: ctx.user.id,
        closedAt: now,
        closingChecklist: closingChecklist ?? undefined,
        notes: validated.notes ?? existing.notes,
        updatedAt: now,
      })
      .where(
        and(
          eq(spaDailyOperations.id, validated.dailyOpsId),
          eq(spaDailyOperations.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'spa.daily_operations.closed.v1', {
      dailyOpsId: validated.dailyOpsId,
      locationId: existing.locationId,
      businessDate: existing.businessDate,
    });

    return { result: updated!, events: [event] };
  });

  return result;
}

/**
 * Add or update notes for the day's daily operations record.
 */
export async function addDailyNotes(
  ctx: RequestContext,
  input: AddDailyNotesInput,
) {
  const validated = addDailyNotesSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaDailyOperations)
      .where(
        and(
          eq(spaDailyOperations.id, validated.dailyOpsId),
          eq(spaDailyOperations.tenantId, ctx.tenantId),
        ),
      );

    if (!existing) {
      throw new Error(`Daily operations record not found: ${validated.dailyOpsId}`);
    }

    const [updated] = await tx
      .update(spaDailyOperations)
      .set({
        notes: validated.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaDailyOperations.id, validated.dailyOpsId),
          eq(spaDailyOperations.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'spa.daily_operations.notes_updated.v1', {
      dailyOpsId: validated.dailyOpsId,
      notes: validated.notes,
    });

    return { result: updated!, events: [event] };
  });

  return result;
}
