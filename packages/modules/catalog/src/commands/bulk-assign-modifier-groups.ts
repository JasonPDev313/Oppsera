import { eq, and, inArray, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogItems, catalogModifierGroups, catalogItemModifierGroups } from '../schema';
import type { BulkAssignModifierGroupsInput } from '../validation';

export interface BulkAssignResult {
  assignedCount: number;
  skippedCount: number;
}

export async function bulkAssignModifierGroups(
  ctx: RequestContext,
  input: BulkAssignModifierGroupsInput,
): Promise<BulkAssignResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate all item IDs belong to tenant
    const items = await tx
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.tenantId, ctx.tenantId),
          inArray(catalogItems.id, input.itemIds),
        ),
      );

    const validItemIds = new Set(items.map((i) => i.id));
    if (validItemIds.size === 0) {
      throw new AppError('VALIDATION_ERROR', 'No valid items found for the provided IDs', 422);
    }

    // Validate all modifier group IDs belong to tenant
    const groups = await tx
      .select({ id: catalogModifierGroups.id })
      .from(catalogModifierGroups)
      .where(
        and(
          eq(catalogModifierGroups.tenantId, ctx.tenantId),
          inArray(catalogModifierGroups.id, input.modifierGroupIds),
        ),
      );

    const validGroupIds = new Set(groups.map((g) => g.id));
    if (validGroupIds.size === 0) {
      throw new AppError('VALIDATION_ERROR', 'No valid modifier groups found for the provided IDs', 422);
    }

    const overrides = input.overrides;
    let assignedCount = 0;
    let skippedCount = 0;

    // Build all assignment rows
    const rows: Array<{
      catalogItemId: string;
      modifierGroupId: string;
      isDefault: boolean;
      overrideRequired: boolean | null;
      overrideMinSelections: number | null;
      overrideMaxSelections: number | null;
      overrideInstructionMode: string | null;
      promptOrder: number;
    }> = [];

    for (const itemId of validItemIds) {
      for (const groupId of validGroupIds) {
        rows.push({
          catalogItemId: itemId,
          modifierGroupId: groupId,
          isDefault: overrides?.isDefault ?? false,
          overrideRequired: overrides?.overrideRequired ?? null,
          overrideMinSelections: overrides?.overrideMinSelections ?? null,
          overrideMaxSelections: overrides?.overrideMaxSelections ?? null,
          overrideInstructionMode: overrides?.overrideInstructionMode ?? null,
          promptOrder: overrides?.promptOrder ?? 0,
        });
      }
    }

    if (input.mode === 'replace') {
      // Delete all existing assignments for these items + groups
      for (const groupId of validGroupIds) {
        await tx
          .delete(catalogItemModifierGroups)
          .where(
            and(
              inArray(catalogItemModifierGroups.catalogItemId, [...validItemIds]),
              eq(catalogItemModifierGroups.modifierGroupId, groupId),
            ),
          );
      }

      // Insert all
      if (rows.length > 0) {
        await tx.insert(catalogItemModifierGroups).values(rows);
        assignedCount = rows.length;
      }
    } else {
      // Merge mode: insert with ON CONFLICT DO NOTHING
      for (const row of rows) {
        const result = await tx
          .insert(catalogItemModifierGroups)
          .values(row)
          .onConflictDoNothing({
            target: [catalogItemModifierGroups.catalogItemId, catalogItemModifierGroups.modifierGroupId],
          })
          .returning();

        if (result.length > 0) {
          assignedCount++;
        } else {
          skippedCount++;
        }
      }
    }

    const event = buildEventFromContext(ctx, 'catalog.modifier_groups.bulk_assigned.v1', {
      itemCount: validItemIds.size,
      groupCount: validGroupIds.size,
      assignedCount,
      skippedCount,
      mode: input.mode ?? 'merge',
    });

    return { result: { assignedCount, skippedCount }, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.modifier_groups.bulk_assigned',
    'catalog_item_modifier_groups',
    'bulk',
    undefined,
    { assignedCount: result.assignedCount, skippedCount: result.skippedCount },
  );

  return result;
}
