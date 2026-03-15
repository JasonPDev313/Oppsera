import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogItems } from '@oppsera/db';
import { catalogItemModifierGroups } from '../schema';

/**
 * Batch-update promptOrder for all modifier group assignments on an item.
 * Expects an ordered array of modifierGroupIds — index becomes the new promptOrder.
 *
 * Guards:
 * - Verifies the item belongs to the requesting tenant (prevents cross-tenant writes)
 * - Deduplicates the input array
 * - Silently skips group IDs that are not assigned to the item (no error for extras)
 */
export async function reorderItemModifierAssignments(
  ctx: RequestContext,
  catalogItemId: string,
  orderedGroupIds: string[],
) {
  // Deduplicate while preserving order
  const seen = new Set<string>();
  const uniqueGroupIds: string[] = [];
  for (const id of orderedGroupIds) {
    if (!seen.has(id)) {
      seen.add(id);
      uniqueGroupIds.push(id);
    }
  }

  if (uniqueGroupIds.length === 0) {
    throw new ValidationError('orderedGroupIds must contain at least one unique group ID', []);
  }

  const outboxResult = await publishWithOutbox(ctx, async (tx) => {
    // Verify item belongs to tenant
    const [item] = await tx
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.id, catalogItemId),
          eq(catalogItems.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!item) {
      throw new NotFoundError('Catalog item', catalogItemId);
    }

    // Fetch existing assignments to validate group IDs
    const existing = await tx
      .select({ modifierGroupId: catalogItemModifierGroups.modifierGroupId })
      .from(catalogItemModifierGroups)
      .where(eq(catalogItemModifierGroups.catalogItemId, catalogItemId));

    const existingIds = new Set(existing.map((e) => e.modifierGroupId));
    const validGroupIds = uniqueGroupIds.filter((id) => existingIds.has(id));

    const events = [];

    for (let i = 0; i < validGroupIds.length; i++) {
      const groupId = validGroupIds[i]!;
      await tx
        .update(catalogItemModifierGroups)
        .set({ promptOrder: i })
        .where(
          and(
            eq(catalogItemModifierGroups.catalogItemId, catalogItemId),
            eq(catalogItemModifierGroups.modifierGroupId, groupId),
          ),
        );

      events.push(
        buildEventFromContext(ctx, 'catalog.item_modifier_assignment.updated.v1', {
          catalogItemId,
          modifierGroupId: groupId,
          changes: { promptOrder: i },
        }),
      );
    }

    return { result: { reordered: validGroupIds.length }, events };
  });

  const resultData = outboxResult as unknown as { reordered: number };

  auditLogDeferred(
    ctx,
    'catalog.item_modifier_assignments.reordered',
    'catalog_item_modifier_groups',
    catalogItemId,
  );

  return { reordered: resultData.reordered };
}
