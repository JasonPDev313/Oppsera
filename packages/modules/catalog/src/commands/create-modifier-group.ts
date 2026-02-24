import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogModifierGroups, catalogModifiers, catalogModifierGroupCategories } from '../schema';
import type { CreateModifierGroupInput } from '../validation';

export async function createModifierGroup(
  ctx: RequestContext,
  input: CreateModifierGroupInput,
) {
  const group = await publishWithOutbox(ctx, async (tx) => {
    // Validate category if provided
    if (input.categoryId) {
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

    const [created] = await tx
      .insert(catalogModifierGroups)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        selectionType: input.selectionType,
        isRequired: input.isRequired,
        minSelections: input.minSelections,
        maxSelections: input.maxSelections ?? null,
        categoryId: input.categoryId ?? null,
        instructionMode: input.instructionMode ?? 'none',
        defaultBehavior: input.defaultBehavior ?? 'none',
        channelVisibility: input.channelVisibility ?? ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    // Insert all modifiers
    const modifierRows = input.modifiers.map((m) => ({
      tenantId: ctx.tenantId,
      modifierGroupId: created!.id,
      name: m.name,
      priceAdjustment: String(m.priceAdjustment),
      extraPriceDelta: m.extraPriceDelta != null ? String(m.extraPriceDelta) : null,
      kitchenLabel: m.kitchenLabel ?? null,
      allowNone: m.allowNone ?? true,
      allowExtra: m.allowExtra ?? true,
      allowOnSide: m.allowOnSide ?? true,
      isDefaultOption: m.isDefaultOption ?? false,
      sortOrder: m.sortOrder,
    }));

    await tx.insert(catalogModifiers).values(modifierRows);

    const event = buildEventFromContext(ctx, 'catalog.modifier_group.created.v1', {
      modifierGroupId: created!.id,
      name: created!.name,
      selectionType: created!.selectionType,
      instructionMode: created!.instructionMode,
      modifierCount: input.modifiers.length,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.modifier_group.created',
    'catalog_modifier_group',
    group.id,
  );

  return group;
}
