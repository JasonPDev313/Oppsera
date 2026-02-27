/**
 * Tag Action CRUD Commands
 *
 * Commands for creating, updating, deleting, and reordering tag actions.
 * Tag actions are configurable side-effects triggered on tag apply/remove/expire.
 */

import { eq, and, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tagActions, tags } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { z } from 'zod';

// ── Validation Schemas ────────────────────────────────────────────────────────

export const createTagActionSchema = z.object({
  trigger: z.enum(['on_apply', 'on_remove', 'on_expire']),
  actionType: z.enum([
    'log_activity',
    'set_customer_field',
    'add_to_segment',
    'remove_from_segment',
    'set_service_flag',
    'remove_service_flag',
    'send_notification',
    'adjust_wallet',
    'set_preference',
    'create_alert',
  ]),
  config: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  executionOrder: z.number().int().min(0).max(9999).default(100),
});

export const updateTagActionSchema = z.object({
  trigger: z.enum(['on_apply', 'on_remove', 'on_expire']).optional(),
  actionType: z.enum([
    'log_activity',
    'set_customer_field',
    'add_to_segment',
    'remove_from_segment',
    'set_service_flag',
    'remove_service_flag',
    'send_notification',
    'adjust_wallet',
    'set_preference',
    'create_alert',
  ]).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  executionOrder: z.number().int().min(0).max(9999).optional(),
});

export const reorderTagActionsSchema = z.object({
  /** Array of action IDs in the desired execution order */
  actionIds: z.array(z.string()).min(1),
});

export type CreateTagActionInput = z.input<typeof createTagActionSchema>;
export type UpdateTagActionInput = z.input<typeof updateTagActionSchema>;
export type ReorderTagActionsInput = z.input<typeof reorderTagActionsSchema>;

// ── Commands ──────────────────────────────────────────────────────────────────

export async function createTagAction(
  tenantId: string,
  tagId: string,
  input: CreateTagActionInput,
) {
  return withTenant(tenantId, async (tx) => {
    // Verify tag exists
    const [tag] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.tenantId, tenantId), eq(tags.id, tagId)))
      .limit(1);
    if (!tag) throw new NotFoundError('Tag', tagId);

    const id = generateUlid();
    const [created] = await tx
      .insert(tagActions)
      .values({
        id,
        tenantId,
        tagId,
        trigger: input.trigger,
        actionType: input.actionType,
        config: input.config ?? {},
        isActive: input.isActive ?? true,
        executionOrder: input.executionOrder ?? 100,
      })
      .returning();

    return created!;
  });
}

export async function updateTagAction(
  tenantId: string,
  tagId: string,
  actionId: string,
  input: UpdateTagActionInput,
) {
  return withTenant(tenantId, async (tx) => {
    // Verify action exists
    const [existing] = await tx
      .select({ id: tagActions.id })
      .from(tagActions)
      .where(
        and(
          eq(tagActions.tenantId, tenantId),
          eq(tagActions.tagId, tagId),
          eq(tagActions.id, actionId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('Tag Action', actionId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.trigger !== undefined) updates.trigger = input.trigger;
    if (input.actionType !== undefined) updates.actionType = input.actionType;
    if (input.config !== undefined) updates.config = input.config;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.executionOrder !== undefined) updates.executionOrder = input.executionOrder;

    const [updated] = await tx
      .update(tagActions)
      .set(updates)
      .where(eq(tagActions.id, actionId))
      .returning();

    return updated!;
  });
}

export async function deleteTagAction(
  tenantId: string,
  tagId: string,
  actionId: string,
) {
  return withTenant(tenantId, async (tx) => {
    // Verify action exists
    const [existing] = await tx
      .select({ id: tagActions.id })
      .from(tagActions)
      .where(
        and(
          eq(tagActions.tenantId, tenantId),
          eq(tagActions.tagId, tagId),
          eq(tagActions.id, actionId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('Tag Action', actionId);

    // Hard delete — actions don't need soft-delete
    await tx.delete(tagActions).where(eq(tagActions.id, actionId));

    return { deleted: true };
  });
}

export async function reorderTagActions(
  tenantId: string,
  tagId: string,
  input: ReorderTagActionsInput,
) {
  return withTenant(tenantId, async (tx) => {
    // Verify tag exists
    const [tag] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.tenantId, tenantId), eq(tags.id, tagId)))
      .limit(1);
    if (!tag) throw new NotFoundError('Tag', tagId);

    // Update execution_order for each action based on position in array
    for (let i = 0; i < input.actionIds.length; i++) {
      await tx
        .update(tagActions)
        .set({ executionOrder: (i + 1) * 10, updatedAt: new Date() })
        .where(
          and(
            eq(tagActions.tenantId, tenantId),
            eq(tagActions.tagId, tagId),
            eq(tagActions.id, input.actionIds[i]!),
          ),
        );
    }

    // Return updated list
    const reordered = await tx
      .select()
      .from(tagActions)
      .where(and(eq(tagActions.tenantId, tenantId), eq(tagActions.tagId, tagId)))
      .orderBy(asc(tagActions.executionOrder));

    return reordered;
  });
}
