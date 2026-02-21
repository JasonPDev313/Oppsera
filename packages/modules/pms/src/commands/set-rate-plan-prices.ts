import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsRatePlans, pmsRoomTypes, pmsRatePlanPrices } from '@oppsera/db';
import type { SetRatePlanPriceInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function setRatePlanPrices(
  ctx: RequestContext,
  input: SetRatePlanPriceInput,
) {
  // Validate date range (schema refine already checks endDate > startDate, belt-and-suspenders)
  if (input.endDate <= input.startDate) {
    throw new ValidationError('End date must be after start date', [
      { field: 'endDate', message: 'End date must be after start date' },
    ]);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate rate plan exists and belongs to tenant
    const [ratePlan] = await tx
      .select()
      .from(pmsRatePlans)
      .where(
        and(
          eq(pmsRatePlans.id, input.ratePlanId),
          eq(pmsRatePlans.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!ratePlan) {
      throw new NotFoundError('Rate plan', input.ratePlanId);
    }

    // Validate room type exists and belongs to same property as rate plan
    const [roomType] = await tx
      .select()
      .from(pmsRoomTypes)
      .where(
        and(
          eq(pmsRoomTypes.id, input.roomTypeId),
          eq(pmsRoomTypes.tenantId, ctx.tenantId),
          eq(pmsRoomTypes.propertyId, ratePlan.propertyId),
        ),
      )
      .limit(1);

    if (!roomType) {
      throw new NotFoundError('Room type', input.roomTypeId);
    }

    // Insert new rate price row. On overlap, the latest entry wins
    // (queries pick the row with the most recent createdAt for a given date).
    // No need to delete/update existing rows — append-only semantics.
    const [created] = await tx
      .insert(pmsRatePlanPrices)
      .values({
        tenantId: ctx.tenantId,
        ratePlanId: input.ratePlanId,
        roomTypeId: input.roomTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        nightlyBaseCents: input.nightlyBaseCents,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, ratePlan.propertyId, 'rate_plan_price', created!.id, 'prices_set', {
      nightlyBaseCents: { before: null, after: input.nightlyBaseCents },
      dateRange: { before: null, after: `${input.startDate} to ${input.endDate}` },
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.RATE_PLAN_PRICES_SET, {
      ratePlanPriceId: created!.id,
      ratePlanId: input.ratePlanId,
      roomTypeId: input.roomTypeId,
      propertyId: ratePlan.propertyId,
      startDate: input.startDate,
      endDate: input.endDate,
      nightlyBaseCents: input.nightlyBaseCents,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.rate_plan.prices_set', 'pms_rate_plan_price', result.id);

  return result;
}
