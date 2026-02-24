import { sql, eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, generateUlid } from '@oppsera/shared';
import { pmsPricingRules, pmsProperties, pmsRoomTypes } from '@oppsera/db';
import type { RunPricingEngineInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { computeDynamicRate } from '../helpers/pricing-engine';
import type { PricingRuleRow, PricingContext } from '../helpers/pricing-engine';

export async function runPricingEngine(ctx: RequestContext, input: RunPricingEngineInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate property
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(
        and(
          eq(pmsProperties.id, input.propertyId),
          eq(pmsProperties.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!property) {
      throw new NotFoundError('Property', input.propertyId);
    }

    // Load active pricing rules
    const rules = await tx
      .select()
      .from(pmsPricingRules)
      .where(
        and(
          eq(pmsPricingRules.tenantId, ctx.tenantId),
          eq(pmsPricingRules.propertyId, input.propertyId),
          eq(pmsPricingRules.isActive, true),
        ),
      );

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

    // Load room types for the property
    const roomTypes = await tx
      .select()
      .from(pmsRoomTypes)
      .where(
        and(
          eq(pmsRoomTypes.tenantId, ctx.tenantId),
          eq(pmsRoomTypes.propertyId, input.propertyId),
        ),
      );

    // Get occupancy data for the date range
    const occupancyRows = await tx.execute(sql`
      SELECT business_date, occupancy_pct
      FROM rm_pms_daily_occupancy
      WHERE tenant_id = ${ctx.tenantId}
        AND property_id = ${input.propertyId}
        AND business_date >= ${input.startDate}
        AND business_date <= ${input.endDate}
    `);
    const occupancyMap = new Map<string, number>();
    for (const row of Array.from(occupancyRows as Iterable<Record<string, unknown>>)) {
      occupancyMap.set(String(row.business_date), Number(row.occupancy_pct ?? 0));
    }

    // Load rate plan prices that overlap with the date range
    // pms_rate_plan_prices uses start_date/end_date ranges
    const basePrices = await tx.execute(sql`
      SELECT rpp.rate_plan_id, rpp.room_type_id, rpp.start_date, rpp.end_date, rpp.nightly_base_cents
      FROM pms_rate_plan_prices rpp
      JOIN pms_rate_plans rp ON rp.id = rpp.rate_plan_id
      WHERE rpp.tenant_id = ${ctx.tenantId}
        AND rp.property_id = ${input.propertyId}
        AND rpp.start_date <= ${input.endDate}
        AND rpp.end_date >= ${input.startDate}
    `);
    const basePriceRows = Array.from(basePrices as Iterable<Record<string, unknown>>);

    const today = new Date().toISOString().split('T')[0]!;
    let totalAdjusted = 0;
    let totalDatesProcessed = 0;

    // Iterate through dates
    const startMs = new Date(input.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(input.endDate + 'T00:00:00Z').getTime();

    for (let ms = startMs; ms <= endMs; ms += 86400000) {
      const dateStr = new Date(ms).toISOString().split('T')[0]!;
      const dateObj = new Date(ms);
      const dayOfWeek = dateObj.getUTCDay();
      const leadTimeDays = Math.max(0, Math.floor((ms - new Date(today + 'T00:00:00Z').getTime()) / 86400000));
      const occupancyPct = occupancyMap.get(dateStr) ?? 0;

      for (const roomType of roomTypes) {
        // Find base rate for this room type on this date (date must be within start_date..end_date range)
        const baseRow = basePriceRows.find((r) =>
          String(r.room_type_id) === roomType.id &&
          dateStr >= String(r.start_date) &&
          dateStr <= String(r.end_date),
        );
        if (!baseRow) continue;

        const baseCents = Number(baseRow.nightly_base_cents);

        const context: PricingContext = {
          occupancyPct,
          dayOfWeek,
          leadTimeDays,
          businessDate: dateStr,
          roomTypeId: roomType.id,
        };

        const computed = computeDynamicRate(baseCents, ruleRows, context);

        if (computed.rulesApplied.length > 0) {
          totalAdjusted++;

          // Upsert pricing log
          await tx.execute(sql`
            INSERT INTO pms_pricing_log (id, tenant_id, property_id, room_type_id, business_date, base_rate_cents, adjusted_rate_cents, rules_applied_json)
            VALUES (
              ${generateUlid()},
              ${ctx.tenantId}, ${input.propertyId}, ${roomType.id}, ${dateStr},
              ${computed.baseCents}, ${computed.adjustedCents}, ${JSON.stringify(computed.rulesApplied)}::jsonb
            )
            ON CONFLICT (tenant_id, property_id, room_type_id, business_date)
            DO UPDATE SET
              base_rate_cents = EXCLUDED.base_rate_cents,
              adjusted_rate_cents = EXCLUDED.adjusted_rate_cents,
              rules_applied_json = EXCLUDED.rules_applied_json,
              created_at = now()
          `);
        }

        totalDatesProcessed++;
      }
    }

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'pricing_engine', 'run', 'pricing_engine_run');

    const event = buildEventFromContext(ctx, PMS_EVENTS.PRICING_ENGINE_RUN, {
      propertyId: input.propertyId,
      startDate: input.startDate,
      endDate: input.endDate,
      totalDatesProcessed,
      totalAdjusted,
    });

    return { result: { totalDatesProcessed, totalAdjusted }, events: [event] };
  });

  await auditLog(ctx, 'pms.pricing_engine.run', 'pms_property', input.propertyId);

  return result;
}
