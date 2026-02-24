import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogItemModifierGroups } from '../schema';

export async function removeItemModifierAssignment(
  ctx: RequestContext,
  catalogItemId: string,
  modifierGroupId: string,
) {
  await publishWithOutbox(ctx, async (tx) => {
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

    await tx
      .delete(catalogItemModifierGroups)
      .where(
        and(
          eq(catalogItemModifierGroups.catalogItemId, catalogItemId),
          eq(catalogItemModifierGroups.modifierGroupId, modifierGroupId),
        ),
      );

    const event = buildEventFromContext(ctx, 'catalog.item_modifier_assignment.removed.v1', {
      catalogItemId,
      modifierGroupId,
    });

    return { result: undefined, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.item_modifier_assignment.removed',
    'catalog_item_modifier_groups',
    `${catalogItemId}/${modifierGroupId}`,
  );
}
