import { eq, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { catalogModifierGroups, catalogModifiers } from '../schema';

export interface ModifierGroupDetail {
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
  modifiers: {
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
  }[];
}

export interface ListModifierGroupsInput {
  tenantId: string;
  categoryId?: string;
  channel?: string;
}

export async function listModifierGroups(
  tenantId: string,
  options?: { categoryId?: string; channel?: string },
): Promise<ModifierGroupDetail[]> {
  return withTenant(tenantId, async (tx) => {
    const groups = await tx
      .select()
      .from(catalogModifierGroups)
      .where(eq(catalogModifierGroups.tenantId, tenantId))
      .orderBy(asc(catalogModifierGroups.sortOrder), asc(catalogModifierGroups.name));

    if (groups.length === 0) return [];

    // Apply in-memory filters (simpler than dynamic SQL for 2 optional filters)
    let filtered = groups;
    if (options?.categoryId) {
      filtered = filtered.filter((g) => g.categoryId === options.categoryId);
    }
    if (options?.channel) {
      filtered = filtered.filter((g) => {
        const vis = (g.channelVisibility as string[]) ?? [];
        return vis.includes(options.channel!);
      });
    }

    if (filtered.length === 0) return [];

    // Fetch all modifiers for these groups in one query
    const allModifiers = await tx
      .select()
      .from(catalogModifiers)
      .where(eq(catalogModifiers.tenantId, tenantId))
      .orderBy(asc(catalogModifiers.sortOrder));

    const filteredIds = new Set(filtered.map((g) => g.id));

    return filtered.map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType,
      isRequired: g.isRequired,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections,
      categoryId: g.categoryId,
      instructionMode: g.instructionMode,
      defaultBehavior: g.defaultBehavior,
      channelVisibility: (g.channelVisibility as string[]) ?? [],
      sortOrder: g.sortOrder,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      modifiers: allModifiers
        .filter((m) => m.modifierGroupId === g.id && filteredIds.has(m.modifierGroupId))
        .map((m) => ({
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
