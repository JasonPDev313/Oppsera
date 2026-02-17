import { eq, and, inArray, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { taxGroups, taxGroupRates, taxRates } from '../schema';

export interface TaxGroupWithRates {
  id: string;
  name: string;
  locationId: string;
  calculationMode: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  rates: Array<{ id: string; name: string; rateDecimal: number }>;
  totalRate: number;
}

export async function listTaxGroups(
  tenantId: string,
  locationId: string,
): Promise<TaxGroupWithRates[]> {
  return withTenant(tenantId, async (tx) => {
    const groups = await tx
      .select()
      .from(taxGroups)
      .where(
        and(eq(taxGroups.tenantId, tenantId), eq(taxGroups.locationId, locationId)),
      )
      .orderBy(asc(taxGroups.name));

    if (groups.length === 0) return [];

    const groupIds = groups.map((g) => g.id);

    // Fetch all group rate associations
    const allGroupRates = await tx
      .select()
      .from(taxGroupRates)
      .where(inArray(taxGroupRates.taxGroupId, groupIds))
      .orderBy(asc(taxGroupRates.sortOrder));

    const rateIds = [...new Set(allGroupRates.map((gr) => gr.taxRateId))];

    let rateMap = new Map<string, { id: string; name: string; rateDecimal: number }>();
    if (rateIds.length > 0) {
      const rates = await tx
        .select()
        .from(taxRates)
        .where(inArray(taxRates.id, rateIds));

      rateMap = new Map(
        rates.map((r) => [r.id, { id: r.id, name: r.name, rateDecimal: Number(r.rateDecimal) }]),
      );
    }

    return groups.map((g) => {
      const groupRateRows = allGroupRates.filter((gr) => gr.taxGroupId === g.id);
      const rates = groupRateRows
        .map((gr) => rateMap.get(gr.taxRateId))
        .filter((r): r is { id: string; name: string; rateDecimal: number } => r !== undefined);

      const totalRate = rates.reduce((sum, r) => sum + r.rateDecimal, 0);

      return {
        id: g.id,
        name: g.name,
        locationId: g.locationId,
        calculationMode: g.calculationMode,
        isActive: g.isActive,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        rates,
        totalRate,
      };
    });
  });
}
