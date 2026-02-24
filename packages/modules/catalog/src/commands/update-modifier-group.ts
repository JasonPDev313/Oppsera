import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogModifierGroups, catalogModifiers, catalogModifierGroupCategories } from '../schema';
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

    // Validate category if being changed
    if (input.categoryId !== undefined && input.categoryId !== null) {
      const [cat] = await tx
        .select({ id: catalogModifierGroupCategories.id })
        .from(catalogModifierGroupCategories)
        .where(
          and(
            eq(catalogModifierGroupCategories.id, input.categoryId),
            eq(catalogModifierGroupCategories.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!cat) {
        throw new NotFoundError('Modifier group category', input.categoryId);
      }
    }

    // Update group fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.selectionType !== undefined) updates.selectionType = input.selectionType;
    if (input.isRequired !== undefined) updates.isRequired = input.isRequired;
    if (input.minSelections !== undefined) updates.minSelections = input.minSelections;
    if (input.maxSelections !== undefined) updates.maxSelections = input.maxSelections;
    if (input.categoryId !== undefined) updates.categoryId = input.categoryId;
    if (input.instructionMode !== undefined) updates.instructionMode = input.instructionMode;
    if (input.defaultBehavior !== undefined) updates.defaultBehavior = input.defaultBehavior;
    if (input.channelVisibility !== undefined) updates.channelVisibility = input.channelVisibility;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

    const [updated] = await tx
      .update(catalogModifierGroups)
      .set(updates)
      .where(eq(catalogModifierGroups.id, modifierGroupId))
      .returning();

    // Handle modifiers if provided
    if (input.modifiers !== undefined) {
      const existingModifiers = await tx
        .select()
        .from(catalogModifiers)
        .where(eq(catalogModifiers.modifierGroupId, modifierGroupId));

      const providedIds = new Set(input.modifiers.filter((m) => m.id).map((m) => m.id));

      // Deactivate modifiers not in the new list
      for (const em of existingModifiers) {
        if (!providedIds.has(em.id)) {
          await tx
            .update(catalogModifiers)
            .set({ isActive: false })
            .where(eq(catalogModifiers.id, em.id));
        }
      }

      // Update or create modifiers
      for (const mod of input.modifiers) {
        const modValues = {
          name: mod.name,
          priceAdjustment: String(mod.priceAdjustment),
          extraPriceDelta: mod.extraPriceDelta != null ? String(mod.extraPriceDelta) : null,
          kitchenLabel: mod.kitchenLabel ?? null,
          allowNone: mod.allowNone ?? true,
          allowExtra: mod.allowExtra ?? true,
          allowOnSide: mod.allowOnSide ?? true,
          isDefaultOption: mod.isDefaultOption ?? false,
          sortOrder: mod.sortOrder,
          isActive: mod.isActive ?? true,
        };

        if (mod.id) {
          await tx
            .update(catalogModifiers)
            .set(modValues)
            .where(eq(catalogModifiers.id, mod.id));
        } else {
          await tx.insert(catalogModifiers).values({
            tenantId: ctx.tenantId,
            modifierGroupId,
            ...modValues,
          });
        }
      }
    }

    const detectedChanges = computeChanges(
      {
        name: existing.name,
        selectionType: existing.selectionType,
        instructionMode: existing.instructionMode,
        defaultBehavior: existing.defaultBehavior,
      },
      {
        name: updated!.name,
        selectionType: updated!.selectionType,
        instructionMode: updated!.instructionMode,
        defaultBehavior: updated!.defaultBehavior,
      },
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
