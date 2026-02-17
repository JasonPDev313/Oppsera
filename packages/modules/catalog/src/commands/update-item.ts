import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import { NotFoundError, ConflictError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  catalogItems,
  catalogCategories,
  taxCategories,
  catalogModifierGroups,
  catalogItemModifierGroups,
} from '../schema';
import type { UpdateItemInput } from '../validation';

export async function updateItem(
  ctx: RequestContext,
  itemId: string,
  input: UpdateItemInput,
) {
  const { item, changes } = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing item
    const [existing] = await tx
      .select()
      .from(catalogItems)
      .where(
        and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, ctx.tenantId)),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Catalog item', itemId);
    }

    if (!existing.isActive) {
      throw new AppError('ITEM_INACTIVE', 'Cannot update an inactive item', 400);
    }

    // Validate category reference
    if (input.categoryId !== undefined && input.categoryId !== null) {
      const cat = await tx
        .select()
        .from(catalogCategories)
        .where(
          and(
            eq(catalogCategories.id, input.categoryId),
            eq(catalogCategories.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (cat.length === 0) {
        throw new NotFoundError('Category', input.categoryId);
      }
    }

    // Validate tax category reference
    if (input.taxCategoryId !== undefined && input.taxCategoryId !== null) {
      const tc = await tx
        .select()
        .from(taxCategories)
        .where(
          and(
            eq(taxCategories.id, input.taxCategoryId),
            eq(taxCategories.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (tc.length === 0) {
        throw new NotFoundError('Tax category', input.taxCategoryId);
      }
    }

    // Validate SKU uniqueness
    if (input.sku !== undefined) {
      const skuConflict = await tx
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.tenantId, ctx.tenantId),
            eq(catalogItems.sku, input.sku),
          ),
        )
        .limit(1);

      if (skuConflict.length > 0 && skuConflict[0]!.id !== itemId) {
        throw new ConflictError(`Item with SKU "${input.sku}" already exists`);
      }
    }

    // Validate barcode uniqueness
    if (input.barcode !== undefined && input.barcode !== null) {
      const barcodeConflict = await tx
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.tenantId, ctx.tenantId),
            eq(catalogItems.barcode, input.barcode),
          ),
        )
        .limit(1);

      if (barcodeConflict.length > 0 && barcodeConflict[0]!.id !== itemId) {
        throw new ConflictError(`Item with barcode "${input.barcode}" already exists`);
      }
    }

    // Validate modifier groups
    if (input.modifierGroupIds && input.modifierGroupIds.length > 0) {
      const groups = await tx
        .select()
        .from(catalogModifierGroups)
        .where(
          and(
            inArray(catalogModifierGroups.id, input.modifierGroupIds),
            eq(catalogModifierGroups.tenantId, ctx.tenantId),
          ),
        );

      if (groups.length !== input.modifierGroupIds.length) {
        throw new NotFoundError('Modifier group');
      }
    }

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = {
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    };
    if (input.sku !== undefined) updates.sku = input.sku;
    if (input.barcode !== undefined) updates.barcode = input.barcode;
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.itemType !== undefined) updates.itemType = input.itemType;
    if (input.defaultPrice !== undefined)
      updates.defaultPrice = String(input.defaultPrice);
    if (input.cost !== undefined)
      updates.cost = input.cost != null ? String(input.cost) : null;
    if (input.categoryId !== undefined) updates.categoryId = input.categoryId;
    if (input.taxCategoryId !== undefined) updates.taxCategoryId = input.taxCategoryId;
    if (input.isTrackable !== undefined) updates.isTrackable = input.isTrackable;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    const [updated] = await tx
      .update(catalogItems)
      .set(updates)
      .where(eq(catalogItems.id, itemId))
      .returning();

    // Replace modifier groups if provided (with isDefault flag)
    if (input.modifierGroupIds !== undefined) {
      await tx
        .delete(catalogItemModifierGroups)
        .where(eq(catalogItemModifierGroups.catalogItemId, itemId));

      if (input.modifierGroupIds.length > 0) {
        const defaultIds = new Set(input.defaultModifierGroupIds ?? []);
        await tx.insert(catalogItemModifierGroups).values(
          input.modifierGroupIds.map((mgId) => ({
            catalogItemId: itemId,
            modifierGroupId: mgId,
            isDefault: defaultIds.has(mgId),
          })),
        );
      }
    }

    // Compute changes for event + audit
    const oldForDiff: Record<string, unknown> = {
      sku: existing.sku,
      name: existing.name,
      description: existing.description,
      itemType: existing.itemType,
      defaultPrice: Number(existing.defaultPrice),
      cost: existing.cost != null ? Number(existing.cost) : null,
      categoryId: existing.categoryId,
      taxCategoryId: existing.taxCategoryId,
      isTrackable: existing.isTrackable,
    };
    const newForDiff: Record<string, unknown> = {
      sku: updated!.sku,
      name: updated!.name,
      description: updated!.description,
      itemType: updated!.itemType,
      defaultPrice: Number(updated!.defaultPrice),
      cost: updated!.cost != null ? Number(updated!.cost) : null,
      categoryId: updated!.categoryId,
      taxCategoryId: updated!.taxCategoryId,
      isTrackable: updated!.isTrackable,
    };

    const detectedChanges = computeChanges(oldForDiff, newForDiff, []);

    const event = buildEventFromContext(ctx, 'catalog.item.updated.v1', {
      itemId,
      changes: detectedChanges ?? {},
    });

    return { result: { item: updated!, changes: detectedChanges }, events: [event] };
  });

  await auditLog(ctx, 'catalog.item.updated', 'catalog_item', itemId, changes);

  return item;
}
