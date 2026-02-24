/**
 * Clear rate restrictions for a date range on a property.
 * Optionally filtered by room type and/or rate plan.
 */
import { sql, and, eq, gte, lte } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsRateRestrictions, pmsProperties } from '@oppsera/db';
import type { ClearRateRestrictionsInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function clearRateRestrictions(ctx: RequestContext, input: ClearRateRestrictionsInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Validate property
    const [property] = await tx
      .select({ id: pmsProperties.id })
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    // 2. Build conditions
    const conditions = [
      eq(pmsRateRestrictions.tenantId, ctx.tenantId),
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

    // 3. Delete matching restrictions
    const deleted = await tx
      .delete(pmsRateRestrictions)
      .where(and(...conditions))
      .returning({ id: pmsRateRestrictions.id });

    // 4. Audit
    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'rate_restriction', input.propertyId, 'cleared', {
      startDate: input.startDate,
      endDate: input.endDate,
      roomTypeId: input.roomTypeId ?? null,
      ratePlanId: input.ratePlanId ?? null,
      deletedCount: deleted.length,
    });

    // 5. Event
    const event = buildEventFromContext(ctx, PMS_EVENTS.RATE_RESTRICTION_CLEARED, {
      propertyId: input.propertyId,
      startDate: input.startDate,
      endDate: input.endDate,
      roomTypeId: input.roomTypeId ?? null,
      ratePlanId: input.ratePlanId ?? null,
      deletedCount: deleted.length,
    });

    return {
      result: { propertyId: input.propertyId, deletedCount: deleted.length },
      events: [event],
    };
  });

  await auditLog(ctx, 'pms.rate_restriction.cleared', 'pms_rate_restriction', input.propertyId);
  return result;
}
