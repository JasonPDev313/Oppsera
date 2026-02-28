import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { fnbKitchenRoutingRules, fnbKitchenStations } from '@oppsera/db';

/**
 * Resolves which KDS station an item should route to.
 *
 * Resolution priority:
 *   1. Routing rule matching catalogItemId (ruleType='item')
 *   2. Routing rule matching subDepartmentId (ruleType='sub_department' or 'department')
 *   3. Routing rule matching departmentId (ruleType='department')
 *   4. Fallback: first active prep/bar station by sortOrder ASC
 *
 * Returns null if no stations exist at all.
 */
export async function resolveStation(
  tx: any,
  tenantId: string,
  locationId: string,
  item: { catalogItemId?: string | null; subDepartmentId?: string | null },
): Promise<string | null> {
  // 1. Try item-level routing rule
  if (item.catalogItemId) {
    const [itemRule] = await tx
      .select({ stationId: fnbKitchenRoutingRules.stationId })
      .from(fnbKitchenRoutingRules)
      .where(
        and(
          eq(fnbKitchenRoutingRules.tenantId, tenantId),
          eq(fnbKitchenRoutingRules.locationId, locationId),
          eq(fnbKitchenRoutingRules.isActive, true),
          eq(fnbKitchenRoutingRules.ruleType, 'item'),
          eq(fnbKitchenRoutingRules.catalogItemId, item.catalogItemId),
        ),
      )
      .orderBy(desc(fnbKitchenRoutingRules.priority))
      .limit(1);
    if (itemRule) return itemRule.stationId;
  }

  // 2. Try sub-department-level routing rule
  if (item.subDepartmentId) {
    const [deptRule] = await tx
      .select({ stationId: fnbKitchenRoutingRules.stationId })
      .from(fnbKitchenRoutingRules)
      .where(
        and(
          eq(fnbKitchenRoutingRules.tenantId, tenantId),
          eq(fnbKitchenRoutingRules.locationId, locationId),
          eq(fnbKitchenRoutingRules.isActive, true),
          inArray(fnbKitchenRoutingRules.ruleType, ['sub_department', 'department']),
          eq(fnbKitchenRoutingRules.subDepartmentId, item.subDepartmentId),
        ),
      )
      .orderBy(desc(fnbKitchenRoutingRules.priority))
      .limit(1);
    if (deptRule) return deptRule.stationId;
  }

  // 3. Fallback: first active prep or bar station
  const [fallback] = await tx
    .select({ id: fnbKitchenStations.id })
    .from(fnbKitchenStations)
    .where(
      and(
        eq(fnbKitchenStations.tenantId, tenantId),
        eq(fnbKitchenStations.locationId, locationId),
        eq(fnbKitchenStations.isActive, true),
      ),
    )
    .orderBy(asc(fnbKitchenStations.sortOrder))
    .limit(1);

  return fallback?.id ?? null;
}
