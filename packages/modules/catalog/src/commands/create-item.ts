import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { ConflictError, NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  catalogItems,
  catalogCategories,
  taxCategories,
  catalogModifierGroups,
  catalogItemModifierGroups,
} from '../schema';
import type { CreateItemInput } from '../validation';
import { logItemChange } from '../services/item-change-log';

export async function createItem(ctx: RequestContext, input: CreateItemInput) {
  const item = await publishWithOutbox(ctx, async (tx) => {
    // Validate category reference
    if (input.categoryId) {
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
    if (input.taxCategoryId) {
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
    if (input.sku) {
      const existing = await tx
        .select()
        .from(catalogItems)
        .where(
          and(eq(catalogItems.tenantId, ctx.tenantId), eq(catalogItems.sku, input.sku)),
        )
        .limit(1);

      if (existing.length > 0) {
        throw new ConflictError(`Item with SKU "${input.sku}" already exists`);
      }
    }

    // Validate barcode uniqueness
    if (input.barcode) {
      const existing = await tx
        .select()
        .from(catalogItems)
        .where(
          and(eq(catalogItems.tenantId, ctx.tenantId), eq(catalogItems.barcode, input.barcode)),
        )
        .limit(1);

      if (existing.length > 0) {
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

    // Insert item
    const [created] = await tx
      .insert(catalogItems)
      .values({
        tenantId: ctx.tenantId,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        name: input.name,
        description: input.description ?? null,
        itemType: input.itemType,
        defaultPrice: String(input.defaultPrice),
        cost: input.cost != null ? String(input.cost) : null,
        categoryId: input.categoryId ?? null,
        taxCategoryId: input.taxCategoryId ?? null,
        isTrackable: input.isTrackable,
        metadata: input.metadata ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    // Insert modifier group junctions (with isDefault flag)
    if (input.modifierGroupIds && input.modifierGroupIds.length > 0) {
      const defaultIds = new Set(input.defaultModifierGroupIds ?? []);
      await tx.insert(catalogItemModifierGroups).values(
        input.modifierGroupIds.map((mgId) => ({
          catalogItemId: created!.id,
          modifierGroupId: mgId,
          isDefault: defaultIds.has(mgId),
        })),
      );
    }

    // Log creation snapshot (before=null → all fields recorded)
    await logItemChange(tx, {
      tenantId: ctx.tenantId,
      itemId: created!.id,
      before: null,
      after: created!,
      userId: ctx.user.id,
      actionType: 'CREATED',
      source: 'UI',
    });

    const event = buildEventFromContext(
      ctx,
      'catalog.item.created.v1',
      {
        itemId: created!.id,
        sku: created!.sku,
        name: created!.name,
        itemType: created!.itemType,
        defaultPrice: Number(created!.defaultPrice),
        cost: created!.cost != null ? Number(created!.cost) : null,
        categoryId: created!.categoryId,
        taxCategoryId: created!.taxCategoryId,
        isTrackable: created!.isTrackable,
      },
      `${ctx.tenantId}:catalog_item:${input.sku || input.name}:created`,
    );

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'catalog.item.created', 'catalog_item', item.id);

  return item;
}
