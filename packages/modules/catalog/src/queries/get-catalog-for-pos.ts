import { eq, and, asc, isNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  catalogItems,
  catalogCategories,
  catalogModifierGroups,
  catalogModifiers,
  catalogItemModifierGroups,
  catalogModifierGroupCategories,
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
  extraPriceDeltaCents: number | null;
  kitchenLabel: string | null;
  allowNone: boolean;
  allowExtra: boolean;
  allowOnSide: boolean;
  isDefaultOption: boolean;
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
  instructionMode: string;
  defaultBehavior: string;
  channelVisibility: string[];
  options: POSModifierOption[];
}

/** Maps item ID → array of modifier group IDs with per-assignment overrides */
export interface POSItemModifierAssignment {
  catalogItemId: string;
  modifierGroupId: string;
  isDefault: boolean;
  overrideRequired: boolean | null;
  overrideMinSelections: number | null;
  overrideMaxSelections: number | null;
  overrideInstructionMode: string | null;
  promptOrder: number;
}

export interface POSModifierGroupCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface POSCatalogResult {
  items: POSCatalogItem[];
  categories: POSCategory[];
  modifierGroups: POSModifierGroup[];
  modifierGroupCategories: POSModifierGroupCategory[];
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
 * - All queries run in parallel within the same transaction
 *
 * Optional `channel` filter hides modifier groups not visible on the requesting channel.
 */
export async function getCatalogForPOS(
  tenantId: string,
  options?: { channel?: string },
): Promise<POSCatalogResult> {
  return withTenant(tenantId, async (tx) => {
    const [items, categories, groups, modifiers, assignments, modGroupCategories] = await Promise.all([
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
        .orderBy(asc(catalogModifierGroups.sortOrder), asc(catalogModifierGroups.name)),
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
      // Item-to-modifier-group assignments with override columns
      tx
        .select({
          catalogItemId: catalogItemModifierGroups.catalogItemId,
          modifierGroupId: catalogItemModifierGroups.modifierGroupId,
          isDefault: catalogItemModifierGroups.isDefault,
          overrideRequired: catalogItemModifierGroups.overrideRequired,
          overrideMinSelections: catalogItemModifierGroups.overrideMinSelections,
          overrideMaxSelections: catalogItemModifierGroups.overrideMaxSelections,
          overrideInstructionMode: catalogItemModifierGroups.overrideInstructionMode,
          promptOrder: catalogItemModifierGroups.promptOrder,
        })
        .from(catalogItemModifierGroups),
      // Modifier group categories
      tx
        .select({
          id: catalogModifierGroupCategories.id,
          name: catalogModifierGroupCategories.name,
          parentId: catalogModifierGroupCategories.parentId,
          sortOrder: catalogModifierGroupCategories.sortOrder,
        })
        .from(catalogModifierGroupCategories)
        .where(eq(catalogModifierGroupCategories.tenantId, tenantId))
        .orderBy(asc(catalogModifierGroupCategories.sortOrder)),
    ]);

    // Build modifier groups with options, applying channel filter
    const modifierGroups: POSModifierGroup[] = groups
      .filter((g) => {
        if (!options?.channel) return true;
        const vis = (g.channelVisibility as string[]) ?? [];
        return vis.includes(options.channel);
      })
      .map((g) => ({
        id: g.id,
        name: g.name,
        selectionType: g.selectionType,
        isRequired: g.isRequired,
        minSelections: g.minSelections,
        maxSelections: g.maxSelections ?? 99,
        instructionMode: g.instructionMode,
        defaultBehavior: g.defaultBehavior,
        channelVisibility: (g.channelVisibility as string[]) ?? [],
        options: modifiers
          .filter((m) => m.modifierGroupId === g.id)
          .map((m) => ({
            id: m.id,
            name: m.name,
            priceCents: Math.round(parseFloat(m.priceAdjustment || '0') * 100),
            extraPriceDeltaCents: m.extraPriceDelta != null
              ? Math.round(parseFloat(m.extraPriceDelta) * 100)
              : null,
            kitchenLabel: m.kitchenLabel,
            allowNone: m.allowNone,
            allowExtra: m.allowExtra,
            allowOnSide: m.allowOnSide,
            isDefaultOption: m.isDefaultOption,
            sortOrder: m.sortOrder,
            isDefault: false, // default flag is on the junction, not the modifier itself
          })),
      }));

    return {
      items,
      categories,
      modifierGroups,
      modifierGroupCategories: modGroupCategories,
      itemModifierAssignments: assignments,
    };
  });
}
