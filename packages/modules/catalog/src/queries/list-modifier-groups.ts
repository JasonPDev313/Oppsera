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
  createdAt: Date;
  updatedAt: Date;
  modifiers: {
    id: string;
    name: string;
    priceAdjustment: string;
    sortOrder: number;
    isActive: boolean;
  }[];
}

export async function listModifierGroups(
  tenantId: string,
): Promise<ModifierGroupDetail[]> {
  return withTenant(tenantId, async (tx) => {
    const groups = await tx
      .select()
      .from(catalogModifierGroups)
      .where(eq(catalogModifierGroups.tenantId, tenantId))
      .orderBy(asc(catalogModifierGroups.name));

    if (groups.length === 0) return [];

    // Fetch all modifiers for these groups in one query
    const allModifiers = await tx
      .select()
      .from(catalogModifiers)
      .where(eq(catalogModifiers.tenantId, tenantId))
      .orderBy(asc(catalogModifiers.sortOrder));

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType,
      isRequired: g.isRequired,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      modifiers: allModifiers
        .filter((m) => m.modifierGroupId === g.id)
        .map((m) => ({
          id: m.id,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
          sortOrder: m.sortOrder,
          isActive: m.isActive,
        })),
    }));
  });
}
