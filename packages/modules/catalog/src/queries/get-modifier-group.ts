import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { catalogModifierGroups, catalogModifiers, catalogItemModifierGroups } from '../schema';

export interface ModifierGroupFullDetail {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  categoryId: string | null;
  instructionMode: string;
  defaultBehavior: string;
  channelVisibility: string[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  assignmentCount: number;
  modifiers: Array<{
    id: string;
    name: string;
    priceAdjustment: string;
    extraPriceDelta: string | null;
    kitchenLabel: string | null;
    allowNone: boolean;
    allowExtra: boolean;
    allowOnSide: boolean;
    isDefaultOption: boolean;
    sortOrder: number;
    isActive: boolean;
  }>;
}

export async function getModifierGroup(
  tenantId: string,
  modifierGroupId: string,
): Promise<ModifierGroupFullDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [group] = await tx
      .select()
      .from(catalogModifierGroups)
      .where(
        and(
          eq(catalogModifierGroups.id, modifierGroupId),
          eq(catalogModifierGroups.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!group) return null;

    const [modifiers, assignmentCountResult] = await Promise.all([
      tx
        .select()
        .from(catalogModifiers)
        .where(
          and(
            eq(catalogModifiers.modifierGroupId, modifierGroupId),
            eq(catalogModifiers.tenantId, tenantId),
          ),
        )
        .orderBy(catalogModifiers.sortOrder),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(catalogItemModifierGroups)
        .where(eq(catalogItemModifierGroups.modifierGroupId, modifierGroupId)),
    ]);

    return {
      id: group.id,
      name: group.name,
      selectionType: group.selectionType,
      isRequired: group.isRequired,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      categoryId: group.categoryId,
      instructionMode: group.instructionMode,
      defaultBehavior: group.defaultBehavior,
      channelVisibility: (group.channelVisibility as string[]) ?? [],
      sortOrder: group.sortOrder,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      assignmentCount: assignmentCountResult[0]?.count ?? 0,
      modifiers: modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        priceAdjustment: m.priceAdjustment,
        extraPriceDelta: m.extraPriceDelta,
        kitchenLabel: m.kitchenLabel,
        allowNone: m.allowNone,
        allowExtra: m.allowExtra,
        allowOnSide: m.allowOnSide,
        isDefaultOption: m.isDefaultOption,
        sortOrder: m.sortOrder,
        isActive: m.isActive,
      })),
    };
  });
}
