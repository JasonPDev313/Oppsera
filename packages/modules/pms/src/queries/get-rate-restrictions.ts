/**
 * Query rate restrictions for a property within a date range.
 * Optionally filtered by room type and/or rate plan.
 */
import { and, eq, gte, lte, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsRateRestrictions } from '@oppsera/db';

export interface RateRestrictionRow {
  id: string;
  propertyId: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
  restrictionDate: string;
  minStay: number | null;
  maxStay: number | null;
  cta: boolean;
  ctd: boolean;
  stopSell: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GetRateRestrictionsInput {
  tenantId: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  roomTypeId?: string;
  ratePlanId?: string;
}

export async function getRateRestrictions(
  input: GetRateRestrictionsInput,
): Promise<RateRestrictionRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(pmsRateRestrictions.tenantId, input.tenantId),
      eq(pmsRateRestrictions.propertyId, input.propertyId),
      gte(pmsRateRestrictions.restrictionDate, input.startDate),
      lte(pmsRateRestrictions.restrictionDate, input.endDate),
    ];

    if (input.roomTypeId) {
      conditions.push(eq(pmsRateRestrictions.roomTypeId, input.roomTypeId));
    }
    if (input.ratePlanId) {
      conditions.push(eq(pmsRateRestrictions.ratePlanId, input.ratePlanId));
    }

    const rows = await tx
      .select()
      .from(pmsRateRestrictions)
      .where(and(...conditions))
      .orderBy(asc(pmsRateRestrictions.restrictionDate));

    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      roomTypeId: r.roomTypeId,
      ratePlanId: r.ratePlanId,
      restrictionDate: r.restrictionDate,
      minStay: r.minStay,
      maxStay: r.maxStay,
      cta: r.cta,
      ctd: r.ctd,
      stopSell: r.stopSell,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}
