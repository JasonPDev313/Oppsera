import { eq, and, asc, isNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  catalogItems,
  catalogCategories,
  catalogModifierGroups,
  catalogModifiers,
  catalogItemModifierGroups,
} from '../schema';

export interface POSCatalogItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  itemType: string;
  defaultPrice: string;
  priceIncludesTax: boolean;
  isTrackable: boolean;
  metadata: Record<string, unknown> | null;
  categoryId: string | null;
}

export interface POSCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface POSModifierOption {
  id: string;
  name: string;
  priceCents: number;
  sortOrder: number;
  isDefault: boolean;
}

export interface POSModifierGroup {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: POSModifierOption[];
}

/** Maps item ID → array of modifier group IDs */
export interface POSItemModifierAssignment {
  catalogItemId: string;
  modifierGroupId: string;
  isDefault: boolean;
}

export interface POSCatalogResult {
  items: POSCatalogItem[];
  categories: POSCategory[];
  modifierGroups: POSModifierGroup[];
  itemModifierAssignments: POSItemModifierAssignment[];
}

/**
 * Lean POS catalog query — returns all active items + categories in one call.
 *
 * Compared to the generic listItems/listCategories queries:
 * - NO 3x LEFT JOIN for category hierarchy names (POS builds hierarchy client-side)
 * - NO COUNT JOIN for item counts (POS doesn't display them)
 * - NO cursor pagination (single query, POS loads all active items)
 * - Selects only the columns POS actually uses
 * - Both queries run in parallel within the same transaction
 */
export async function getCatalogForPOS(tenantId: string): Promise<POSCatalogResult> {
  return withTenant(tenantId, async (tx) => {
    const [items, categories, groups, modifiers, assignments] = await Promise.all([
      tx
        .select({
          id: catalogItems.id,
          name: catalogItems.name,
          sku: catalogItems.sku,
          barcode: catalogItems.barcode,
          itemType: catalogItems.itemType,
          defaultPrice: catalogItems.defaultPrice,
          priceIncludesTax: catalogItems.priceIncludesTax,
          isTrackable: catalogItems.isTrackable,
          metadata: catalogItems.metadata,
          categoryId: catalogItems.categoryId,
        })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.tenantId, tenantId),
            isNull(catalogItems.archivedAt),
          ),
        ),
      tx
        .select({
          id: catalogCategories.id,
          name: catalogCategories.name,
          parentId: catalogCategories.parentId,
          sortOrder: catalogCategories.sortOrder,
        })
        .from(catalogCategories)
        .where(
          and(
            eq(catalogCategories.tenantId, tenantId),
            eq(catalogCategories.isActive, true),
          ),
        )
        .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name)),
      // Modifier groups
      tx
        .select()
        .from(catalogModifierGroups)
        .where(eq(catalogModifierGroups.tenantId, tenantId))
        .orderBy(asc(catalogModifierGroups.name)),
      // All modifiers (active only)
      tx
        .select()
        .from(catalogModifiers)
        .where(
          and(
            eq(catalogModifiers.tenantId, tenantId),
            eq(catalogModifiers.isActive, true),
          ),
        )
        .orderBy(asc(catalogModifiers.sortOrder)),
      // Item-to-modifier-group assignments
      tx
        .select({
          catalogItemId: catalogItemModifierGroups.catalogItemId,
          modifierGroupId: catalogItemModifierGroups.modifierGroupId,
          isDefault: catalogItemModifierGroups.isDefault,
        })
        .from(catalogItemModifierGroups),
    ]);

    // Build modifier groups with options
    const modifierGroups: POSModifierGroup[] = groups.map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType,
      isRequired: g.isRequired,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections ?? 99,
      options: modifiers
        .filter((m) => m.modifierGroupId === g.id)
        .map((m) => ({
          id: m.id,
          name: m.name,
          priceCents: Math.round(parseFloat(m.priceAdjustment || '0') * 100),
          sortOrder: m.sortOrder,
          isDefault: false, // default flag is on the junction, not the modifier itself
        })),
    }));

    return {
      items,
      categories,
      modifierGroups,
      itemModifierAssignments: assignments,
    };
  });
}
