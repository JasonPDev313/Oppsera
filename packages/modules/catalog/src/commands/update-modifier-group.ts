import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogModifierGroups, catalogModifiers } from '../schema';
import type { UpdateModifierGroupInput } from '../validation';

export async function updateModifierGroup(
  ctx: RequestContext,
  modifierGroupId: string,
  input: UpdateModifierGroupInput,
) {
  const { group, changes } = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(catalogModifierGroups)
      .where(
        and(
          eq(catalogModifierGroups.id, modifierGroupId),
          eq(catalogModifierGroups.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Modifier group', modifierGroupId);
    }

    // Update group fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.selectionType !== undefined) updates.selectionType = input.selectionType;
    if (input.isRequired !== undefined) updates.isRequired = input.isRequired;
    if (input.minSelections !== undefined) updates.minSelections = input.minSelections;
    if (input.maxSelections !== undefined) updates.maxSelections = input.maxSelections;

    const [updated] = await tx
      .update(catalogModifierGroups)
      .set(updates)
      .where(eq(catalogModifierGroups.id, modifierGroupId))
      .returning();

    // Handle modifiers if provided
    if (input.modifiers !== undefined) {
      // Get existing modifiers
      const existingModifiers = await tx
        .select()
        .from(catalogModifiers)
        .where(eq(catalogModifiers.modifierGroupId, modifierGroupId));

      const providedIds = new Set(input.modifiers.filter((m) => m.id).map((m) => m.id));

      // Deactivate modifiers not in the new list
      for (const existing of existingModifiers) {
        if (!providedIds.has(existing.id)) {
          await tx
            .update(catalogModifiers)
            .set({ isActive: false })
            .where(eq(catalogModifiers.id, existing.id));
        }
      }

      // Update or create modifiers
      for (const mod of input.modifiers) {
        if (mod.id) {
          await tx
            .update(catalogModifiers)
            .set({
              name: mod.name,
              priceAdjustment: String(mod.priceAdjustment),
              sortOrder: mod.sortOrder,
              isActive: mod.isActive,
            })
            .where(eq(catalogModifiers.id, mod.id));
        } else {
          await tx.insert(catalogModifiers).values({
            tenantId: ctx.tenantId,
            modifierGroupId,
            name: mod.name,
            priceAdjustment: String(mod.priceAdjustment),
            sortOrder: mod.sortOrder,
            isActive: mod.isActive,
          });
        }
      }
    }

    const detectedChanges = computeChanges(
      { name: existing.name, selectionType: existing.selectionType },
      { name: updated!.name, selectionType: updated!.selectionType },
      [],
    );

    const event = buildEventFromContext(ctx, 'catalog.modifier_group.updated.v1', {
      modifierGroupId,
      changes: detectedChanges ?? {},
    });

    return {
      result: { group: updated!, changes: detectedChanges },
      events: [event],
    };
  });

  await auditLog(
    ctx,
    'catalog.modifier_group.updated',
    'catalog_modifier_group',
    modifierGroupId,
    changes,
  );

  return group;
}
