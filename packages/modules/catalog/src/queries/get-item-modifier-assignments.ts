import { eq, and, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { catalogItemModifierGroups, catalogModifierGroups, catalogModifiers } from '../schema';

export interface ItemModifierAssignmentDetail {
  modifierGroupId: string;
  groupName: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  instructionMode: string;
  defaultBehavior: string;
  channelVisibility: string[];
  isDefault: boolean;
  overrideRequired: boolean | null;
  overrideMinSelections: number | null;
  overrideMaxSelections: number | null;
  overrideInstructionMode: string | null;
  promptOrder: number;
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

export async function getItemModifierAssignments(
  tenantId: string,
  catalogItemId: string,
): Promise<ItemModifierAssignmentDetail[]> {
  return withTenant(tenantId, async (tx) => {
    // Get all assignments for this item
    const assignments = await tx
      .select({
        modifierGroupId: catalogItemModifierGroups.modifierGroupId,
        isDefault: catalogItemModifierGroups.isDefault,
        overrideRequired: catalogItemModifierGroups.overrideRequired,
        overrideMinSelections: catalogItemModifierGroups.overrideMinSelections,
        overrideMaxSelections: catalogItemModifierGroups.overrideMaxSelections,
        overrideInstructionMode: catalogItemModifierGroups.overrideInstructionMode,
        promptOrder: catalogItemModifierGroups.promptOrder,
        groupName: catalogModifierGroups.name,
        selectionType: catalogModifierGroups.selectionType,
        isRequired: catalogModifierGroups.isRequired,
        minSelections: catalogModifierGroups.minSelections,
        maxSelections: catalogModifierGroups.maxSelections,
        instructionMode: catalogModifierGroups.instructionMode,
        defaultBehavior: catalogModifierGroups.defaultBehavior,
        channelVisibility: catalogModifierGroups.channelVisibility,
      })
      .from(catalogItemModifierGroups)
      .innerJoin(
        catalogModifierGroups,
        eq(catalogItemModifierGroups.modifierGroupId, catalogModifierGroups.id),
      )
      .where(eq(catalogItemModifierGroups.catalogItemId, catalogItemId))
      .orderBy(
        asc(catalogItemModifierGroups.promptOrder),
        asc(catalogModifierGroups.sortOrder),
      );

    if (assignments.length === 0) return [];

    // Fetch modifiers for all assigned groups
    const groupIds = assignments.map((a) => a.modifierGroupId);
    const allModifiers = await tx
      .select()
      .from(catalogModifiers)
      .where(eq(catalogModifiers.tenantId, tenantId))
      .orderBy(asc(catalogModifiers.sortOrder));

    const modifiersByGroup = new Map<string, typeof allModifiers>();
    for (const mod of allModifiers) {
      if (!groupIds.includes(mod.modifierGroupId)) continue;
      const list = modifiersByGroup.get(mod.modifierGroupId) ?? [];
      list.push(mod);
      modifiersByGroup.set(mod.modifierGroupId, list);
    }

    return assignments.map((a) => ({
      modifierGroupId: a.modifierGroupId,
      groupName: a.groupName,
      selectionType: a.selectionType,
      isRequired: a.isRequired,
      minSelections: a.minSelections,
      maxSelections: a.maxSelections,
      instructionMode: a.instructionMode,
      defaultBehavior: a.defaultBehavior,
      channelVisibility: (a.channelVisibility as string[]) ?? [],
      isDefault: a.isDefault,
      overrideRequired: a.overrideRequired,
      overrideMinSelections: a.overrideMinSelections,
      overrideMaxSelections: a.overrideMaxSelections,
      overrideInstructionMode: a.overrideInstructionMode,
      promptOrder: a.promptOrder,
      modifiers: (modifiersByGroup.get(a.modifierGroupId) ?? []).map((m) => ({
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
    }));
  });
}
