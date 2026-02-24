import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogItemModifierGroups } from '../schema';
import type { UpdateItemModifierAssignmentInput } from '../validation';

export async function updateItemModifierAssignment(
  ctx: RequestContext,
  catalogItemId: string,
  modifierGroupId: string,
  input: UpdateItemModifierAssignmentInput,
) {
  const assignment = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(catalogItemModifierGroups)
      .where(
        and(
          eq(catalogItemModifierGroups.catalogItemId, catalogItemId),
          eq(catalogItemModifierGroups.modifierGroupId, modifierGroupId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Modifier assignment', `${catalogItemId}/${modifierGroupId}`);
    }

    const updates: Record<string, unknown> = {};
    if (input.isDefault !== undefined) updates.isDefault = input.isDefault;
    if (input.overrideRequired !== undefined) updates.overrideRequired = input.overrideRequired;
    if (input.overrideMinSelections !== undefined) updates.overrideMinSelections = input.overrideMinSelections;
    if (input.overrideMaxSelections !== undefined) updates.overrideMaxSelections = input.overrideMaxSelections;
    if (input.overrideInstructionMode !== undefined) updates.overrideInstructionMode = input.overrideInstructionMode;
    if (input.promptOrder !== undefined) updates.promptOrder = input.promptOrder;

    if (Object.keys(updates).length === 0) {
      return { result: existing, events: [] };
    }

    const [updated] = await tx
      .update(catalogItemModifierGroups)
      .set(updates)
      .where(
        and(
          eq(catalogItemModifierGroups.catalogItemId, catalogItemId),
          eq(catalogItemModifierGroups.modifierGroupId, modifierGroupId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'catalog.item_modifier_assignment.updated.v1', {
      catalogItemId,
      modifierGroupId,
      changes: updates,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.item_modifier_assignment.updated',
    'catalog_item_modifier_groups',
    `${catalogItemId}/${modifierGroupId}`,
  );

  return assignment;
}
