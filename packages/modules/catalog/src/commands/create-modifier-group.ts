import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogModifierGroups, catalogModifiers } from '../schema';
import type { CreateModifierGroupInput } from '../validation';

export async function createModifierGroup(
  ctx: RequestContext,
  input: CreateModifierGroupInput,
) {
  const group = await publishWithOutbox(ctx, async (tx) => {
    const [created] = await tx
      .insert(catalogModifierGroups)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        selectionType: input.selectionType,
        isRequired: input.isRequired,
        minSelections: input.minSelections,
        maxSelections: input.maxSelections ?? null,
      })
      .returning();

    // Insert all modifiers
    const modifierRows = input.modifiers.map((m) => ({
      tenantId: ctx.tenantId,
      modifierGroupId: created!.id,
      name: m.name,
      priceAdjustment: String(m.priceAdjustment),
      sortOrder: m.sortOrder,
    }));

    await tx.insert(catalogModifiers).values(modifierRows);

    const event = buildEventFromContext(ctx, 'catalog.modifier_group.created.v1', {
      modifierGroupId: created!.id,
      name: created!.name,
      selectionType: created!.selectionType,
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
