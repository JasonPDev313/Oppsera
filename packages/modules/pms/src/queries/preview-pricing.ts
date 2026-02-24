import { sql, eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsPricingRules, pmsRoomTypes } from '@oppsera/db';
import { computeDynamicRate } from '../helpers/pricing-engine';
import type { PricingRuleRow, PricingContext } from '../helpers/pricing-engine';

export interface PricingPreviewDay {
  businessDate: string;
  roomTypeId: string;
  roomTypeName: string;
  baseCents: number;
  adjustedCents: number;
  rulesApplied: Array<{ ruleId: string; ruleName: string; adjustment: number }>;
}

export async function previewPricing(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  roomTypeId?: string,
): Promise<PricingPreviewDay[]> {
  return withTenant(tenantId, async (tx) => {
    // Load active rules
    const rules = await tx.select().from(pmsPricingRules)
      .where(and(
        eq(pmsPricingRules.tenantId, tenantId),
        eq(pmsPricingRules.propertyId, propertyId),
        eq(pmsPricingRules.isActive, true),
      ));

    const ruleRows: PricingRuleRow[] = rules.map((r) => ({
      id: r.id,
      name: r.name,
      ruleType: r.ruleType,
      priority: r.priority,
      conditionsJson: (r.conditionsJson ?? {}) as Record<string, unknown>,
      adjustmentsJson: (r.adjustmentsJson ?? {}) as Record<string, unknown>,
      floorCents: r.floorCents,
      ceilingCents: r.ceilingCents,
    }));

    // Load room types
    const rtConditions = [
      eq(pmsRoomTypes.tenantId, tenantId),
      eq(pmsRoomTypes.propertyId, propertyId),
      eq(pmsRoomTypes.isActive, true),
    ];
    if (roomTypeId) {
      rtConditions.push(eq(pmsRoomTypes.id, roomTypeId));
    }
    const roomTypes = await tx.select().from(pmsRoomTypes).where(and(...rtConditions));

    // Get occupancy data
    const occupancyRows = await tx.execute(sql`
      SELECT business_date, occupancy_pct
      FROM rm_pms_daily_occupancy
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
    `);
    const occupancyArr = Array.from(occupancyRows as Iterable<Record<string, unknown>>);
    const occupancyMap = new Map<string, number>();
    for (const row of occupancyArr) {
      occupancyMap.set(String(row.business_date), Number(row.occupancy_pct ?? 0));
    }

    // Get base prices — uses start_date/end_date ranges, not per-date rows
    const basePriceRows = await tx.execute(sql`
      SELECT rpp.rate_plan_id, rpp.room_type_id, rpp.start_date, rpp.end_date,
             rpp.nightly_base_cents
      FROM pms_rate_plan_prices rpp
      JOIN pms_rate_plans rp ON rp.id = rpp.rate_plan_id AND rp.tenant_id = rpp.tenant_id
      WHERE rpp.tenant_id = ${tenantId}
        AND rp.property_id = ${propertyId}
        AND rpp.start_date <= ${endDate}
        AND rpp.end_date > ${startDate}
    `);
    const basePriceArr = Array.from(basePriceRows as Iterable<Record<string, unknown>>);

    const today = new Date().toISOString().split('T')[0]!;
    const results: PricingPreviewDay[] = [];

    const startMs = new Date(startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(endDate + 'T00:00:00Z').getTime();

    for (let ms = startMs; ms <= endMs; ms += 86400000) {
      const dateStr = new Date(ms).toISOString().split('T')[0]!;
      const dateObj = new Date(ms);
      const dayOfWeek = dateObj.getUTCDay();
      const leadTimeDays = Math.max(0, Math.floor((ms - new Date(today + 'T00:00:00Z').getTime()) / 86400000));
      const occupancyPct = occupancyMap.get(dateStr) ?? 0;

      for (const rt of roomTypes) {
        // Find the applicable base price — date range overlap: start_date <= dateStr AND end_date > dateStr
        const baseRow = basePriceArr.find((r) =>
          String(r.room_type_id) === rt.id &&
          String(r.start_date) <= dateStr &&
          String(r.end_date) > dateStr,
        );
        if (!baseRow) continue;

        const baseCents = Number(baseRow.nightly_base_cents);
        const context: PricingContext = {
          occupancyPct,
          dayOfWeek,
          leadTimeDays,
          businessDate: dateStr,
          roomTypeId: rt.id,
        };

        const computed = computeDynamicRate(baseCents, ruleRows, context);
        results.push({
          businessDate: dateStr,
          roomTypeId: rt.id,
          roomTypeName: rt.name,
          baseCents: computed.baseCents,
          adjustedCents: computed.adjustedCents,
          rulesApplied: computed.rulesApplied,
        });
      }
    }

    return results;
  });
}
