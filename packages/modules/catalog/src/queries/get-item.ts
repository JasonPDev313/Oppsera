import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import {
  catalogItems,
  catalogCategories,
  taxCategories,
  catalogItemModifierGroups,
  catalogModifierGroups,
  catalogModifiers,
  catalogLocationPrices,
} from '../schema';

export interface ItemDetail {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  itemType: string;
  defaultPrice: string;
  cost: string | null;
  categoryId: string | null;
  priceIncludesTax: boolean;
  isTrackable: boolean;
  metadata: Record<string, unknown> | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  category: { id: string; name: string } | null;
  taxCategory: { id: string; name: string; rate: string } | null;
  modifierGroups: {
    id: string;
    name: string;
    selectionType: string;
    isRequired: boolean;
    minSelections: number;
    maxSelections: number | null;
    modifiers: {
      id: string;
      name: string;
      priceAdjustment: string;
      sortOrder: number;
      isActive: boolean;
    }[];
  }[];
  locationPrices: {
    locationId: string;
    price: string;
  }[];
}

export async function getItem(tenantId: string, itemId: string): Promise<ItemDetail> {
  return withTenant(tenantId, async (tx) => {
    // Fetch item
    const [item] = await tx
      .select()
      .from(catalogItems)
      .where(and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, tenantId)))
      .limit(1);

    if (!item) {
      throw new NotFoundError('Item', itemId);
    }

    // Fetch category
    let category: { id: string; name: string } | null = null;
    if (item.categoryId) {
      const [cat] = await tx
        .select({ id: catalogCategories.id, name: catalogCategories.name })
        .from(catalogCategories)
        .where(eq(catalogCategories.id, item.categoryId))
        .limit(1);
      category = cat ?? null;
    }

    // Fetch tax category
    let taxCategory: { id: string; name: string; rate: string } | null = null;
    if (item.taxCategoryId) {
      const [tc] = await tx
        .select({
          id: taxCategories.id,
          name: taxCategories.name,
          rate: taxCategories.rate,
        })
        .from(taxCategories)
        .where(eq(taxCategories.id, item.taxCategoryId))
        .limit(1);
      taxCategory = tc ?? null;
    }

    // Fetch modifier groups via junction — use explicit columns to avoid
    // referencing columns added in migration 0183 that may not exist in the DB yet
    const junctions = await tx
      .select({
        catalogItemId: catalogItemModifierGroups.catalogItemId,
        modifierGroupId: catalogItemModifierGroups.modifierGroupId,
      })
      .from(catalogItemModifierGroups)
      .where(eq(catalogItemModifierGroups.catalogItemId, itemId));

    let modifierGroups: ItemDetail['modifierGroups'] = [];
    if (junctions.length > 0) {
      const groupIds = junctions.map((j) => j.modifierGroupId);
      const groups = await tx
        .select({
          id: catalogModifierGroups.id,
          name: catalogModifierGroups.name,
          selectionType: catalogModifierGroups.selectionType,
          isRequired: catalogModifierGroups.isRequired,
          minSelections: catalogModifierGroups.minSelections,
          maxSelections: catalogModifierGroups.maxSelections,
        })
        .from(catalogModifierGroups)
        .where(inArray(catalogModifierGroups.id, groupIds));

      const modifiers = await tx
        .select({
          id: catalogModifiers.id,
          modifierGroupId: catalogModifiers.modifierGroupId,
          name: catalogModifiers.name,
          priceAdjustment: catalogModifiers.priceAdjustment,
          sortOrder: catalogModifiers.sortOrder,
          isActive: catalogModifiers.isActive,
        })
        .from(catalogModifiers)
        .where(inArray(catalogModifiers.modifierGroupId, groupIds));

      modifierGroups = groups.map((g) => ({
        id: g.id,
        name: g.name,
        selectionType: g.selectionType,
        isRequired: g.isRequired,
        minSelections: g.minSelections,
        maxSelections: g.maxSelections,
        modifiers: modifiers
          .filter((m) => m.modifierGroupId === g.id)
          .map((m) => ({
            id: m.id,
            name: m.name,
            priceAdjustment: m.priceAdjustment,
            sortOrder: m.sortOrder,
            isActive: m.isActive,
          })),
      }));
    }

    // Fetch location price overrides
    const locationPrices = await tx
      .select({
        locationId: catalogLocationPrices.locationId,
        price: catalogLocationPrices.price,
      })
      .from(catalogLocationPrices)
      .where(eq(catalogLocationPrices.catalogItemId, itemId));

    return {
      id: item.id,
      sku: item.sku,
      barcode: item.barcode ?? null,
      name: item.name,
      description: item.description,
      itemType: item.itemType,
      defaultPrice: item.defaultPrice,
      cost: item.cost,
      categoryId: item.categoryId ?? null,
      priceIncludesTax: item.priceIncludesTax,
      isTrackable: item.isTrackable,
      metadata: (item.metadata as Record<string, unknown>) ?? null,
      archivedAt: item.archivedAt ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      createdBy: item.createdBy,
      updatedBy: item.updatedBy,
      category,
      taxCategory,
      modifierGroups,
      locationPrices,
    };
  });
}
