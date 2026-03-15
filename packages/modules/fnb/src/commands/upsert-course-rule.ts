import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbCourseRules } from '@oppsera/db';
import { AppError, generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpsertCourseRuleInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { resolveKdsLocationId } from '../services/kds-routing-engine';
import { withEffectiveLocationId } from '../helpers/venue-location';

/**
 * Create or update a course rule at a given scope.
 * Uses UPSERT on (tenant_id, location_id, scope_type, scope_id).
 */
export async function upsertCourseRule(
  ctx: RequestContext,
  input: UpsertCourseRuleInput,
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'Location header is required for course rule operations', 400);
  }

  // Pre-transaction: resolve site → venue (course rules are venue-scoped for KDS)
  const kdsLocation = await resolveKdsLocationId(ctx.tenantId, ctx.locationId);
  if (kdsLocation.warning) {
    throw new AppError('VENUE_REQUIRED', kdsLocation.warning, 400);
  }
  const locationId = kdsLocation.locationId;

  const effectiveCtx = withEffectiveLocationId(ctx, locationId);
  const result = await publishWithOutbox(effectiveCtx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'upsertCourseRule',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as Record<string, unknown>, events: [] };
    }

    // Check for existing rule at this scope
    const [existing] = await tx
      .select()
      .from(fnbCourseRules)
      .where(and(
        eq(fnbCourseRules.tenantId, ctx.tenantId),
        eq(fnbCourseRules.locationId, locationId),
        eq(fnbCourseRules.scopeType, input.scopeType),
        eq(fnbCourseRules.scopeId, input.scopeId),
      ))
      .limit(1);

    const now = new Date();
    let rule: typeof fnbCourseRules.$inferSelect;

    if (existing) {
      // Update existing rule
      const updated = await tx
        .update(fnbCourseRules)
        .set({
          defaultCourseNumber: input.defaultCourseNumber,
          allowedCourseNumbers: input.allowedCourseNumbers,
          lockCourse: input.lockCourse,
          updatedAt: now,
          updatedBy: ctx.user.id,
        })
        .where(eq(fnbCourseRules.id, existing.id))
        .returning();
      rule = updated[0]!;
    } else {
      // Insert new rule
      const inserted = await tx
        .insert(fnbCourseRules)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          locationId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          defaultCourseNumber: input.defaultCourseNumber,
          allowedCourseNumbers: input.allowedCourseNumbers,
          lockCourse: input.lockCourse,
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        })
        .returning();
      rule = inserted[0]!;
    }

    const event = buildEventFromContext(effectiveCtx, FNB_EVENTS.COURSE_RULE_UPSERTED, {
      ruleId: rule.id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      locationId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'upsertCourseRule', rule);

    return { result: rule as unknown as Record<string, unknown>, events: [event] };
  });

  const typedResult = result as unknown as typeof fnbCourseRules.$inferSelect;

  logger.info('[fnb] course rule upserted', {
    domain: 'fnb', tenantId: ctx.tenantId, locationId,
    scopeType: input.scopeType, scopeId: input.scopeId,
    userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.course_rule.upserted', 'fnb_course_rules', typedResult.id);
  return typedResult;
}
