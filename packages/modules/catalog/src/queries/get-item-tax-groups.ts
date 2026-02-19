import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { catalogItemLocationTaxGroups, taxGroups } from '../schema';

export interface ItemTaxGroupAssignment {
  taxGroupId: string;
  taxGroupName: string;
}

export async function getItemTaxGroupsAtLocation(
  tenantId: string,
  locationId: string,
  catalogItemId: string,
): Promise<ItemTaxGroupAssignment[]> {
  return withTenant(tenantId, async (tx) => {
    const assignments = await tx
      .select({ taxGroupId: catalogItemLocationTaxGroups.taxGroupId })
      .from(catalogItemLocationTaxGroups)
      .where(
        and(
          eq(catalogItemLocationTaxGroups.tenantId, tenantId),
          eq(catalogItemLocationTaxGroups.locationId, locationId),
          eq(catalogItemLocationTaxGroups.catalogItemId, catalogItemId),
        ),
      );

    if (assignments.length === 0) return [];

    const groupIds = assignments.map((a) => a.taxGroupId);
    const groups = await tx
      .select()
      .from(taxGroups)
      .where(inArray(taxGroups.id, groupIds));

    return groups.map((g) => ({
      taxGroupId: g.id,
      taxGroupName: g.name,
    }));
  });
}
