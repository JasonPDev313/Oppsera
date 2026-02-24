/**
 * Set rate restrictions for specific dates on a property.
 * Upserts restrictions per date — existing restrictions for the same date/roomType/ratePlan combo are replaced.
 */
import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsRateRestrictions, pmsProperties } from '@oppsera/db';
import type { SetRateRestrictionsInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function setRateRestrictions(ctx: RequestContext, input: SetRateRestrictionsInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Validate property
    const [property] = await tx
      .select({ id: pmsProperties.id })
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    // 2. Upsert each date restriction
    const upserted: Array<{ id: string; date: string }> = [];

    for (const dateRestriction of input.dates) {
      // Use raw SQL for upsert with the composite unique constraint
      const id = generateUlid();
      const rows = await tx.execute(sql`
        INSERT INTO pms_rate_restrictions (
          id, tenant_id, property_id, room_type_id, rate_plan_id,
          restriction_date, min_stay, max_stay, cta, ctd, stop_sell,
          created_at, updated_at, created_by
        ) VALUES (
          ${id}, ${ctx.tenantId}, ${input.propertyId},
          ${input.roomTypeId ?? null}, ${input.ratePlanId ?? null},
          ${dateRestriction.date},
          ${dateRestriction.minStay ?? null}, ${dateRestriction.maxStay ?? null},
          ${dateRestriction.cta ?? false}, ${dateRestriction.ctd ?? false}, ${dateRestriction.stopSell ?? false},
          now(), now(), ${ctx.user.id}
        )
        ON CONFLICT (tenant_id, property_id, COALESCE(room_type_id, ''), COALESCE(rate_plan_id, ''), restriction_date)
        DO UPDATE SET
          min_stay = EXCLUDED.min_stay,
          max_stay = EXCLUDED.max_stay,
          cta = EXCLUDED.cta,
          ctd = EXCLUDED.ctd,
          stop_sell = EXCLUDED.stop_sell,
          updated_at = now()
        RETURNING id
      `);
      const arr = Array.from(rows as Iterable<Record<string, unknown>>);
      upserted.push({ id: String(arr[0]?.id ?? id), date: dateRestriction.date });
    }

    // 3. Audit
    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'rate_restriction', input.propertyId, 'set', {
      roomTypeId: input.roomTypeId ?? null,
      ratePlanId: input.ratePlanId ?? null,
      dateCount: input.dates.length,
      dates: input.dates.map((d) => d.date),
    });

    // 4. Event
    const event = buildEventFromContext(ctx, PMS_EVENTS.RATE_RESTRICTION_SET, {
      propertyId: input.propertyId,
      roomTypeId: input.roomTypeId ?? null,
      ratePlanId: input.ratePlanId ?? null,
      dateCount: input.dates.length,
    });

    return {
      result: { propertyId: input.propertyId, upsertedCount: upserted.length },
      events: [event],
    };
  });

  await auditLog(ctx, 'pms.rate_restriction.set', 'pms_rate_restriction', input.propertyId);
  return result;
}
